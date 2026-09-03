/**
 * correctionMemory.ts — A-017: transforma uma correção repetida do usuário
 * ("Argos põe 80%", pouco depois "põe 30%") em sinal de preferência, sem
 * nunca virar regra permanente a partir de um único evento.
 *
 * O motor de confiança (services/ai/feedbackProcessor.ts, zona Codex) é puro
 * — sem estado, sem I/O, o próprio arquivo diz pra guardar o estado por
 * fora. Persistência e a decisão de QUANDO algo é "uma correção" ficam aqui,
 * do lado Claude, no mesmo padrão de suspiciousVoiceAttempts.ts (AsyncStorage
 * direto, sem passar por stores/ que é zona Codex).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createPreferenceLearningState,
  processPreferenceFeedback,
  type FeedbackContext,
  type PreferenceLearningState,
  type PreferenceSuggestion,
} from '@/services/ai/feedbackProcessor';

const STATE_KEY = 'argos_correction_learning_state';
const RESOLVED_KEY = 'argos_correction_resolved_suggestions';
/** Corrigir de novo dentro desta janela conta como correção da MESMA ação; fora dela é um comando novo. */
const CORRECTION_WINDOW_MS = 90_000;
/** Sugestão pendente expira sozinha — nunca fica esperando resposta pra sempre. */
const PENDING_SUGGESTION_TTL_MS = 30_000;

type RecentAction = { value: string | number | boolean; at: number };
/** Só em memória (não precisa sobreviver a restart): última ação por dispositivo+propriedade. */
const recentActions = new Map<string, RecentAction>();

let statesCache: Record<string, PreferenceLearningState> | null = null;
let resolvedCache: Set<string> | null = null;

function timeBucketNow(): NonNullable<FeedbackContext['timeBucket']> {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

async function loadStates(): Promise<Record<string, PreferenceLearningState>> {
  if (statesCache) return statesCache;
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    statesCache = raw ? (JSON.parse(raw) as Record<string, PreferenceLearningState>) : {};
  } catch {
    statesCache = {};
  }
  return statesCache;
}

async function saveStates(): Promise<void> {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(statesCache ?? {}));
  } catch {
    // best-effort — aprendizado de preferência não pode derrubar o fluxo de voz.
  }
}

async function loadResolved(): Promise<Set<string>> {
  if (resolvedCache) return resolvedCache;
  try {
    const raw = await AsyncStorage.getItem(RESOLVED_KEY);
    resolvedCache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    resolvedCache = new Set();
  }
  return resolvedCache;
}

async function saveResolved(): Promise<void> {
  try {
    await AsyncStorage.setItem(RESOLVED_KEY, JSON.stringify([...(resolvedCache ?? [])]));
  } catch {
    // idem — best-effort.
  }
}

function suggestionKey(s: PreferenceSuggestion): string {
  return `${s.preferenceKey}|${s.context.timeBucket ?? ''}|${s.context.deviceId ?? ''}|${String(s.value)}`;
}

const BUCKET_LABEL: Record<NonNullable<FeedbackContext['timeBucket']>, string> = {
  morning: 'de manhã',
  afternoon: 'à tarde',
  evening: 'à noite',
  night: 'de madrugada',
};

type PendingCorrectionSuggestion = {
  suggestion: PreferenceSuggestion;
  createdAt: number;
};

let pending: PendingCorrectionSuggestion | null = null;

/** Sugestão pendente de confirmação, se ainda dentro da janela de validade. */
function getPending(): PendingCorrectionSuggestion | null {
  if (pending && Date.now() - pending.createdAt > PENDING_SUGGESTION_TTL_MS) {
    pending = null;
  }
  return pending;
}

/** Há uma pergunta de correção esperando resposta agora? */
export function hasPendingCorrectionSuggestion(): boolean {
  return getPending() !== null;
}

/** Descarta a sugestão pendente sem marcar como resolvida — pode ser perguntada de novo depois. */
export function clearPendingCorrectionSuggestion(): void {
  pending = null;
}

/**
 * Marca a resposta do usuário pra sugestão pendente. `persist: true` (sim ou
 * não) impede que a MESMA sugestão volte a ser perguntada; "agora não" usa
 * `persist: false` — só fecha por agora, pode reaparecer numa correção futura.
 */
