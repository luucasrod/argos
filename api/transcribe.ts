/**
 * api/transcribe.ts — transcrição de voz via OpenAI Whisper (whisper-1).
 * Usado pela captura de microfone própria do Argos (services/voice/customCapture.web.ts),
 * que existe porque o SpeechRecognition nativo do Safari tem alcance de captação
 * muito curto comparado ao acesso privilegiado que a Siri tem ao hardware.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function isAuthed(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return !error && !!data.user;
}

function extFromMime(mimeType: string | undefined): string {
  if (!mimeType) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
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

  const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };
  if (!audio) {
    return res.status(400).json({ error: 'invalid_request', message: 'audio é obrigatório' });
  }

  try {
    const buffer = Buffer.from(audio, 'base64');
    if (buffer.byteLength < 800) {
      // Áudio praticamente vazio (ex: usuário soltou o botão na hora) — evita
      // gastar uma chamada de API pra transcrever silêncio.
      return res.status(200).json({ text: '' });
    }

    const blob = new Blob([buffer], { type: mimeType || 'audio/webm' });
    const form = new FormData();
    form.append('file', blob, `audio.${extFromMime(mimeType)}`);
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
