/**
 * backgroundWakeWord.native.ts — escuta contínua da wake word no Android.
 *
 * Duas peças, cada uma no lugar certo:
 *   1. Vosk (voskWakeWord.native.ts) faz o reconhecimento ON-DEVICE, em thread
 *      nativa, sobre o áudio contínuo. É o que Siri e Alexa fazem.
 *   2. react-native-background-actions mantém um foreground service de pé, para
 *      o Android não matar o processo quando o app sai de foco.
 *
 * O que mudou em relação à versão anterior, e por que ela não tinha como funcionar:
 *   - antes cada checagem de wake word era uma ida ao Whisper na nuvem (1 a 3s de
 *     latência) e o microfone fechava a cada trecho para poder fechar o arquivo;
 *   - o laço era dirigido por setTimeout do JS, que o Android congela quando não
 *     há vsync (tela apagada);
 *   - o casamento por substring em texto transcrito gerava falso positivo.
 *   Agora nada disso existe: sem rede, sem arquivo, sem timer de JS no caminho
 *   do áudio. O microfone fica aberto de forma contínua pelo AudioRecord nativo.
 *
 * A interface exportada é a mesma de antes, de propósito — useVoice.ts não muda.
 */
import BackgroundService from 'react-native-background-actions';
import { configureAudioMode, ensureMicPermission, releaseMic } from './nativeMic';
import { playListenChime, preloadListenChime } from './listenChime';
import {
  startVoskWakeWord,
  stopVoskWakeWord,
  suspendVoskWakeWord,
  resumeVoskWakeWord,
  isVoskWakeWordRunning,
  isVoskWakeWordSuspended,
  cancelVoskUtterance,
  isVoskArmed,
  armVoskUtterance,
} from './voskWakeWord.native';

export { cancelVoskUtterance, isVoskArmed, armVoskUtterance };

let running = false;
let onDetected: (() => void) | null = null;
/** Resolve quando o serviço deve encerrar — mantém a task viva sem timers. */
let stopService: (() => void) | null = null;

export function suspendBackgroundWakeWord(): void {
  suspendVoskWakeWord();
}

export function resumeBackgroundWakeWord(): void {
  resumeVoskWakeWord();
}

export function isBackgroundWakeWordSuspended(): boolean {
  return isVoskWakeWordSuspended();
}

/**
 * A task do foreground service. Não dirige o áudio — o Vosk já faz isso em thread
 * nativa. Ela só precisa não retornar, senão o Android derruba o serviço.
 */
const keepAliveTask = async () => {
  await new Promise<void>((resolve) => {
    stopService = resolve;
  });
};

export async function startBackgroundWakeWord(opts: {
  wakeWord: string;
  /** Wake word ouvida — hora de dar retorno (bipe/UI). */
  onWakeWordDetected: () => void;
  /** Comando completo, já sem a wake word, pronto para a IA. */
  onCommand: (text: string) => void;
  /** Transcrição parcial, para mostrar na tela. */
  onPartial?: (text: string) => void;
  /** Nomes de dispositivos e cômodos, para entrarem na gramática. */
  extraPhrases?: string[];
}): Promise<boolean> {
  if (running) return true;

  // A permissão precisa estar concedida ANTES de subir um foreground service do
  // tipo microphone, senão o Android 14+ recusa o serviço.
  const granted = await ensureMicPermission();
  if (!granted) return false;

  onDetected = opts.onWakeWordDetected;
  running = true;

  // staysActiveInBackground mantém a sessão de áudio viva com a tela apagada.
  await configureAudioMode(true);
  preloadListenChime();

  try {
    await BackgroundService.start(keepAliveTask, {
      taskName: 'ArgosWakeWord',
      taskTitle: 'Argos está ouvindo',
      taskDesc: `Diga "${opts.wakeWord || 'Ei Argos'}" para ativar`,
      taskIcon: { name: 'ic_launcher', type: 'mipmap' },
      color: '#7C3AED',
      linkingURI: 'argos://',
      // Android 14+ exige o tipo aqui também, casando com o android:foregroundServiceType
      // do manifest (plugins/withForegroundService.js).
      foregroundServiceType: ['microphone'],
      parameters: {},
    });
  } catch {
    running = false;
    onDetected = null;
    return false;
  }

  const ok = await startVoskWakeWord({
    wakeWord: opts.wakeWord,
    onWakeWordDetected: () => {
      /*
       * Bipe SEM aguardar e SEM tocar no microfone. O reconhecimento continua
       * correndo durante o bipe, que é o ponto: a pessoa fala "Ei Argos, desliga
       * a luz" de enfiada e nada do começo se perde.
       *
       * O bipe sai daqui, do serviço, e não do hook React — com a tela bloqueada
       * é a única confirmação de que o Argos ouviu.
       */
      playListenChime();
      onDetected?.();
    },
    onCommand: opts.onCommand,
    onPartial: opts.onPartial,
    extraPhrases: opts.extraPhrases,
  });

  if (!ok) {
    running = false;
    onDetected = null;
    stopService?.();
    stopService = null;
    try {
      await BackgroundService.stop();
    } catch {}
    return false;
  }

  return true;
}

export async function stopBackgroundWakeWord(): Promise<void> {
  running = false;
  onDetected = null;
  await stopVoskWakeWord();
  await releaseMic();
  stopService?.();
  stopService = null;
  try {
    await BackgroundService.stop();
  } catch {}
}

export function isBackgroundWakeWordRunning(): boolean {
  try {
    return running && isVoskWakeWordRunning() && BackgroundService.isRunning();
  } catch {
    return running && isVoskWakeWordRunning();
  }
}
