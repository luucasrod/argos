/** Pausa de silêncio após falar antes de enviar automaticamente (ms). */
export const VOICE_SILENCE_MS = 2500;

export interface UseVoiceOptions {
  onAutoSend?: (text: string) => void;
  silenceMs?: number;
}
