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
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY ?? '';

/**
 * Vozes ElevenLabs. O modelo flash é o de menor latência (~75ms de primeira
 * amostra) e suporta português — o que importa quando a resposta é falada
 * dirigindo. As vozes abaixo são as multilíngues públicas do catálogo.
 */
const ELEVEN_VOICES: Record<string, string> = {
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  laura: 'FGY2WhTYpPnrIDTdsKH5',
  alice: 'Xb7hH8MSUJpSbSDYk0k2',
  matilda: 'XrExE9yKIg1WjnnlVkGX',
  brian: 'nPczCjzI2devNBz1zQrb',
  george: 'JBFqnCBsd6RMkjVDRZzb',
  // Voz masculina pt-BR, sotaque brasileiro nativo, do catálogo COMPARTILHADO
  // (voice library) do ElevenLabs. Mantida no mapa (dá pra escolher via
  // ?voice=nassif) mas NÃO é o padrão: a API da ElevenLabs recusa vozes de
  // biblioteca compartilhada no plano grátis (402 payment_required) — só
  // funciona com assinatura paga. Se algum dia assinar, trocar
  // ELEVEN_DEFAULT_MALE para 'nassif' de volta.
  nassif: 'ulzsiMeCbfKyTPCNhCD5',
};
const ELEVEN_DEFAULT_FEMALE = 'sarah';
// George: multilíngue padrão (catálogo "premade"), funciona no plano grátis —
// testado em produção via probe. Sem sotaque brasileiro nativo como o Nassif,
// mas real e funcionando, ao contrário da alternativa paga.
const ELEVEN_DEFAULT_MALE = 'george';
const ELEVEN_MODEL = 'eleven_flash_v2_5';

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

  /*
   * GET = diagnóstico. Diz quais provedores estão configurados e, no caso do
   * ElevenLabs, consulta a cota real. Existe porque sem isto a única forma de
   * saber se a chave funciona é ouvir o app — e a queda para a voz do sistema é
   * silenciosa de propósito, então uma chave inválida parece "nada mudou".
   * Nunca devolve a chave, só se ela existe e se responde.
   */
  if (req.method === 'GET') {
    const health: Record<string, unknown> = {
      elevenlabs_configured: !!ELEVEN_KEY,
      azure_configured: !!AZURE_KEY,
      auth_required: !!SUPABASE_ANON_KEY,
      model: ELEVEN_MODEL,
    };
    if (ELEVEN_KEY) {
      try {
        const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
          headers: { 'xi-api-key': ELEVEN_KEY },
        });
        if (r.ok) {
          const sub = (await r.json()) as {
            tier?: string;
            character_count?: number;
            character_limit?: number;
          };
          health.elevenlabs = {
            ok: true,
            tier: sub.tier,
            usados: sub.character_count,
            limite: sub.character_limit,
          };
        } else {
          health.elevenlabs = { ok: false, status: r.status, message: (await r.text()).slice(0, 200) };
        }
      } catch (err) {
        health.elevenlabs = { ok: false, message: err instanceof Error ? err.message : 'falha de rede' };
      }
    }
    /*
     * ?probe=1 sintetiza uma frase mínima e devolve só o tamanho do áudio.
     * É a única forma de provar que o formato do pedido (voz, modelo,
     * voice_settings) está certo sem depender de um token de sessão — saber que
     * a chave é válida não prova que o corpo do POST é aceito.
     */
    if (req.query?.probe && ELEVEN_KEY) {
      const probeVoiceId =
        typeof req.query.probe === 'string' && req.query.probe.length > 5
          ? req.query.probe
          : ELEVEN_VOICES[ELEVEN_DEFAULT_MALE];
      try {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${probeVoiceId}?output_format=mp3_22050_32`,
          {
            method: 'POST',
            headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: 'Oi',
              model_id: ELEVEN_MODEL,
              voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1 },
            }),
          }
        );
        health.probe = r.ok
          ? { ok: true, bytes: (await r.arrayBuffer()).byteLength }
          : { ok: false, status: r.status, message: (await r.text()).slice(0, 300) };
      } catch (err) {
        health.probe = { ok: false, message: err instanceof Error ? err.message : 'falha' };
      }
    }

    /*
     * ?voices=1 lista as vozes masculinas de português do catálogo compartilhado.
     * A API exige chave para filtrar, então a consulta tem que sair daqui.
     */
    if (req.query?.voices && ELEVEN_KEY) {
      try {
        const r = await fetch(
          'https://api.elevenlabs.io/v1/shared-voices?page_size=40&language=pt&gender=male&sort=trending',
          { headers: { 'xi-api-key': ELEVEN_KEY } }
        );
        const j = (await r.json()) as { voices?: any[] };
        health.voices = (j.voices ?? []).map((v) => ({
          id: v.voice_id,
          nome: v.name,
          sotaque: v.accent,
          idade: v.age,
          descricao: v.descriptive,
          uso: v.use_case,
          idioma: v.language,
        }));
      } catch (err) {
        health.voices = { erro: err instanceof Error ? err.message : 'falha' };
      }
    }

    return res.status(200).json(health);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Nenhum provedor configurado: o cliente usa este código para cair na voz do
  // sistema sem mostrar erro ao usuário.
  if (!AZURE_KEY && !ELEVEN_KEY) {
    return res.status(503).json({ error: 'tts_not_configured' });
  }

  if (!(await isAuthed(req.headers.authorization))) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { text, voice, rate, pitch, gender } = (req.body ?? {}) as {
    text?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    gender?: 'male' | 'female';
  };

  const clean = (text ?? '').trim().slice(0, MAX_CHARS);
  if (!clean) return res.status(400).json({ error: 'text_required' });

  /*
   * ElevenLabs tem prioridade quando configurado: é a melhor qualidade
   * disponível e o plano gratuito não pede cartão. O Azure entra como segunda
   * opção (500 mil caracteres/mês grátis, mas exige subscrição com cartão).
   * Sem nenhum dos dois, o cliente usa a voz do sistema.
   */
  if (ELEVEN_KEY) {
    /*
     * Se o cliente não pedir um nome de voz específico, escolhe pelo gênero
     * salvo nas preferências do usuário (settings.personality.voiceGender).
     * Sem isso o servidor sempre caía na voz feminina padrão, ignorando o
     * toggle de gênero que já existe nas configurações do app.
     */
    const defaultForGender = gender === 'male' ? ELEVEN_DEFAULT_MALE : ELEVEN_DEFAULT_FEMALE;
    const voiceId =
      ELEVEN_VOICES[(voice ?? '').toLowerCase()] ?? ELEVEN_VOICES[defaultForGender];
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVEN_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: clean,
            model_id: ELEVEN_MODEL,
            /*
             * O ElevenLabs só aceita speed entre 0.7 e 1.2 — fora disso devolve
             * 422 e a fala cai para a voz do sistema sem aviso. O app usa a
             * escala 0.5–2.0, então converte aqui em vez de deixar falhar.
             */
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              speed: Math.min(1.2, Math.max(0.7, typeof rate === 'number' && isFinite(rate) ? rate : 1)),
            },
          }),
        }
      );

      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        return res
          .status(200)
          .json({ audio: buf.toString('base64'), mime: 'audio/mpeg', provider: 'elevenlabs' });
      }

      // Cota estourada ou chave inválida: cai para o Azure se houver, senão 502.
      const detail = await r.text();
      if (!AZURE_KEY) {
        return res
          .status(502)
          .json({ error: 'eleven_error', status: r.status, message: detail.slice(0, 300) });
      }
    } catch {
      if (!AZURE_KEY) return res.status(502).json({ error: 'eleven_error' });
    }
  }

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
