/**
 * commandAudioTranscribe.native.ts — transcreve o áudio do comando (WAV base64
 * capturado por ArgosVoiceModule) quando a gramática Vosk não deu conta.
 *
 * Estratégia (V-002):
 *   1. Tenta on-device via WhisperCppSTT (local, sem custo de rede, ~500ms–2s)
 *   2. Fallback para cloud (/api/transcribe com OPENAI_API_KEY) se local
 *      não estiver disponível ou falhar.
 *
 * O `audioBase64` chega como WAV PCM-16 (cabeçalho RIFF de 44 bytes) —
 * gerado por `ArgosVoiceModule.getCommandAudioBase64()`. O módulo nativo
 * remove o cabeçalho internamente antes de passar para o whisper.cpp.
 */
import { NativeModules } from 'react-native';
import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const CLOUD_TIMEOUT_MS = 10_000;
const LOCAL_TIMEOUT_MS = 8_000;

interface WhisperResult {
  text: string;
  confidence: number;
  duration_ms: number;
  language: string;
}

const WhisperCppSTT: {
  transcribeAudioWhisper(audio: string, lang: string): Promise<WhisperResult>;
  getModelInfo(): Promise<{ modelLoaded: boolean; nativeAvailable: boolean }>;
} | undefined = NativeModules.WhisperCppSTT;

/** Tenta transcrever localmente com whisper.cpp. Lança em qualquer falha. */
async function transcribeLocal(audioBase64: string): Promise<string> {
  if (!WhisperCppSTT) throw new Error('WhisperCppSTT não registrado');

  const info = await WhisperCppSTT.getModelInfo();
  if (!info.nativeAvailable || !info.modelLoaded) {
    throw new Error('modelo não carregado');
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('local_timeout')), LOCAL_TIMEOUT_MS)
  );

  const result = await Promise.race([
    WhisperCppSTT.transcribeAudioWhisper(audioBase64, 'pt'),
    timeout,
  ]);
  return result.text.trim();
}

/** Transcreve via /api/transcribe (cloud Whisper). Lança em qualquer falha. */
async function transcribeCloud(audioBase64: string): Promise<string> {
  const token = await getAccessToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);

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

  if (!res.ok) throw new Error(`transcribe_${res.status}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? '').trim();
}

/**
 * Ponto de entrada principal — local-first com fallback cloud.
 * `audioBase64` é WAV PCM-16 (cabeçalho RIFF incluído).
 */
export async function transcribeCommandAudio(audioBase64: string): Promise<string> {
  try {
    const localText = await transcribeLocal(audioBase64);
    if (localText) return localText;
  } catch {
    // Local não disponível ou falhou — cai pro cloud silenciosamente
  }
  return transcribeCloud(audioBase64);
}
