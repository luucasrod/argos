/**
 * nativeMic.ts — primitiva de captura de microfone no nativo (expo-av).
 *
 * Abre uma "janela" de gravação com metering ligado e a fecha sozinha quando
 * detecta que a pessoa parou de falar (silêncio sustentado), quando estoura a
 * duração máxima, ou quando a janela ficou só em silêncio (aí é reciclada sem
 * gastar transcrição).
 *
 * É a mesma ideia do customCapture.web.ts (MediaRecorder + AnalyserNode), só
 * que usando o metering do expo-av como VAD — ver nativeVad.ts para o porquê
 * dos limites.
 *
 * O expo-av só permite UM Recording preparado por vez, então há um lock de
 * módulo: qualquer nova janela força a liberação da anterior antes de abrir.
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { createVad } from './nativeVad';

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
  isMeteringEnabled: true,
  keepAudioActiveHint: true,
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

/** Recording atualmente preparado — o expo-av aceita só um por vez. */
let current: Audio.Recording | null = null;

/**
 * Desfaz o estado interno do expo-av quando stopAndUnloadAsync falha.
 *
 * Recording.stopAndUnloadAsync chama `unloadAudioRecorder()` SEM guarda, e o
 * nativo rejeita com E_AUDIO_NORECORDER quando o recorder já é null (acontece
 * quando a Activity é destruída enquanto o serviço em background segura uma
 * gravação). Se rejeitar, `_cleanupForUnloadedRecorder()` nunca roda e a flag
 * global `_recorderExists` fica presa em true — daí toda gravação futura falha
 * com "Only one Recording object can be prepared at a time" até reiniciar o app.
 * Só engolir a exceção não basta: é preciso forçar a limpeza.
 */
async function forceRecorderCleanup(rec: Audio.Recording): Promise<void> {
  const anyRec = rec as unknown as {
    _canRecord?: boolean;
    _isDoneRecording?: boolean;
    _cleanupForUnloadedRecorder?: (status?: unknown) => Promise<void> | void;
  };
  try {
    anyRec._canRecord = false;
    anyRec._isDoneRecording = true;
    await anyRec._cleanupForUnloadedRecorder?.({ canRecord: false, isRecording: false });
  } catch {
    // Nada mais a fazer — melhor seguir do que travar o microfone pra sempre.
  }
}

/** Libera o microfone se houver uma gravação pendente de qualquer origem. */
export async function releaseMic(): Promise<void> {
  const rec = current;
  current = null;
  if (!rec) return;
  try {
    rec.setOnRecordingStatusUpdate(null);
  } catch {}
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    await forceRecorderCleanup(rec);
  }
}

/** Permissão de microfone. Deve ser chamada com o app em primeiro plano. */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
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
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: background,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
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

  const recording = new Audio.Recording();

  // setProgressUpdateInterval dispara um getStatusAsync() solto. Chamando ANTES
  // de preparar, ele cai com _canRecord === false e sai por curto-circuito sem
  // tocar no nativo — senão consumiria o pico de metering da primeira amostra.
  try {
    recording.setProgressUpdateInterval(STATUS_INTERVAL_MS);
  } catch {}

  try {
    await recording.prepareToRecordAsync(RECORDING_OPTIONS);
  } catch {
    await forceRecorderCleanup(recording);
    return null;
  }

  const vad = createVad();
  let finished = false;
  let cancelled = false;
  let hadSpeech = false;
  let lastSpeechAt = 0;
  let startedAt = Date.now();
  /** Início real da janela — base para MIN_RECORDING_MS e idleRecycleMs. */
  let openedAt = Date.now();

  let resolveDone: (r: MicWindowResult) => void;
  const done = new Promise<MicWindowResult>((res) => {
    resolveDone = res;
  });

  const finish = async (didCancel: boolean) => {
    if (finished) return;
    finished = true;
    cancelled = didCancel;

    try {
      recording.setOnRecordingStatusUpdate(null);
    } catch {}

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI() ?? null;
    } catch {
      // E_AUDIO_NODATA (gravação curta demais, sem áudio válido) cai aqui: o
      // arquivo é um MPEG-4 truncado sem moov atom, que o Whisper rejeita.
      // Descarta e força a limpeza para não travar o mic.
      uri = null;
      await forceRecorderCleanup(recording);
    }
    if (current === recording) current = null;

    resolveDone({
      uri: didCancel ? null : uri,
      hadSpeech,
      cancelled: didCancel,
    });
  };

  // O metering é peak-since-last-read: getMaxAmplitude() zera o pico a cada
  // leitura, e QUALQUER chamada de status o consome. Por isso o valor só é lido
  // aqui, no callback, e nunca via getStatusAsync() manual.
  let speechPolls = 0;

  recording.setOnRecordingStatusUpdate((status) => {
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
  });

  try {
    await recording.startAsync();
  } catch {
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      await forceRecorderCleanup(recording);
    }
    return null;
  }

  current = recording;
  openedAt = Date.now();
  startedAt = openedAt;

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
