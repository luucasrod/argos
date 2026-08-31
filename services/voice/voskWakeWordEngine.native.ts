/**
 * voskWakeWordEngine.native.ts — adapta o motor Vosk já em produção
 * (backgroundWakeWord.native.ts / voskWakeWord.native.ts) ao contrato
 * `WakeWordEngine` (issue A-003).
 *
 * Casca fina de propósito: não reimplementa nem altera a lógica de
 * reconhecimento — só traduz a API existente para a interface. A
 * configuração de sensibilidade não se aplica aqui: o Vosk decide por
 * casamento de gramática fechada, não por um limiar numérico ajustável.
 */
import type { WakeWordEngine, WakeWordEngineOptions } from './wakeWordEngine';
import {
  startBackgroundWakeWord,
  stopBackgroundWakeWord,
  isBackgroundWakeWordRunning,
  isBackgroundWakeWordSuspended,
  suspendBackgroundWakeWord,
  resumeBackgroundWakeWord,
  cancelVoskUtterance,
  isVoskArmed,
  armVoskUtterance,
} from './backgroundWakeWord.native';

export const voskWakeWordEngine: WakeWordEngine = {
  start(opts: WakeWordEngineOptions): Promise<boolean> {
    return startBackgroundWakeWord({
      wakeWord: opts.wakeWord,
      extraPhrases: opts.extraPhrases,
      onWakeWordDetected: () => opts.onWakeDetected({ at: Date.now() }),
      onCommand: opts.onCommand,
      onPartial: opts.onPartial,
    });
  },
  stop(): Promise<void> {
    return stopBackgroundWakeWord();
  },
  suspend(): void {
    suspendBackgroundWakeWord();
  },
  resume(): void {
    resumeBackgroundWakeWord();
  },
  isRunning(): boolean {
    return isBackgroundWakeWordRunning();
  },
  isSuspended(): boolean {
    return isBackgroundWakeWordSuspended();
  },
  armUtterance(): boolean {
    return armVoskUtterance();
  },
  cancelUtterance(): void {
    cancelVoskUtterance();
  },
  isArmed(): boolean {
    return isVoskArmed();
  },
};
