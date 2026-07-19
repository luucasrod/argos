/**
 * listenChime.web.ts — bipe curto quando o Argos começa a escutar de verdade,
 * pra dar uma confirmação clara de que ele te ouviu (clique ou wake word).
 * Som sintetizado na hora via Web Audio API — sem arquivo de áudio.
 */
let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

function tone(ctx: AudioContext, freq: number, startAt: number, durationSec: number, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.02);
}

/** Bipe curto e agradável (duas notas subindo) confirmando que começou a ouvir. */
export function playListenChime(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 640, now, 0.11, 0.12);
  tone(ctx, 900, now + 0.09, 0.13, 0.12);
}
