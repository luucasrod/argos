/**
 * nativeMic.ts — primitiva de captura de microfone no nativo (expo-audio).
 *
 * Abre uma "janela" de gravação com metering ligado e a fecha sozinha quando
 * detecta que a pessoa parou de falar (silêncio sustentado), quando estoura a
 * duração máxima, ou quando a janela ficou só em silêncio (aí é reciclada sem
 * gastar transcrição).
 *
 * É a mesma ideia do customCapture.web.ts (MediaRecorder + AnalyserNode), só
 * que usando o metering do expo-audio como VAD — ver nativeVad.ts para o porquê
 * dos limites.
 *
 * O expo-audio só permite UM AudioRecorder preparado por vez, então há um lock de
 * módulo: qualquer nova janela força a liberação da anterior antes de abrir.
 */
import {
  AudioModule,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { createVad } from './nativeVad';

const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'aac ',
    audioQuality: 96,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

const STATUS_INTERVAL_MS = 100;

/**
 * Piso de duração antes de aceitar uma parada por silêncio. Sem isso, um
 * estalo (porta batendo) abre a janela e o silêncio seguinte a fecha com menos
 * de 1s de áudio — o MediaRecorder rejeita com E_AUDIO_NODATA e o arquivo sai
 * truncado.
 */
const MIN_RECORDING_MS = 1000;

/** Amostras consecutivas de fala antes de considerar que a fala começou. */
const SPEECH_POLLS_NEEDED = 2;

export interface MicWindowOptions {
  /** Silêncio (ms) depois de ter havido fala que encerra a janela. */
  silenceMs?: number;
  /** Teto de duração depois que a fala começou. */
  maxUtteranceMs?: number;
  /** Recicla uma janela 100% silenciosa depois disso (não transcreve). */
  idleRecycleMs?: number;
  /** Chamado na primeira vez que detecta fala nesta janela. */
  onSpeechStart?: () => void;
}

export interface MicWindowResult {
  uri: string | null;
  hadSpeech: boolean;
  /** true se foi encerrada por cancel() — descarta o áudio. */
  cancelled: boolean;
  error?: string;
}

export interface MicWindow {
  /** Resolve quando a janela fecha (por silêncio, teto, stop() ou cancel()). */
  done: Promise<MicWindowResult>;
  /** Encerra agora e mantém o áudio para transcrição. */
  stop: () => void;
  /** Encerra agora e descarta o áudio. */
  cancel: () => void;
}

/** AudioRecorder atualmente preparado — o expo-audio aceita só um por vez. */
let current: AudioRecorder | null = null;

/** Tenta liberar um recorder mesmo se o nativo já encerrou a sessão. */
async function forceRecorderCleanup(rec: AudioRecorder): Promise<void> {
  try {
    await rec.stop();
  } catch {
    // Nada mais a fazer — melhor seguir do que travar o microfone pra sempre.
  }
  try {
    rec.release();
  } catch {}
}

/** Libera o microfone se houver uma gravação pendente de qualquer origem. */
export async function releaseMic(): Promise<void> {
  const rec = current;
  current = null;
  if (!rec) return;
  try {
    await rec.stop();
  } catch {
    await forceRecorderCleanup(rec);
  }
  try {
    rec.release();
  } catch {}
}

/** Permissão de microfone. Deve ser chamada com o app em primeiro plano. */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const { status } = await requestRecordingPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Prepara o modo de áudio. `background: true` mantém a sessão ativa com o app
 * fora de foco — no Android depende do foreground service estar de pé.
 */
export async function configureAudioMode(background: boolean): Promise<void> {
  try {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: background,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    });
  } catch {
    // Modo de áudio é best-effort — a gravação ainda pode funcionar.
  }
}

export async function openMicWindow(opts: MicWindowOptions = {}): Promise<MicWindow | null> {
  const silenceMs = opts.silenceMs ?? 1500;
  const maxUtteranceMs = opts.maxUtteranceMs ?? 15000;
  const idleRecycleMs = opts.idleRecycleMs ?? 30000;

  // Garante mic livre antes de preparar outra gravação.
  await releaseMic();

  const recording = new AudioModule.AudioRecorder(RECORDING_OPTIONS);

  try {
    await recording.prepareToRecordAsync();
  } catch {
    await forceRecorderCleanup(recording);
    return null;
  }

  const vad = createVad();
  let finished = false;
  let hadSpeech = false;
  let lastSpeechAt = 0;
  let startedAt = Date.now();
  /** Início real da janela — base para MIN_RECORDING_MS e idleRecycleMs. */
  let openedAt = Date.now();
  let statusTimer: ReturnType<typeof setInterval> | null = null;

  let resolveDone: (r: MicWindowResult) => void;
  const done = new Promise<MicWindowResult>((res) => {
    resolveDone = res;
  });

  const finish = async (didCancel: boolean) => {
    if (finished) return;
    finished = true;
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = null;

    let uri: string | null = null;
    try {
      await recording.stop();
      uri = recording.uri;
    } catch {
      // E_AUDIO_NODATA (gravação curta demais, sem áudio válido) cai aqui: o
      // arquivo é um MPEG-4 truncado sem moov atom, que o Whisper rejeita.
      // Descarta e força a limpeza para não travar o mic.
      uri = null;
      await forceRecorderCleanup(recording);
    }
    try {
      recording.release();
    } catch {}
    if (current === recording) current = null;

    resolveDone({
      uri: didCancel ? null : uri,
      hadSpeech,
      cancelled: didCancel,
    });
  };

  // O metering é peak-since-last-read: getMaxAmplitude() zera o pico a cada
  // leitura, e QUALQUER chamada de status o consome. Por isso o valor só é lido
  // aqui, no timer, e nunca por outra leitura de status concorrente.
  let speechPolls = 0;

  const checkStatus = () => {
    const status = recording.getStatus();
    if (finished || !status.isRecording) return;

    const speaking = vad.push(status.metering);
    const now = Date.now();
    const elapsed = now - openedAt;

    if (speaking) {
      speechPolls++;
      // Exige fala sustentada para não abrir a janela num estalo isolado.
      if (!hadSpeech && speechPolls >= SPEECH_POLLS_NEEDED) {
        hadSpeech = true;
        startedAt = now;
        opts.onSpeechStart?.();
      }
      if (hadSpeech) lastSpeechAt = now;
      return;
    }

    speechPolls = 0;

    if (hadSpeech) {
      // Tudo medido por delta de Date.now(): um tick atrasado ou acumulado não
      // pode simular silêncio que não houve.
      const silentFor = now - lastSpeechAt;
      if (elapsed < MIN_RECORDING_MS) return;
      if (silentFor >= silenceMs || now - startedAt >= maxUtteranceMs) {
        void finish(false);
      }
      return;
    }

    // Nunca houve fala nesta janela — recicla sem transcrever.
    if (elapsed >= idleRecycleMs) {
      void finish(true);
    }
  };

  try {
    recording.record();
  } catch {
    await forceRecorderCleanup(recording);
    return null;
  }

  current = recording;
  openedAt = Date.now();
  startedAt = openedAt;
  statusTimer = setInterval(checkStatus, STATUS_INTERVAL_MS);

  return {
    done,
    stop: () => {
      void finish(false);
    },
    cancel: () => {
      void finish(true);
    },
  };
}
