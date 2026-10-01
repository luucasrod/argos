/**
 * api/chatStream.ts — endpoint explícito para Claude streaming.
 *
 * `/api/chat` continua aceitando `{ stream: true }` por compatibilidade. Esta
 * rota existe para consumidores que querem somente texto incremental para TTS.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { streamChat } from './chat';

const skipAuth = process.env.SKIP_AUTH === 'true';
const STREAM_ERROR_PREFIX = '\n__ARGOS_STREAM_ERROR__';

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co',
  process.env.SUPABASE_ANON_KEY ?? ''
);

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!skipAuth) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Token de autenticação ausente' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'server_error', message: 'API key não configurada no servidor' });
  }

  const { model, system, messages, max_tokens } = req.body;
  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'invalid_request', message: 'Parâmetros inválidos' });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    console.log('[STREAMING] /api/chatStream aberto');
    for await (const text of streamChat({ model, system, messages, max_tokens })) {
      res.write(text);
    }
  } catch (err) {
    const apiErr = err as { status?: number; error?: { type?: string; message?: string }; message?: string };
    res.write(
      `${STREAM_ERROR_PREFIX}:${JSON.stringify({
        error: apiErr.error?.type ?? 'stream_error',
        status: apiErr.status,
        message: apiErr.error?.message ?? apiErr.message ?? 'Erro no stream da Anthropic',
      })}\n`
    );
  }

  return res.end();
}
