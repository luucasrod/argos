import type { ParsedIntent } from '@/services/ai/intentParser';

/** Remove markdown para leitura em voz alta. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n+/g, '. ')
    .trim();
}

/** Texto que o Argos deve falar — sempre tenta speech, depois text. */
export function resolveIntentSpeech(intent: ParsedIntent): string {
  const speech = intent.speech?.trim();
  if (speech) return stripForSpeech(speech);
  const text = intent.text?.trim();
  if (text) return stripForSpeech(text);
  return '';
}
