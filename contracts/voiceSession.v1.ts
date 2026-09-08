/**
 * Contratos da Fase 1 (#234) do épico #232 — voz conversacional em tempo
 * real. Define as interfaces que #235–#242 implementam: VoiceSession,
 * AudioInput, WakeWordDetector, SpeechRecognizer, TextToSpeech,
 * ConversationEngine, CommandRouter, ToolExecutor.
 *
 * Base factual: `docs/ai/voz-realtime-auditoria.md` (issue #233). Ponto
 * central dessa auditoria — `contracts/protocol.ts` já modela origem
 * (`home`/`cloud`), rota (`local`/`cloud`) e idempotência (`commandId`)
 * pra comandos entre Argos F/Home/Cloud, mas nenhuma integração real o usa
 * hoje. Este arquivo NÃO redefine esse protocolo — reusa `commandId` como
 * chave de idempotência (mesmo campo de `contracts/protocol.ts`) pro fast
 * path (#236). A decisão local/cloud (`CommandRoute`) fica de fora daqui de
 * propósito: quem decide isso é a camada de controle de dispositivo (#239,
 * ex. `controlTuyaLocalFirst`), não o `CommandRouter` — o router só decide
 * fast path vs. conversational path.
 *
 * Isto é só o CONTRATO — tipos e um flag local de rollout. Nenhuma
 * implementação de runtime mora aqui; cada fase seguinte implementa a sua
 * peça atrás da interface correspondente, sempre gated por
 * `isVoiceSessionV2Enabled()`. Com o flag desligado (padrão), o app
 * continua exatamente como está hoje — nada aqui é chamado.
 */

// ---------------------------------------------------------------------------
// Máquina de estados (seção 11 do documento fonte da épico #232)
// ---------------------------------------------------------------------------

export type VoiceEngineState =
  | 'idle_wake_word'
  | 'wake_detected'
  | 'listening'
  | 'routing'
  | 'fast_action'
  | 'conversational_processing'
  | 'speaking'
  | 'follow_up_window'
  | 'interrupting'
  | 'error_recovery';

// ---------------------------------------------------------------------------
// Audio core (#235)
// ---------------------------------------------------------------------------

export interface AudioChunk {
  /** PCM16 mono 16kHz — mesmo formato que `ArgosVoiceModule.kt` já produz hoje. */
  pcm: ArrayBuffer;
  timestampMs: number;
}

export interface AudioInput {
  isCapturing(): boolean;
  /**
   * Tamanho do pre-roll em memória, em ms. Hoje é 0 — auditoria (#233)
   * confirmou que `armCommandCapture()` só começa a bufferizar DEPOIS da
   * wake word confirmada, sem nenhum pre-roll real.
   */
  getPreRollMs(): number;
  /** Retorna função de unsubscribe. */
  onFrame(cb: (chunk: AudioChunk) => void): () => void;
}

// ---------------------------------------------------------------------------
// Wake word (#235) — interface fina sobre o que `voskWakeWord.native.ts`
// já expõe (`startVoskWakeWord`/`stopVoskWakeWord`/`suspendVoskWakeWord`/
// `resumeVoskWakeWord`), pra permitir trocar o motor sem tocar no resto.
// ---------------------------------------------------------------------------

