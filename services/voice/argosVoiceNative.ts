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
 */
import { NativeEventEmitter, NativeModules, type EventSubscription } from 'react-native';

const { ArgosVoice, WhisperCpp } = NativeModules as {
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
  WhisperCpp: {
    transcribeAudioWhisper(audioBase64: string, language: string): Promise<{text: string; confidence: number; duration_ms: number}>;
    getModelInfo(): Promise<{modelPath: string; modelSizeMB: number; language: string; sampleRateHz: number}>;
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

/** Transcreve áudio usando Whisper.cpp on-device (V-002, preferred).
 *  Recebe áudio em base64 e retorna o texto transcrito.
 *  Se falhar (modelo insuficiente ou dispositivo fraco), pode fallback para Deepgram. */
export function transcribeAudioWhisper(audioBase64: string, language: string = "pt"): Promise<{text: string; confidence: number; duration_ms: number}> {
  return WhisperCpp.transcribeAudioWhisper(audioBase64, language);
}

/** Obtém informações sobre o modelo Whisper carregado. */
export function getModelInfo(): Promise<{modelPath: string; modelSizeMB: number; language: string; sampleRateHz: number}> {
  return WhisperCpp.getModelInfo();
}