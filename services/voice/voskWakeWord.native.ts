/**
 * voskWakeWord.native.ts — detecção de wake word ON-DEVICE via Vosk.
 *
 * Substitui a abordagem anterior (gravar trechos e mandar cada um para o Whisper
 * só para perguntar "foi 'Argos'?"), que era errada na raiz:
 *   - 1 a 3 segundos de latência por checagem, ida e volta pela rede;
 *   - o microfone fechava a cada trecho para poder fechar o arquivo;
 *   - o laço era dirigido por setTimeout do JS, que o Android congela sem vsync;
 *   - falso positivo, porque o Whisper transcrevia fala aleatória.
 *
 * É assim que Siri e Alexa realmente funcionam: um reconhecedor pequeno rodando
 * localmente, em thread nativa, sobre o áudio contínuo. Aqui isso é o Vosk com
 * gramática restrita — a lista fechada de frases mais `[unk]` faz o reconhecedor
 * só considerar a wake word, o que deixa rápido e preciso. Zero rede, zero
 * arquivo, e o AudioRecord fica aberto de forma contínua.
 *
 * Licença: Vosk é Apache 2.0 — uso comercial ilimitado, sem chave e sem conta,
 * então o app instalável funciona sem nenhuma configuração do usuário final.
 */
import * as Vosk from 'react-native-vosk';
import type { EventSubscription } from 'react-native';

const MODEL_PATH = 'model-pt';

const DIACRITICS_RE = /[̀-ͯ]/g;

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

/**
 * Gramática: a lista fechada que o reconhecedor considera. `[unk]` é obrigatório
 * para ele poder classificar o resto como "desconhecido" em vez de forçar a
 * frase mais próxima — sem isso, qualquer ruído viraria "argos".
 */
function buildGrammar(wakeWord: string): string[] {
  const full = normalize(wakeWord);
  const parts = full.split(/\s+/).filter(Boolean);
  const keyword = parts[parts.length - 1] ?? full;
  const set = new Set<string>([full, keyword]);
  return [...set, '[unk]'];
}

function buildMatchers(wakeWord: string): RegExp[] {
  const full = normalize(wakeWord);
  const parts = full.split(/\s+/).filter(Boolean);
  const keyword = parts[parts.length - 1] ?? full;
  return [...new Set([full, keyword])]
    .filter((v) => v.length >= 4)
    .map((v) => new RegExp('(^|[^a-z])' + v + '([^a-z]|$)'));
}

let modelLoaded = false;
let listening = false;
let suspended = false;
let matchers: RegExp[] = [];
let grammar: string[] = [];
let onDetected: (() => void) | null = null;
let subs: EventSubscription[] = [];
/** Evita disparos repetidos do mesmo enunciado (result + partial). */
let lastFireAt = 0;
const FIRE_COOLDOWN_MS = 2500;

function textOf(raw: string): string {
  // O Vosk devolve JSON ({"text":"..."} ou {"partial":"..."}) na maioria dos casos,
  // mas em algumas versões vem string crua — trata os dois.
  try {
    const p = JSON.parse(raw) as { text?: string; partial?: string };
    return p.text ?? p.partial ?? '';
  } catch {
    return raw ?? '';
  }
}

function considerText(raw: string): void {
  if (!listening || suspended) return;
  const heard = normalize(textOf(raw));
  if (!heard) return;
  if (!matchers.some((re) => re.test(heard))) return;

  const now = Date.now();
  if (now - lastFireAt < FIRE_COOLDOWN_MS) return;
  lastFireAt = now;

  onDetected?.();
}

function clearSubs(): void {
  subs.forEach((s) => {
    try {
      s.remove();
    } catch {}
  });
  subs = [];
}

async function ensureModel(): Promise<boolean> {
  if (modelLoaded) return true;
  try {
    await Vosk.loadModel(MODEL_PATH);
    modelLoaded = true;
    return true;
  } catch {
    return false;
  }
}

/** Reinicia o reconhecedor. O Vosk encerra sozinho ao fim de um enunciado. */
async function restart(): Promise<void> {
  if (!listening || suspended) return;
  try {
    await Vosk.start({ grammar });
  } catch {
    // Microfone ocupado (escuta ativa) — o resume() tenta de novo.
  }
}

export async function startVoskWakeWord(opts: {
  wakeWord: string;
  onWakeWordDetected: () => void;
}): Promise<boolean> {
  if (listening) return true;

  if (!(await ensureModel())) return false;

  matchers = buildMatchers(opts.wakeWord || 'Ei Argos');
  grammar = buildGrammar(opts.wakeWord || 'Ei Argos');
  onDetected = opts.onWakeWordDetected;
  listening = true;
  suspended = false;

  clearSubs();
  subs.push(Vosk.onResult((e) => considerText(e)));
  subs.push(Vosk.onPartialResult((e) => considerText(e)));
  subs.push(
    Vosk.onFinalResult((e) => {
      considerText(e);
      // Enunciado encerrado — religa para continuar ouvindo.
      void restart();
    })
  );
  subs.push(Vosk.onTimeout(() => void restart()));
  subs.push(Vosk.onError(() => void restart()));

  try {
    await Vosk.start({ grammar });
    return true;
  } catch {
    listening = false;
    clearSubs();
    return false;
  }
}

/** Libera o microfone para a escuta ativa do comando. */
export function suspendVoskWakeWord(): void {
  if (!listening || suspended) return;
  suspended = true;
  try {
    Vosk.stop();
  } catch {}
}

export function resumeVoskWakeWord(): void {
  if (!listening || !suspended) return;
  suspended = false;
  void restart();
}

export async function stopVoskWakeWord(): Promise<void> {
  listening = false;
  suspended = false;
  onDetected = null;
  clearSubs();
  try {
    Vosk.stop();
  } catch {}
}

export function isVoskWakeWordRunning(): boolean {
  return listening;
}

export function isVoskWakeWordSuspended(): boolean {
  return suspended;
}
