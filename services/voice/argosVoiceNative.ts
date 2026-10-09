/**
 * argosVoiceNative.ts — wrapper fino do módulo nativo ArgosVoice (issue #215).
 *
 * Mesma forma de API que `react-native-vosk` (loadModel/start/stop/eventos)
 * de propósito: `voskWakeWord.native.ts` trocou só o import, a máquina de
 * estados (gramática, detecção de wake word, corte por silêncio) não mudou
 * nada. As únicas funções novas são `armCommandCapture`/`getCommandAudioBase64`,
 * pro trecho do comando poder ser mandado pro STT em nuvem quando a gramática
 * não dá conta (ver docs/ai/CONTEXT.md, seção de Voz).
 *
 * Novas funções V-002:
 * - transcribeAudioWhisper: usa Whisper.cpp on-device (preferred)
 * - transcribeAudioWhisperFallback: usa Deepgram cloud fallback
 *
 * Novas funções V-005 (AEC):
 * - enableEchoCancellation: habilita/desabilita AEC nativo (WebRTC)
 * - isEchoCancellationEnabled: verifica status do AEC
 * - releaseAudioProcessing: libera recursos do AudioProcessing
 */
import { NativeEventEmitter, NativeModules, Platform, type EventSubscription } from 'react-native';

const { ArgosVoice, WhisperCppSTT, AudioProcessing } = NativeModules as {
  ArgosVoice: {
    loadModel(path: string): Promise<string>;
    start(options?: { grammar?: string[] }): Promise<string>;
    stop(): void;
    armCommandCapture(): void;
    cancelCommandCapture(): void;
    getCommandAudioBase64(): Promise<string>;
    addListener(eventName: string): void;
    removeListeners(count: number): void;
  };
  WhisperCppSTT: {
    loadModel(path: string): Promise<string>;
    transcribeAudioWhisper(audioBase64: string, language: string): Promise<{text: string; confidence: number; duration_ms: number; language: string}>;
    getModelInfo(): Promise<{modelPath: string; nativeAvailable: boolean; modelLoaded: boolean; sampleRateHz: number; language: string}>;
  };
  AudioProcessing: {
    enableEchoCancellation(enable: boolean): Promise<string>;
    isEchoCancellationEnabled(): Promise<boolean>;
    release(): Promise<string>;
    addListener(eventName: string): void;
    removeListeners(count: number): void;
  };
};

const emitter = new NativeEventEmitter(ArgosVoice);

export function loadModel(path: string): Promise<string> {
  return ArgosVoice.loadModel(path);
}

export function start(options?: { grammar?: string[] }): Promise<string> {
  return ArgosVoice.start(options);
}

export function stop(): void {
  ArgosVoice.stop();
}

export function onPartialResult(cb: (e: string) => void): EventSubscription {
  return emitter.addListener('onPartialResult', cb);
}

export function onResult(cb: (e: string) => void): EventSubscription {
  return emitter.addListener('onResult', cb);
}

export function onError(cb: (e: string) => void): EventSubscription {
  return emitter.addListener('onError', cb);
}

/** Começa a guardar o áudio bruto do comando — chamar ao confirmar a wake word. */
export function armCommandCapture(): void {
  ArgosVoice.armCommandCapture();
}

/** Devolve o áudio guardado (WAV, PCM16 mono 16kHz, base64) e reseta o buffer. */
export function getCommandAudioBase64(): Promise<string> {
  return ArgosVoice.getCommandAudioBase64();
}

/** Descarta a captura em andamento sem devolver o áudio — ver comentário no Kotlin. */
export function cancelCommandCapture(): void {
  ArgosVoice.cancelCommandCapture();
}

/**
 * Inicializa o modelo GGML do Whisper.cpp (copia asset pra armazenamento).
 * Chamar uma vez no boot, antes de qualquer transcrição local.
 * Falha silenciosamente se a lib nativa não estiver disponível (build sem CMake).
 */
export async function loadWhisperModel(path = ''): Promise<void> {
  if (!WhisperCppSTT) return;
  try {
    await WhisperCppSTT.loadModel(path);
  } catch (e) {
    console.warn('[WhisperCppSTT] loadModel falhou (normal em builds sem lib nativa):', e);
  }
}

/** Transcreve áudio WAV ou PCM16 (base64) via whisper.cpp on-device (V-002). */
export function transcribeAudioWhisper(
  audioBase64: string,
  language = 'pt',
): Promise<{ text: string; confidence: number; duration_ms: number; language: string }> {
  return WhisperCppSTT.transcribeAudioWhisper(audioBase64, language);
}

/** Retorna informações sobre disponibilidade do módulo e do modelo. */
export function getWhisperModelInfo(): Promise<{
  modelPath: string;
  nativeAvailable: boolean;
  modelLoaded: boolean;
  sampleRateHz: number;
  language: string;
}> {
  return WhisperCppSTT.getModelInfo();
}

/** Habilita ou desabilita o AEC (Acoustic Echo Cancellation) nativo.
 *  Deve ser chamado durante TTS playback + barge-in listening.
 *  Android: usa WebRTC AudioProcessing.setEchoCancellation()
 *  iOS: no-op (usa AVAudioEngine built-in AEC quando disponível) */
export async function enableEchoCancellation(enable: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await AudioProcessing.enableEchoCancellation(enable);
  } catch (e) {
    console.warn('[AEC] Failed to set echo cancellation:', e);
  }
}

/** Verifica se o AEC está atualmente habilitado. */
export async function isEchoCancellationEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await AudioProcessing.isEchoCancellationEnabled();
  } catch {
    return false;
  }
}

/** Libera recursos do AudioProcessing nativo. */
export async function releaseAudioProcessing(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await AudioProcessing.release();
  } catch (e) {
    console.warn('[AEC] Failed to release AudioProcessing:', e);
  }
}