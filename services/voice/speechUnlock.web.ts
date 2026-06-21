/**
 * Desbloqueia speechSynthesis no gesto do usuário (orb, botões).
 */
let primed = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unlockSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const synth = window.speechSynthesis;
  synth.getVoices();
  if (synth.paused) synth.resume();

  const prime = new SpeechSynthesisUtterance('.');
  prime.volume = 0.01;
  prime.rate = 2;
  prime.lang = 'pt-BR';
  synth.speak(prime);

  primed = true;
}

export function isSpeechPrimed(): boolean {
  return primed;
}

export function startSpeechKeepAlive(): () => void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return () => {};

  const synth = window.speechSynthesis;
  const id = setInterval(() => {
    if (!synth.speaking) return;
    synth.pause();
    synth.resume();
  }, 4000);

  return () => clearInterval(id);
}

/** Uma tentativa de obter vozes (voiceschanged + timeout). */
function collectVoicesOnce(synth: SpeechSynthesis, timeoutMs: number): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(synth.getVoices());
    };

    const prev = synth.onvoiceschanged;
    synth.onvoiceschanged = () => {
      synth.onvoiceschanged = prev;
      finish();
    };

    synth.getVoices();
    setTimeout(finish, timeoutMs);
  });
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return reloadVoices();
}

/**
 * Recarrega vozes do sistema — necessário no iOS após baixar Felipe.
 * Deve ser chamado num toque do usuário.
 */
export async function reloadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];

  const synth = window.speechSynthesis;
  synth.cancel();
  unlockSpeech();

  let best: SpeechSynthesisVoice[] = [];

  for (let attempt = 0; attempt < 6; attempt++) {
    await wait(attempt === 0 ? 100 : 400);
    const voices = await collectVoicesOnce(synth, attempt < 2 ? 1200 : 800);
    if (voices.length > best.length) best = voices;

    const hasFelipe = voices.some((v) => /felipe/i.test(`${v.name}|${v.voiceURI}`));
    if (hasFelipe) return voices;

    synth.getVoices();
  }

  return best.length > 0 ? best : synth.getVoices();
}
