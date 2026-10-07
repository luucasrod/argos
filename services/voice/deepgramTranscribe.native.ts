/**
 * deepgramTranscribe.native.ts — cliente mobile para o endpoint /api/stt-stream.
 *
 * FASE 14 do Prompt Master: substitui o Whisper quando DEEPGRAM_API_KEY estiver
 * configurada no servidor. O endpoint já existe (api/stt-stream.ts) e retorna
 * SSE com transcrições parciais e finais.
 *
 * Quando a chave não está configurada no servidor, o endpoint retorna 503 e esta
 * função lança um erro — o chamador deve ter Whisper como fallback.
 *
 * Parsing de SSE no React Native: fetch() com ReadableStream é suportado em
 * React Native ≥ 0.73 (Hermes). Para versões anteriores, usamos acumulação de
 * texto e split em '\n\n' que é OTA-safe e não depende de módulo nativo.
 */
import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const TIMEOUT_MS = 20_000;
const SSE_DONE = '[DONE]';

type SseEvent =
  | { type: 'partial'; text: string; confidence?: number }
  | { type: 'final'; text: string; is_final: true; confidence?: number }
  | { type: 'timeout'; text: string }
  | { type: 'error'; code: string; message: string };

function parseSSEChunk(chunk: string): SseEvent[] {
  return chunk
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => {
      const raw = block.slice(6).trim();
      if (raw === SSE_DONE) return null;
      try {
        return JSON.parse(raw) as SseEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is SseEvent => e !== null);
}

/**
 * Transcreve um arquivo de áudio via Deepgram streaming.
 * Retorna o texto final ou lança erro se o servidor não estiver configurado.
 *
 * @param uri - URI do arquivo gravado (file:// no Android/iOS)
 */
export async function deepgramTranscribeRecording(uri: string): Promise<string> {
  const token = await getAccessToken().catch(() => null);

  const form = new FormData();
  form.append('file', {
    uri,
    name: 'audio.m4a',
    type: 'audio/mp4',
  } as unknown as Blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/stt-stream`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 503) throw new Error('deepgram_not_configured');
    throw new Error(`deepgram_${res.status}`);
  }

  // Acumula o corpo SSE e retorna o último texto marcado como final
  const body = await res.text();
  const events = parseSSEChunk(body);

  const finalEvent = [...events].reverse().find((e) => e.type === 'final');
  if (finalEvent) return finalEvent.text.trim();

  // Fallback: última parcial se não houver final
  const lastPartial = [...events].reverse().find((e) => e.type === 'partial');
  if (lastPartial) return lastPartial.text.trim();

  return '';
}

/**
 * Verifica se o servidor tem Deepgram configurado (faz um probe de 1 byte).
 * Resultado é cacheado por 5 minutos para não poluir logs.
 */
let _deepgramAvailable: boolean | null = null;
let _lastProbe = 0;
const PROBE_TTL_MS = 5 * 60_000;

export async function isDeepgramAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_deepgramAvailable !== null && now - _lastProbe < PROBE_TTL_MS) {
    return _deepgramAvailable;
  }
  try {
    const res = await fetch(`${API_BASE}/api/stt-stream`, {
      method: 'POST',
      body: new Uint8Array(0),
      signal: AbortSignal.timeout(3000),
    });
    // 503 = configurado mas sem chave; outros erros = servidor ok mas chave ausente
    _deepgramAvailable = res.status !== 503;
    _lastProbe = now;
    return _deepgramAvailable;
  } catch {
    _deepgramAvailable = false;
    _lastProbe = now;
    return false;
  }
}
