/**
 * api/tts.ts — síntese de voz neural via Azure Speech.
 *
 * Fica no servidor de propósito: a chave nunca vai para o app, e Android, web,
 * Home Assistant e Python consomem o mesmo endpoint — uma implementação para
 * todas as plataformas.
 *
 * Se AZURE_SPEECH_KEY não estiver configurada, devolve 503 com um código que o
 * cliente reconhece para cair na voz do sistema. Ou seja: sem a chave nada quebra,
 * apenas continua com a voz antiga.
 *
 * Variáveis de ambiente necessárias (definidas por você no Vercel):
 *   AZURE_SPEECH_KEY     — KEY 1 do recurso Speech Services
 *   AZURE_SPEECH_REGION  — ex.: brazilsouth
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const AZURE_KEY = process.env.AZURE_SPEECH_KEY ?? '';
const AZURE_REGION = process.env.AZURE_SPEECH_REGION ?? 'brazilsouth';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Vozes pt-BR liberadas. O cliente manda a chave curta, não o nome completo. */
const VOICES: Record<string, string> = {
  francisca: 'pt-BR-FranciscaNeural',
  giovanna: 'pt-BR-GiovannaNeural',
  brenda: 'pt-BR-BrendaNeural',
  leila: 'pt-BR-LeilaNeural',
  antonio: 'pt-BR-AntonioNeural',
  fabio: 'pt-BR-FabioNeural',
  donato: 'pt-BR-DonatoNeural',
  julio: 'pt-BR-JulioNeural',
};
const DEFAULT_VOICE = 'francisca';

const MAX_CHARS = 1200;

async function isAuthed(authHeader: string | undefined): Promise<boolean> {
  if (!SUPABASE_ANON_KEY) return true; // sem auth configurada, não bloqueia
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return !error && !!data.user;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Converte a velocidade do app (0.5–2.0) para o formato do SSML (-50%…+100%). */
function ratePercent(rate: number | undefined): string {
  const r = typeof rate === 'number' && isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
  const pct = Math.round((r - 1) * 100);
  return (pct >= 0 ? '+' : '') + pct + '%';
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
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!AZURE_KEY) {
    // O cliente usa este código para cair na voz do sistema sem mostrar erro.
    return res.status(503).json({ error: 'tts_not_configured' });
  }

  if (!(await isAuthed(req.headers.authorization))) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { text, voice, rate, pitch } = (req.body ?? {}) as {
    text?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
  };

  const clean = (text ?? '').trim().slice(0, MAX_CHARS);
  if (!clean) return res.status(400).json({ error: 'text_required' });

  const voiceName = VOICES[(voice ?? '').toLowerCase()] ?? VOICES[DEFAULT_VOICE];
  const pitchPct =
    typeof pitch === 'number' && isFinite(pitch)
      ? (pitch >= 0 ? '+' : '') + Math.round(Math.min(50, Math.max(-50, pitch))) + '%'
      : '+0%';

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">` +
    `<voice name="${voiceName}">` +
    `<prosody rate="${ratePercent(rate)}" pitch="${pitchPct}">${escapeXml(clean)}</prosody>` +
    `</voice></speak>`;

  try {
    const azureRes = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/ssml+xml',
          // mp3 de 24kHz: bom equilíbrio entre qualidade e tamanho para rede móvel.
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'argos',
        },
        body: ssml,
      }
    );

    if (!azureRes.ok) {
      const detail = await azureRes.text();
      return res
        .status(502)
        .json({ error: 'azure_error', status: azureRes.status, message: detail.slice(0, 300) });
    }

    const buf = Buffer.from(await azureRes.arrayBuffer());
    return res.status(200).json({
      audio: buf.toString('base64'),
      mime: 'audio/mpeg',
      voice: voiceName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro ao sintetizar';
    return res.status(502).json({ error: 'tts_error', message });
  }
}
