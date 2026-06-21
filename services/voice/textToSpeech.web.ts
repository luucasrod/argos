/**
 * textToSpeech.web.ts — TTS via Web Speech Synthesis API
 */
import { AIPersonality } from '@/types/ai.types';
import { pauseVoiceInput, waitForMicRelease } from '@/services/voice/voiceSession';

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
  const spoken = text?.trim();
  if (!spoken || typeof window === 'undefined' || !window.speechSynthesis) return;

  pauseVoiceInput();
  await waitForMicRelease(200);

  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = personality.language ?? 'pt-BR';
    utterance.pitch = personality.voiceGender === 'female' ? 1.1 : 0.85;
    utterance.rate = personality.voiceSpeed ?? 1.0;
    utterance.volume = 1;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    const speak = () => {
      const voice = getBestVoice(utterance.lang);
      if (voice) utterance.voice = voice;
      if (synth.paused) synth.resume();
      /* Chrome precisa de um tick após cancel() */
      setTimeout(() => {
        synth.speak(utterance);
        /* Fallback se onend não disparar */
        setTimeout(finish, Math.max(4000, spoken.length * 80));
      }, 80);
    };

    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => {
        synth.onvoiceschanged = null;
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
