/**
 * textToSpeech.web.ts — TTS via Web Speech Synthesis API
 * Metro resolve este arquivo no lugar de textToSpeech.ts quando bundlando para web.
 */
import { AIPersonality } from '@/types/ai.types';

function getBestVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined') return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(lang.split('-')[0])) ??
    null
  );
}

export async function textToSpeech(text: string, personality: AIPersonality): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }

    // Cancela qualquer fala em andamento
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = personality.language ?? 'pt-BR';
    utterance.pitch = personality.voiceGender === 'female' ? 1.1 : 0.85;
    utterance.rate = personality.voiceSpeed ?? 1.0;
    utterance.volume = 1;

    // Tenta usar voz no idioma certo
    const voice = getBestVoice(utterance.lang);
    if (voice) utterance.voice = voice;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    // Chrome bug: vozes podem não estar carregadas ainda
    const speak = () => {
      const bestVoice = getBestVoice(utterance.lang);
      if (bestVoice && !utterance.voice) utterance.voice = bestVoice;
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speak();
      };
    } else {
      speak();
    }
  });
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve(false);
  }
  return Promise.resolve(window.speechSynthesis.speaking);
}
