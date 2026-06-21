import * as Speech from 'expo-speech';
import { AIPersonality } from '@/types/ai.types';
import { pickVoiceForPersonality, pitchForUtterance } from '@/services/voice/voicePicker';

async function getVoices() {
  try {
    return await Speech.getAvailableVoicesAsync();
  } catch {
    return [];
  }
}

export async function textToSpeech(text: string, personality: AIPersonality): Promise<void> {
  const spoken = text?.trim();
  if (!spoken) return;

  Speech.stop();

  const voices = await getVoices();
  const selected = pickVoiceForPersonality(voices, personality);
  const rate = Math.min(2, Math.max(0.5, personality.voiceSpeed ?? 1.0));
  const pitch = pitchForUtterance(selected ?? null, personality.voiceGender);

  return new Promise((resolve) => {
    const options: Speech.SpeechOptions = {
      language: personality.language,
      pitch,
      rate,
      onDone: resolve,
      onError: () => resolve(),
    };

    if (selected?.identifier) {
      options.voice = selected.identifier;
    }

    Speech.speak(spoken, options);
  });
}

export function stopSpeaking() {
  Speech.stop();
}

export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

export async function listAvailableVoices(): Promise<string[]> {
  const voices = await getVoices();
  return voices.map((v) => `${v.name ?? v.identifier} (${v.language})`);
}
