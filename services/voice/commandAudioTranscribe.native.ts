/**
 * commandAudioTranscribe.native.ts — manda o áudio do comando (capturado por
 * services/voice/argosVoiceNative.ts) pro Whisper via api/transcribe.ts, que
 * JÁ EXISTE e já é usado pelo fluxo de toque-no-orb
 * (services/voice/customCapture.web.ts, mesmo formato de request). Usado só
 * quando a gramática fechada do Vosk não deu conta do comando (pergunta
 * livre) — ver docs/ai/CONTEXT.md, seção de Voz.
 */
import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const TIMEOUT_MS = 10_000;

/** `audioBase64` já vem como WAV (cabeçalho incluído) de `getCommandAudioBase64()`. */
export async function transcribeCommandAudio(audioBase64: string): Promise<string> {
  const token = await getAccessToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ audio: audioBase64, mimeType: 'audio/wav' }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`transcribe_${res.status}`);
  }

  const json = (await res.json()) as { text?: string };
  return (json.text ?? '').trim();
}
