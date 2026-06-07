let Voice: { start: (locale: string) => Promise<void>; stop: () => Promise<void> } | null = null;

try {
  Voice = require('@react-native-voice/voice').default;
} catch {
  console.warn('Voice recognition not available');
}

export async function startSpeechRecognition(locale = 'pt-BR'): Promise<void> {
  if (!Voice) throw new Error('Reconhecimento de voz não disponível');
  await Voice.start(locale);
}

export async function stopSpeechRecognition(): Promise<void> {
  if (!Voice) return;
  await Voice.stop();
}

export function isVoiceAvailable(): boolean {
  return Voice !== null;
}
