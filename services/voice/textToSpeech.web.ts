/**
 * textToSpeech.web.ts — TTS via Web Speech Synthesis API
 */
import { AIPersonality } from '@/types/ai.types';
import { pauseVoiceInput, waitForMicRelease } from '@/services/voice/voiceSession';
import { loadVoices, startSpeechKeepAlive, unlockSpeech } from '@/services/voice/speechUnlock';
import { pickVoiceForPersonality, pitchForUtterance } from '@/services/voice/voicePicker';

function estimateDurationMs(text: string, rate: number): number {
  const words = text.split(/\s+/).length;
  const wpm = 150 * rate;
  return Math.max(3000, (words / wpm) * 60_000 + 1500);
}

export async function textToSpeech(text: string, personality: AIPersonality): Promise<void> {
  const spoken = text?.trim();
  if (!spoken || typeof window === 'undefined' || !window.speechSynthesis) return;

  unlockSpeech();
  pauseVoiceInput();
  await waitForMicRelease(150);

  const synth = window.speechSynthesis;
  const voices = await loadVoices();
  const selected = pickVoiceForPersonality(voices, personality);
  const pitch = pitchForUtterance(selected, personality.voiceGender);
  const lang = selected?.lang ?? personality.language ?? 'pt-BR';
  const rate =
    !selected && personality.voiceGender === 'male'
      ? Math.min(2, Math.max(0.5, (personality.voiceSpeed ?? 1.0) * 0.92))
      : Math.min(2, Math.max(0.5, personality.voiceSpeed ?? 1.0));

  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    let attempts = 0;
    let stopKeepAlive = () => {};
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      stopKeepAlive();
      if (safetyTimer) clearTimeout(safetyTimer);
      resolve();
    };

    const runSpeak = () => {
      if (settled) return;
      attempts += 1;

      if (synth.speaking) synth.cancel();

      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = lang;
      utterance.pitch = pitch;
      utterance.rate = rate;
      utterance.volume = 1;

      if (selected) utterance.voice = selected;

      utterance.onstart = () => {
        started = true;
        stopKeepAlive = startSpeechKeepAlive();
      };

      utterance.onend = finish;

      utterance.onerror = (e) => {
        if (__DEV__) {
          console.warn('[Argos TTS] erro:', (e as SpeechSynthesisErrorEvent).error);
        }
        if (!started && attempts < 3) {
          setTimeout(runSpeak, 200 * attempts);
          return;
        }
        finish();
      };

      if (synth.paused) synth.resume();

      setTimeout(() => {
        synth.speak(utterance);

        setTimeout(() => {
          if (!started && !settled && attempts < 3) {
            runSpeak();
          }
        }, 600);
      }, attempts === 1 ? 50 : 120);

      safetyTimer = setTimeout(finish, estimateDurationMs(spoken, rate));
    };

    runSpeak();
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

/** Lista vozes disponíveis (útil para debug nas configurações). */
export async function listAvailableVoices(): Promise<string[]> {
  const voices = await loadVoices();
  return voices.map((v) => `${v.name} (${v.lang})`);
}
