/**
 * sttDeepgram.ts — cliente Deepgram para STT incremental.
 *
 * Caminho novo para voz aberta: quem tiver PCM16 mono 16kHz em chunks pode
 * alimentar `DeepgramStreamingTranscriber` e receber parciais/finais sem esperar
 * a fala acabar. O caminho antigo (`transcribeNative.ts`, Whisper por arquivo)
 * fica como fallback para gravações `expo-av`, porque ele ainda não entrega PCM
 * em tempo real no JS sem adicionar módulo nativo.
 */
import { fetch as expoFetch } from 'expo/fetch';
import { API_BASE } from '@/constants/api';
import { getAccessToken } from '@/services/auth/session';

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen';
const SERVER_TIMEOUT_MS = 20_000;

export type DeepgramTranscriptType = 'partial' | 'final' | 'error' | 'open' | 'close';

export interface DeepgramTranscriptEvent {
  type: DeepgramTranscriptType;
  text: string;
  confidence?: number;
  isFinal?: boolean;
  speechFinal?: boolean;
  error?: string;
}

export interface DeepgramStreamingOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  sampleRate?: number;
  channels?: number;
  interimResults?: boolean;
  endpointingMs?: number;
  onTranscript?: (event: DeepgramTranscriptEvent) => void;
  onError?: (error: Error) => void;
}

type WebSocketWithHeaders = typeof WebSocket & {
  new (url: string, protocols?: string | string[], options?: { headers?: Record<string, string> }): WebSocket;
};

function envDeepgramKey(): string {
  return (
    process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY ??
    process.env.DEEPGRAM_API_KEY ??
    ''
  ).trim();
}

function buildDeepgramUrl(opts: DeepgramStreamingOptions): string {
  const params = new URLSearchParams({
    model: opts.model ?? 'nova-3',
    language: opts.language ?? 'pt',
    interim_results: String(opts.interimResults ?? true),
    smart_format: 'true',
    punctuate: 'true',
    encoding: 'linear16',
    sample_rate: String(opts.sampleRate ?? 16000),
    channels: String(opts.channels ?? 1),
    endpointing: String(opts.endpointingMs ?? 300),
  });
  return `${DEEPGRAM_URL}?${params.toString()}`;
}

function parseDeepgramMessage(raw: string): DeepgramTranscriptEvent | null {
  try {
    const msg = JSON.parse(raw) as {
      type?: string;
      is_final?: boolean;
      speech_final?: boolean;
      channel?: { alternatives?: { transcript?: string; confidence?: number }[] };
      error?: string;
      message?: string;
    };

    if (msg.type === 'Error') {
      return { type: 'error', text: '', error: msg.error ?? msg.message ?? 'deepgram_error' };
    }

    if (msg.type !== 'Results') return null;

    const alt = msg.channel?.alternatives?.[0];
    const text = alt?.transcript?.trim() ?? '';
    if (!text && !msg.is_final) return null;

    return {
      type: msg.is_final ? 'final' : 'partial',
      text,
      confidence: alt?.confidence,
      isFinal: msg.is_final === true,
      speechFinal: msg.speech_final === true,
    };
  } catch {
    return null;
  }
}

export class DeepgramStreamingTranscriber {
  private ws: WebSocket | null = null;
  private openPromise: Promise<void> | null = null;
  private closed = false;

  constructor(private readonly opts: DeepgramStreamingOptions = {}) {}

