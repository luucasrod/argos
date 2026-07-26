import type { ParsedIntent } from '@/services/ai/intentParser';

/* Cobre os blocos Unicode de emoji/pictogramas/dingbats — removidos antes do TTS
   pra evitar o sintetizador "falar" o nome do emoji (ex: "carinha sorridente"). */
const EMOJI_RE = new RegExp(
  '[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2190}-\\u{21FF}\\u{2B00}-\\u{2BFF}\\u{FE0F}\\u{200D}]',
  'gu'
);

/** Remove emojis do texto (rede de segurança caso o modelo ignore a instrução). */
export function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/** Remove markdown para leitura em voz alta. */
export function stripForSpeech(text: string): string {
  return stripEmojis(
    text
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, '. ')
      .trim()
  );
}

/** Texto que o Argos deve falar — sempre tenta speech, depois text. */
export function resolveIntentSpeech(intent: ParsedIntent): string {
  const speech = intent.speech?.trim();
  if (speech) return stripForSpeech(speech);
  const text = intent.text?.trim();
  if (text) return stripForSpeech(text);
  return '';
}
