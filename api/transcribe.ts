/**
 * api/transcribe.ts — transcrição de voz via OpenAI Whisper (whisper-1).
 *
 * Aceita duas formas de envio:
 *   1. JSON  { audio: <base64>, mimeType } — usado pela web
 *      (services/voice/customCapture.web.ts e wakeWordDetector.web.ts).
 *   2. multipart/form-data com o campo `file` — usado pelo nativo
 *      (services/voice/transcribeNative.ts). No React Native o upload de
 *      arquivo é via FormData `{ uri, name, type }`, que a camada nativa lê do
 *      disco; ler o arquivo em JS para base64 não é viável lá (expo-file-system
 *      não está instalado, e `fetch('file://…')` não é confiável no Android).
 *
 * O bodyParser do Vercel fica desligado para dar acesso ao corpo cru — por isso
 * o JSON também é parseado à mão aqui.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

const MAX_BODY_BYTES = 12 * 1024 * 1024;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function isAuthed(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return !error && !!data.user;
}

function extFromMime(mimeType: string | undefined): string {
  if (!mimeType) return 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
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

interface MultipartFile {
  data: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Extrai o primeiro campo de arquivo de um corpo multipart. Trabalha sobre
 * Buffer (nunca string) para não corromper os bytes do áudio.
 */
export function parseMultipartFile(body: Buffer, boundary: string): MultipartFile | null {
  const delimiter = Buffer.from(`--${boundary}`);
  const headerEnd = Buffer.from('\r\n\r\n');

  const bounds: number[] = [];
  let at = body.indexOf(delimiter);
  while (at !== -1) {
    bounds.push(at);
    at = body.indexOf(delimiter, at + delimiter.length);
  }
  if (bounds.length < 2) return null;

  for (let i = 0; i < bounds.length - 1; i++) {
    let start = bounds[i] + delimiter.length;
    // pula o CRLF que segue o delimitador
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    let end = bounds[i + 1];
    // remove o CRLF que precede o próximo delimitador
    if (body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2;
    if (end <= start) continue;

    const part = body.subarray(start, end);
    const sep = part.indexOf(headerEnd);
    if (sep === -1) continue;

    const headers = part.subarray(0, sep).toString('utf8');
    const disposition = /content-disposition:([^\r\n]*)/i.exec(headers)?.[1] ?? '';
    const filename = /filename\s*=\s*"([^"]*)"/i.exec(disposition)?.[1] ?? '';
    const fieldName = /\bname\s*=\s*"([^"]*)"/i.exec(disposition)?.[1] ?? '';

    // Só interessa a parte que é arquivo
    if (!filename && fieldName !== 'file' && fieldName !== 'audio') continue;

    const contentType =
      /content-type:\s*([^\r\n;]*)/i.exec(headers)?.[1]?.trim() || 'audio/mp4';

    return {
      data: part.subarray(sep + headerEnd.length),
      filename: filename || 'audio.m4a',
      contentType,
    };
  }

  return null;
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

  if (!(await isAuthed(req.headers.authorization))) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'stt_not_configured',
      message: 'OPENAI_API_KEY não configurada no servidor.',
    });
  }

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  const contentType = String(req.headers['content-type'] ?? '');
  let audioBuffer: Buffer | null = null;
  let audioMime = 'audio/mp4';
  let audioName = 'audio.mp4';

  if (contentType.includes('multipart/form-data')) {
    const boundary =
      /boundary\s*=\s*"?([^";]+)"?/i.exec(contentType)?.[1]?.trim() ?? '';
    if (!boundary) {
      return res.status(400).json({ error: 'invalid_request', message: 'boundary ausente' });
    }
    const file = parseMultipartFile(raw, boundary);
    if (!file) {
      return res
        .status(400)
        .json({ error: 'invalid_request', message: 'campo de arquivo ausente' });
    }
    audioBuffer = file.data;
    audioMime = file.contentType;
    audioName = file.filename;
  } else {
    let parsed: { audio?: string; mimeType?: string };
    try {
      parsed = JSON.parse(raw.toString('utf8')) as { audio?: string; mimeType?: string };
    } catch {
      return res.status(400).json({ error: 'invalid_request', message: 'JSON inválido' });
    }
    if (!parsed.audio) {
      return res.status(400).json({ error: 'invalid_request', message: 'audio é obrigatório' });
    }
    audioBuffer = Buffer.from(parsed.audio, 'base64');
    audioMime = parsed.mimeType || 'audio/webm';
    audioName = `audio.${extFromMime(parsed.mimeType)}`;
  }

  try {
    if (!audioBuffer || audioBuffer.byteLength < 800) {
      // Áudio praticamente vazio — evita gastar uma chamada transcrevendo silêncio.
      return res.status(200).json({ text: '' });
    }

    const blob = new Blob([new Uint8Array(audioBuffer)], { type: audioMime });
    const form = new FormData();
    form.append('file', blob, audioName);
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

    const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return res.status(502).json({ error: 'openai_error', message: errText.slice(0, 500) });
    }

    const json = (await openaiRes.json()) as { text?: string };
    return res.status(200).json({ text: (json.text ?? '').trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao transcrever';
    return res.status(502).json({ error: 'stt_error', message });
  }
}
