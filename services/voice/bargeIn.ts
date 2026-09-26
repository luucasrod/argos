/**
 * bargeIn.ts — coordenador de barge-in, issue #263 (V-007, épico #232).
 *
 * O que é: quando o usuário fala ENQUANTO o Argos ainda está falando,
 * para o TTS em <300ms, descarta o áudio pendente e devolve o texto
 * ouvido como um turno novo normal — que entra no pipeline de sempre
 * (`sendMessage` em `hooks/useArgos.ts`), já com o histórico completo da
 * conversa (`buildApiMessageHistory`). O "reload do LLM com contexto" não
 * precisa de código próprio: é o caminho padrão, que já carrega contexto.
 *
 * O que NÃO é: detecção de fala nova. Essa continua onde já estava:
 * `setBargeInListening`/`setBargeInHandler` em `voskWakeWord.native.ts`
 * (infra da #238, antes inerte). Este módulo é o `onUserInterruptStarted`
 * que a #261 (V-005, VAD durante TTS) vai alimentar quando existir — a
 * troca de fonte de trigger não muda nada aqui, só quem chama
 * `handleUserInterrupt()`.
 *
 * Segurança (por que isto não muda nada com o flag desligado):
 * - A escuta de barge-in só é armada durante o TTS e só quando
 *   `isVoiceSessionV2Enabled()` é true (padrão: false). Com o flag
 *   desligado, `beginTtsTurn`/`endTtsTurn` só rastreiam geração e
 *   `handleUserInterrupt` nunca é chamado por ninguém.
 * - Sem AEC de hardware (ver plano em
 *   `docs/ai/voz-realtime-plano-streaming-bargein.md`, seção 5), manter o
 *   mic aberto durante a fala pode captar o próprio TTS como "usuário" —
 *   por isso o mic aberto durante TTS também fica atrás do MESMO flag, e a
 *   única defesa hoje continua sendo `BARGE_IN_MIN_CHARS`. Beta com o flag
 *   ligado serve justamente pra medir falso-positivo no aparelho antes de
 *   virar padrão (#261 mitiga de verdade).
 *
 * Concorrência: cada turno de TTS carrega uma geração. Interromper bumpa a
 * geração — TTS/LLM do turno antigo que resolverem depois se reconhecem
 * como obsoletos e não tocam áudio nem derrubam o guard do turno novo.
 */
import { Platform } from 'react-native';
import { isVoiceSessionV2Enabled } from '@/contracts';
import { stopAllSpeech } from './textToSpeech';
import { invalidateTtsPrefetch } from './ttsPrefetchCache';
import { perfMark } from './perfLog';

/** Geração do turno corrente. Bump = "tudo do turno anterior é obsoleto". */
let turnGen = 0;

/** true entre `beginTtsTurn()` e `endTtsTurn()` — i.e., há áudio tocando. */
let ttsActive = false;

/** Cache do flag v2 (leitura de AsyncStorage; ver `refreshBargeInFlag`). */
let v2cached = false;

let resetTurn: (() => void) | null = null;
let turnRouter: ((text: string) => void) | null = null;

/** Geração atual — quem inicia trabalho async guarda e compara depois. */
export function currentTurnGen(): number {
  return turnGen;
}

/** true se a geração guardada já foi invalidada por um interrupt. */
export function isTurnStale(genAtStart: number): boolean {
  return genAtStart !== turnGen;
}

/** Há TTS em andamento (algo para interromper)? */
export function isTtsActive(): boolean {
  return ttsActive;
}

/**
 * Relê o flag v2 e atualiza o cache. Nunca lança (falha = flag off, o
 * caminho seguro). Chamar no início do TTS e na montagem da escuta.
 */
export async function refreshBargeInFlag(): Promise<boolean> {
  try {
    v2cached = await isVoiceSessionV2Enabled();
  } catch {
    v2cached = false;
  }
  return v2cached;
}