export interface WakeWordDetector {
  start(): Promise<boolean>;
  stop(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  /** Retorna função de unsubscribe. */
  onWake(cb: () => void): () => void;
}

// ---------------------------------------------------------------------------
// STT (#235/#237)
// ---------------------------------------------------------------------------

export interface PartialTranscript {
  text: string;
  isFinal: boolean;
}

export interface SpeechRecognizer {
  /** `true` = motor local (Vosk), `false` = fallback em nuvem (Whisper, #230). */
  readonly isLocal: boolean;
  /** Retorna função de unsubscribe. */
  onTranscript(cb: (t: PartialTranscript) => void): () => void;
}

// ---------------------------------------------------------------------------
// TTS (#237) — hoje `api/tts.ts` só devolve o áudio inteiro de uma vez
// (auditoria #233, seção 4); esta interface já modela o caso streaming
// (`isFinal` por chunk) pra não precisar redesenhar quando #237 chegar.
// ---------------------------------------------------------------------------

export interface TtsChunk {
  audioBase64: string;
  mime: string;
  isFinal: boolean;
}

export interface TextToSpeech {
  readonly supportsStreaming: boolean;
  speak(text: string, opts?: { voice?: string }): AsyncIterable<TtsChunk>;
  /** Pra barge-in (#238) — interrompe a fala em andamento. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// LLM / tool calling (#237) — hoje é um JSON num blob de texto extraído por
// regex (`services/ai/intentParser.ts`), sem streaming nem tool-calling
// nativo da API Anthropic (auditoria #233, seção 3). `ToolCall`/`ToolResult`
// aqui são o formato estruturado que a Fase 4 deve produzir de verdade via
// `tools`/`tool_choice`, não convenção de prompt.
// ---------------------------------------------------------------------------

export type ConversationTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls?: ToolCall[] };

export interface ToolCall {
  id: string;
  /** Ex.: 'device_control' | 'get_weather' | 'set_reminder' — mesmo vocabulário de `ParsedIntent['type']` hoje. */
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ConversationDelta {
  deltaText?: string;
  toolCall?: ToolCall;
  done: boolean;
}

export interface ConversationEngine {
  readonly supportsStreaming: boolean;
  send(turns: ConversationTurn[]): AsyncIterable<ConversationDelta>;
}

export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Fast path / CommandRouter (#236) — usa `commandId` como chave de
// idempotência, o mesmo campo que `contracts/protocol.ts` já define mas que
// `matchFastDeviceCommand` hoje não usa (auditoria #233, seção 5 — sem
// necessidade hoje porque a execução é síncrona/mutuamente-exclusiva com o
// LLM; passa a ser necessária assim que streaming permitir os dois rodarem
// em paralelo de verdade).
// ---------------------------------------------------------------------------

export type FastPathResult =
  | { handled: true; commandId: string }
  | { handled: false };

export interface CommandRouter {
  /**
   * Decide fast path vs conversational path. O usuário NUNCA escolhe
   * manualmente — é sempre este método que decide (regra do documento fonte).
   */
  route(utterance: string, commandId: string): Promise<FastPathResult>;
}

// ---------------------------------------------------------------------------
// VoiceSession — a interface de mais alto nível, amarra tudo acima.
// ---------------------------------------------------------------------------

export interface VoiceSession {
  readonly id: string;
  readonly state: VoiceEngineState;
  /** Retorna função de unsubscribe. */
  onStateChange(cb: (state: VoiceEngineState) => void): () => void;
  /** Barge-in manual ou detectado (#238). */
  interrupt(): void;
  end(): void;
}

// ---------------------------------------------------------------------------
// Feature flag — local, não remoto. Remoto fica pra quando #117/#118
// (Remote config e feature flags, backlog plano-v1) existirem; por ora isto
// é só um switch local persistido, suficiente pra "testa, se ficar ruim
// volta" sem precisar reverter código.
// ---------------------------------------------------------------------------

export const VOICE_SESSION_V2_FLAG_KEY = 'argos.voiceSessionV2.enabled';

/** Lê o flag. Qualquer falha de storage (web sem AsyncStorage, etc.) volta pra `false` — a arquitetura antiga é sempre o padrão seguro. */
export async function isVoiceSessionV2Enabled(): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const value = await AsyncStorage.getItem(VOICE_SESSION_V2_FLAG_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setVoiceSessionV2Enabled(enabled: boolean): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(VOICE_SESSION_V2_FLAG_KEY, enabled ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Type guards — só para os tipos que cruzam a fronteira LLM ⇄ executor
// (ToolCall/ToolResult), no mesmo espírito de `isCommandRequest` em
// `contracts/protocol.ts`. As demais interfaces acima são apagadas em
// runtime (TypeScript puro) e não têm shape pra validar.
// ---------------------------------------------------------------------------

export function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.input === 'object' && v.input !== null;
}

export function isToolResult(value: unknown): value is ToolResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.toolCallId === 'string' && typeof v.ok === 'boolean';
}
