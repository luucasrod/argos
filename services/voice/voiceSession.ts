/** Pausa reconhecimento de voz antes do TTS (evita conflito mic/áudio). */
type PauseFn = () => void;

let pauseFn: PauseFn | null = null;

export function registerVoicePause(fn: PauseFn) {
  pauseFn = fn;
}

export function unregisterVoicePause() {
  pauseFn = null;
}

export function pauseVoiceInput() {
  pauseFn?.();
}

export function waitForMicRelease(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
