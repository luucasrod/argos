/**
 * api/stt-stream.ts — STT streaming via Deepgram (nova-2).
 *
 * Recebe chunks de áudio PCM 16-bit 16kHz mono via POST e retorna
 * Server-Sent Events com as transcrições em tempo real.
 *
 * Fluxo:
 *   Cliente → POST /api/stt-stream (audio: PCM raw)
 *   Servidor → Deepgram WebSocket (nova-2, pt)
 *   Servidor ← SSE ← Deepgram ({type, text, confidence, is_final})
 *
 * Timeout de 30s para compatibilidade com o Vosk/Voice listening max.
 *
 * Custo: ~€0,03/min (Deepgram nova-2).
 */
import { DeepgramClient } from '@deepgram/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { api: { bodyParser: false } };

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? '';
const LISTENING_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 50 * 1024 * 1024;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sendSSE(res: VercelResponse, event: unknown): void {
  try {
    res.write(sseEvent(event));
  } catch {
    // Cliente já desconectou
  }
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error('payload_too_large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function sendError(res: VercelResponse, code: string, message: string, closed: boolean): void {
  if (closed) return;
  sendSSE(res, { type: 'error', code, message });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DEEPGRAM_API_KEY) {
    return res.status(503).json({
      error: 'stt_not_configured',
      message: 'DEEPGRAM_API_KEY não configurada no servidor.',
    });
  }

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  if (raw.byteLength < 800) {
    return res.status(200).json({ text: '' });
  }

  /* ── Configurar streaming SSE ── */
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.writeHead(200);

  let closed = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  function cleanup(): void {
    if (closed) return;
    closed = true;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    try { res.end(); } catch {}
  }

  /* ── Conectar ao Deepgram ── */
  let connection: Awaited<ReturnType<DeepgramClient['listen']['v1']['connect']>> | null = null;

  try {
    const deepgram = new DeepgramClient({ apiKey: DEEPGRAM_API_KEY });
connection = await deepgram.listen.v1.connect({
      model: 'nova-2',
      language: 'pt',
      interim_results: 'true',
      smart_format: 'true',
      sample_rate: 16000,
      Authorization: DEEPGRAM_API_KEY,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao conectar Deepgram';
    console.error('[stt-stream] Deepgram connect error:', message);
    return res.status(502).json({ error: 'stt_ws_error', message });
  }

  if (!connection) {
    return res.status(502).json({ error: 'stt_ws_error', message: 'Falha ao abrir conexão Deepgram' });
  }

  /* ── Tratar mensagens do Deepgram ── */
  connection.on('message', (data: unknown) => {
    if (closed) return;
    try {
      const msg = data as { type?: string; is_final?: boolean; channel?: { alternatives?: { transcript?: string; confidence?: number }[] } };
      if (msg.type !== 'Results') return;

      const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
      const confidence = msg.channel?.alternatives?.[0]?.confidence;
      const isFinal = msg.is_final === true;

      if (!transcript && !isFinal) return;

      sendSSE(res, {
        type: isFinal ? 'final' : 'partial',
        text: transcript,
        ...(confidence != null && { confidence }),
        is_final: isFinal,
      });
    } catch {
      /* Mensagem não parseável, ignorar */
    }
  });

  connection.on('error', (err: Error) => {
    if (closed) return;
    console.error('[stt-stream] Deepgram error:', err.message);
    sendError(res, 'dg_error', err.message, closed);
    cleanup();
  });

  connection.on('close', () => {
    if (closed) return;
    closed = true;
    try { res.end(); } catch {}
  });

  /* ── Enviar áudio para Deepgram ── */
  try {
    connection.sendMedia(raw);
  } catch (err) {
    if (closed) return;
    const message = err instanceof Error ? err.message : 'Erro ao enviar áudio';
    console.error('[stt-stream] Audio send error:', message);
    sendError(res, 'audio_send_error', message, closed);
    cleanup();
    return;
  }

  /* ── Aguardar fim da transcrição ou timeout ── */
  timeoutHandle = setTimeout(() => {
    if (!closed) {
      console.log('[stt-stream] 30s timeout atingido, encerrando');
      sendSSE(res, { type: 'timeout', text: '' });
      cleanup();
    }
  }, LISTENING_TIMEOUT_MS);

  /* ── Cleanup ao cliente desconectar ── */
  req.on('close', () => {
    if (!closed) {
      cleanup();
    }
  });
}