async function resolvePending(persist: boolean): Promise<void> {
  const current = getPending();
  if (!current) return;
  if (persist) {
    const resolved = await loadResolved();
    resolved.add(suggestionKey(current.suggestion));
    await saveResolved();
  }
  pending = null;
}

/**
 * Registra a execução bem-sucedida de uma ação de valor (ex.: brilho) num
 * dispositivo. Se for uma correção da ação anterior no MESMO
 * dispositivo+propriedade dentro da janela de tempo, acumula evidência no
 * motor de confiança; quando ele decidir que há evidência e confiança
 * suficientes (nunca com um único evento — ver PREFERENCE_MIN_EVIDENCE em
 * feedbackProcessor.ts), devolve a pergunta pra falar/mostrar ao usuário.
 * Fora isso, devolve null.
 */
export async function recordValueAction(
  deviceId: string,
  property: string,
  value: unknown,
  deviceLabel: string
): Promise<string | null> {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }

  const key = `${deviceId}:${property}`;
  const now = Date.now();
  const prev = recentActions.get(key);
  recentActions.set(key, { value, at: now });

  if (!prev || now - prev.at > CORRECTION_WINDOW_MS || prev.value === value) {
    return null; // comando novo, não correção do anterior
  }

  const context: FeedbackContext = { timeBucket: timeBucketNow(), deviceId, actionType: property };
  const preferenceKey = `value:${property}`;
  const states = await loadStates();
  const stateKey = `${preferenceKey}|${context.timeBucket}|${deviceId}`;
  const current = states[stateKey] ?? createPreferenceLearningState(preferenceKey, context);

  const result = processPreferenceFeedback(current, {
    evidenceId: `corr-${now}-${Math.random().toString(36).slice(2, 8)}`,
    preferenceKey,
    value,
    kind: 'correction',
    context,
    occurredAt: new Date(now).toISOString(),
    reason: `Usuário corrigiu ${property} de ${String(prev.value)} para ${String(value)} pouco depois.`,
  });

  states[stateKey] = result.state;
  statesCache = states;
  await saveStates();

  if (!result.suggestion) return null;

  const resolved = await loadResolved();
  if (resolved.has(suggestionKey(result.suggestion))) return null; // já perguntado e respondido antes

  pending = { suggestion: result.suggestion, createdAt: now };
  const when = BUCKET_LABEL[context.timeBucket ?? 'afternoon'];
  return `Quer que eu use ${String(value)} no(a) ${deviceLabel} normalmente ${when}? Pode dizer sim, não, ou agora não.`;
}

export type CorrectionReply = 'accept' | 'reject' | 'later';

/** Interpreta texto livre como resposta sim/não/agora-não, ou null se não bater com nenhuma. */
export function parseCorrectionReply(text: string): CorrectionReply | null {
  const t = text.trim().toLowerCase();
  if (/^(agora\s+n[aã]o|mais\s+tarde|depois)\b/.test(t)) return 'later';
  if (/^(n[aã]o|nunca|negativo)\b/.test(t)) return 'reject';
  if (/^(sim|s|pode|claro|isso|exato|quero)\b/.test(t)) return 'accept';
  return null;
}

/**
 * Se houver sugestão pendente e `text` for uma resposta reconhecível, aplica
 * a resposta e devolve a frase de confirmação a falar. Devolve null quando
 * não há pendência ou o texto não é uma resposta reconhecível — nesse caso
 * o chamador deve tratar `text` como um comando novo, não uma resposta.
 */
export async function handleCorrectionReply(text: string): Promise<string | null> {
  if (!hasPendingCorrectionSuggestion()) return null;
  const reply = parseCorrectionReply(text);
  if (!reply) {
    clearPendingCorrectionSuggestion();
    return null;
  }
  await resolvePending(reply !== 'later');
  if (reply === 'accept') return 'Combinado, vou lembrar disso.';
  if (reply === 'reject') return 'Ok, não vou sugerir isso de novo.';
  return 'Sem problema, pergunto outra hora.';
}