/** Valor em cache do flag — para hot paths síncronos (suspend da escuta). */
export function isBargeInEnabledCached(): boolean {
  return v2cached;
}

/**
 * `hooks/useArgos.ts` registra como soltar o guard do turno em curso
 * (`processingRef`), no mesmo espírito de `registerVoicePause`. Sem
 * registro, o interrupt ainda para o áudio — só não libera o pipeline.
 */
export function registerTurnReset(fn: (() => void) | null): void {
  resetTurn = fn;
}

/**
 * `hooks/useVoice.ts` registra como injetar o texto ouvido no pipeline
 * normal (o `onAutoSend` da tela). Sem registro, o interrupt para o áudio
 * e volta a ouvir, mas não processa o que foi dito.
 */
export function registerTurnRouter(fn: ((text: string) => void) | null): void {
  turnRouter = fn;
}

/** Liga/desliga a detecção no motor nativo. Nativo apenas, atrás do flag. */
async function armNativeDetection(active: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!v2cached) return;
  try {
    const m = await import('./voskWakeWord.native');
    m.setBargeInListening(active);
  } catch {
    // Motor indisponível (web, teste, Vosk desligado): sem barge-in, sem erro.
  }
}

/**
 * Marca início de TTS. Devolve a geração do turno — passar para
 * `endTtsTurn()` e para o token `cancelled` do TTS. Arma a detecção
 * (só com o flag v2 ligado; sem ele é só contabilidade).
 */
export function beginTtsTurn(): number {
  ttsActive = true;
  const gen = turnGen;
  void armNativeDetection(true);
  return gen;
}

/**
 * Marca fim de TTS. Com geração antiga (turno já interrompido e outro TTS
 * em curso), não faz nada — o `finally` do turno obsoleto não pode
 * desligar o que o turno novo ligou.
 */
export function endTtsTurn(genAtStart: number): void {
  if (genAtStart !== turnGen) return;
  ttsActive = false;
  void armNativeDetection(false);
}

/**
 * Ponto de entrada do trigger (`onUserInterruptStarted` da #261; hoje, o
 * `onBargeIn` da #238). Para o TTS, invalida o turno antigo e devolve true
 * quando havia algo tocando. Quem chama (hook de voz) religa a escuta,
 * ajusta o status e roteia o texto via `routeInterruptedTurn()`.
 *
 * Sem TTS ativo, é noop (false) — protege contra trigger atrasado ou
 * duplo sem precisar de debounce no chamador.
 */
export async function handleUserInterrupt(heard: string): Promise<boolean> {
  if (!ttsActive) return false;

  const t0 = Date.now();
  turnGen += 1;
  resetTurn?.();

  try {
    await stopAllSpeech();
  } catch {
    // Parar áudio nunca pode derrubar o turno novo — segue para reouvir.
  }
  // "Cancelar fila de áudio": o prefetch da resposta interrompida não pode
  // tocar depois (hoje é uma entrada one-shot; com fila de segmentos no
  // futuro, é aqui que ela é esvaziada).
  invalidateTtsPrefetch();
  endTtsTurn(turnGen);

  const stopMs = Date.now() - t0;
  // Métrica `barge_in_stop_ms` (#241 consome): latência detecção → mudo.
  // Linha própria (não perfEnd) pra não corromper o turno de medição que
  // pode estar aberto da resposta interrompida; perfMark anota nele também.
  console.log(`[argos-perf] barge_in stop_ms=${stopMs} chars=${heard.trim().length}`);
  perfMark('barge_in_interrompido');

  return true;
}

/**
 * Injeta o texto da interrupção no pipeline normal (LLM com histórico).
 * Chamar DEPOIS de `handleUserInterrupt()` retornar true, com a escuta já
 * religada e o status em 'listening' — igual ao fluxo da wake word.
 */
export function routeInterruptedTurn(text: string): void {
  const clean = text.trim();
  if (!clean) return;
  turnRouter?.(clean);
}
