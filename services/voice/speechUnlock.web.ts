/**
 * Desbloqueia speechSynthesis no gesto do usuário (orb, botões).
 * Sem isso, Chrome/iOS silenciam a voz após await da API.
 */
let primed = false;

export function unlockSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const synth = window.speechSynthesis;
  synth.getVoices();
  if (synth.paused) synth.resume();

  /* Utterance mínima para “acordar” o motor de voz no mobile */
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

/** Mantém o Chrome falando textos longos (bug conhecido). */
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

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const onChange = () => {
      synth.onvoiceschanged = null;
      resolve(synth.getVoices());
    };
    synth.onvoiceschanged = onChange;
    synth.getVoices();
    setTimeout(() => {
      if (synth.onvoiceschanged === onChange) {
        synth.onvoiceschanged = null;
        resolve(synth.getVoices());
      }
    }, 1500);
  });
}
