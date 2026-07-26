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

/** Uma tentativa de obter vozes (voiceschanged + timeout). Resolve na hora se já tiver vozes. */
function collectVoicesOnce(synth: SpeechSynthesis, timeoutMs: number): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

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

    setTimeout(finish, timeoutMs);
  });
}

/**
 * Busca rápida de vozes pro caminho comum (toda fala) — resolve na hora se o
 * sistema já carregou as vozes (caso normal). Sem o loop pesado de `reloadVoices`,
 * que é só pra um botão explícito nas configurações.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve([]);
  return collectVoicesOnce(window.speechSynthesis, 600);
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
