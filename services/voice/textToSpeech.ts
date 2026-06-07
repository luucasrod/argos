import * as Speech from 'expo-speech';
import { AIPersonality } from '@/types/ai.types';

export async function textToSpeech(text: string, personality: AIPersonality): Promise<void> {
  return new Promise((resolve) => {
    Speech.stop();

    const options: Speech.SpeechOptions = {
      language: personality.language,
      pitch: personality.voiceGender === 'female' ? 1.2 : 0.9,
      rate: personality.voiceSpeed,
      onDone: resolve,
      onError: (error) => {
        console.warn('TTS error:', error);
        resolve();
      },
    };

    Speech.speak(text, options);
  });
}

export function stopSpeaking() {
  Speech.stop();
}

export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
