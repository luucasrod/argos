/** Pausa de silêncio após falar antes de enviar automaticamente (ms). */
export const VOICE_SILENCE_MS = 2500;

export interface UseVoiceOptions {
  onAutoSend?: (text: string) => void;
  silenceMs?: number;
}

/** Opções de velocidade da fala (Web Speech API rate). */
export const VOICE_SPEED_OPTIONS = [
  { value: 0.75, label: 'Lenta' },
  { value: 0.9, label: 'Calma' },
  { value: 1.0, label: 'Normal' },
  { value: 1.2, label: 'Rápida' },
  { value: 1.4, label: 'Muito rápida' },
] as const;

export const VOICE_PREVIEW_PHRASE = 'Olá! Esta é a minha voz. Como posso te ajudar?';