  start(): Promise<void> {
    if (this.openPromise) return this.openPromise;

    const apiKey = (this.opts.apiKey ?? envDeepgramKey()).trim();
    if (!apiKey) {
      const err = new Error('deepgram_api_key_missing');
      this.opts.onError?.(err);
      return Promise.reject(err);
    }

    this.closed = false;
    console.log('[DEEPGRAM] abrindo WebSocket de STT streaming');

    this.openPromise = new Promise<void>((resolve, reject) => {
      const SocketCtor = WebSocket as WebSocketWithHeaders;
      const ws = new SocketCtor(buildDeepgramUrl(this.opts), undefined, {
        headers: { Authorization: `Token ${apiKey}` },
      });
      this.ws = ws;

      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        console.log('[DEEPGRAM] WebSocket aberto');
        this.opts.onTranscript?.({ type: 'open', text: '' });
        resolve();
      };
      ws.onmessage = (message) => {
        const data = typeof message.data === 'string' ? message.data : '';
        const event = data ? parseDeepgramMessage(data) : null;
        if (!event) return;
        console.log(
          `[DEEPGRAM] ${event.type}${event.confidence != null ? ` conf=${event.confidence.toFixed(2)}` : ''}: "${event.text}"`
        );
        this.opts.onTranscript?.(event);
      };
      ws.onerror = () => {
        const err = new Error('deepgram_ws_error');
        console.warn('[DEEPGRAM] erro no WebSocket');
        this.opts.onError?.(err);
        reject(err);
      };
      ws.onclose = () => {
        this.closed = true;
        console.log('[DEEPGRAM] WebSocket fechado');
        this.opts.onTranscript?.({ type: 'close', text: '' });
      };
    });

    return this.openPromise;
  }

  async sendChunk(chunk: ArrayBuffer | Uint8Array): Promise<void> {
    await this.start();
    if (!this.ws || this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
  }

  finalize(): void {
    if (!this.ws || this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    console.log('[DEEPGRAM] finalize');
    this.ws.send(JSON.stringify({ type: 'Finalize' }));
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.openPromise = null;
  }
}

function parseSseEvents(buffer: string): { events: DeepgramTranscriptEvent[]; rest: string } {
  const events: DeepgramTranscriptEvent[] = [];
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const line = part.split(/\n/).find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      const json = JSON.parse(line.slice(6)) as {
        type?: string;
        text?: string;
        confidence?: number;
        is_final?: boolean;
        message?: string;
      };
      events.push({
        type: json.type === 'final' ? 'final' : json.type === 'error' ? 'error' : 'partial',
        text: json.text ?? '',
        confidence: json.confidence,
        isFinal: json.is_final,
        error: json.message,
      });
    } catch {}
  }

  return { events, rest };
}

async function readStreamingResponse(
  res: Response,
  onTranscript?: (event: DeepgramTranscriptEvent) => void
): Promise<string> {
  const body = res.body;
  if (!body) {
    const json = (await res.json().catch(() => ({}))) as { text?: string };
    return (json.text ?? '').trim();
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let finalText = '';
  let bestPartial = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const parsed = parseSseEvents(sseBuffer);
    sseBuffer = parsed.rest;
    for (const event of parsed.events) {
      if (event.type === 'final' && event.text) finalText = event.text;
      if (event.type === 'partial' && event.text) bestPartial = event.text;
      onTranscript?.(event);
    }
  }

  return (finalText || bestPartial).trim();
}

/**
 * Compatibilidade com o fluxo atual de `nativeMic`: tenta enviar o arquivo final
 * ao proxy Deepgram. Se o Android não conseguir ler `file://`, quem chama deve
 * cair para `transcribeNative.ts`.
 */
export async function transcribeRecordingDeepgram(
  uri: string,
  onTranscript?: (event: DeepgramTranscriptEvent) => void
): Promise<string> {
  console.log('[DEEPGRAM] transcrevendo gravação final via proxy');
  const token = await getAccessToken().catch(() => null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);

  let blob: Blob;
  try {
    const fileRes = await expoFetch(uri);
    blob = await fileRes.blob();
  } finally {
    clearTimeout(timeout);
  }

  const res = await expoFetch(`${API_BASE}/api/stt-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'audio/mp4',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: blob,
  });

  if (!res.ok) throw new Error(`deepgram_${res.status}`);
  return readStreamingResponse(res, onTranscript);
}

/** Transcreve WAV base64, usado pelo Vosk quando já tem o áudio do comando. */
export async function transcribeWavBase64Deepgram(
  audioBase64: string,
  onTranscript?: (event: DeepgramTranscriptEvent) => void
): Promise<string> {
  console.log('[DEEPGRAM] transcrevendo WAV base64 via proxy');
  const token = await getAccessToken().catch(() => null);
  const res = await expoFetch(`${API_BASE}/api/stt-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ audio: audioBase64, mimeType: 'audio/wav' }),
  });

  if (!res.ok) throw new Error(`deepgram_${res.status}`);
  return readStreamingResponse(res, onTranscript);
}
