/**
 * api/hue.ts — router unificado para todas as operações Philips Hue.
 * ?action=authorize  GET  → URL OAuth
 * ?action=exchange   POST → trocar code por tokens
 * ?action=lights     GET  → listar lâmpadas
 * ?action=control    POST → controlar lâmpada (on/off, brilho, cor, temperatura)
 *
 * Consolidado num único arquivo (era 4 rotas separadas) para caber no limite
 * de Serverless Functions do plano Hobby da Vercel.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildHueAuthorizeUrl,
  exchangeHueCode,
  getUserFromAuthHeader,
  getValidHueToken,
  hueRequest,
  hexToXy,
  tempNameToMirek,
  mapHueLights,
  createHueAppKey,
  supabaseAsUser,
} from './_lib/hue';

function cors(res: VercelResponse, methods: string) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;

  if (req.method === 'OPTIONS') {
    cors(res, 'GET, POST');
    return res.status(200).end();
  }

  cors(res, 'GET, POST');

  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Faça login para conectar dispositivos.' });
  }

  // ── authorize ──────────────────────────────────────────────────────────────
  if (action === 'authorize' && req.method === 'GET') {
    const origin = `https://${req.headers.host}`;
    const redirectUri = `${origin}/integrations/hue/callback`;
    const url = buildHueAuthorizeUrl(redirectUri);
    return res.status(200).json({ url });
  }

  // ── exchange ───────────────────────────────────────────────────────────────
  if (action === 'exchange' && req.method === 'POST') {
    const { code } = req.body as { code?: string };
    if (!code) {
      return res.status(400).json({ error: 'invalid_request', message: 'code é obrigatório' });
    }

    try {
      const origin = `https://${req.headers.host}`;
      const redirectUri = `${origin}/integrations/hue/callback`;
      const tokens = await exchangeHueCode(code, redirectUri);

      const atExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      let hueAppKey: string | null = null;
      try {
        hueAppKey = await createHueAppKey(tokens.access_token);
      } catch {
        // App key não crítico neste momento — salva o token mesmo assim
      }

      const client = supabaseAsUser(user.token);
      const { error } = await client.from('hue_accounts').upsert(
        {
          user_id: user.userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          at_expires_at: atExpiresAt,
          hue_app_key: hueAppKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        return res.status(500).json({ error: 'db_error', message: error.message });
      }

      return res.status(200).json({ ok: true, hasAppKey: !!hueAppKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao conectar Philips Hue';
      return res.status(502).json({ error: 'hue_error', message });
    }
  }

  // ── lights ─────────────────────────────────────────────────────────────────
  if (action === 'lights' && req.method === 'GET') {
    try {
      let { accessToken, appKey } = await getValidHueToken(user.userId, user.token);

      if (!appKey) {
        try {
          appKey = await createHueAppKey(accessToken);
          const client = supabaseAsUser(user.token);
          await client
            .from('hue_accounts')
            .update({ hue_app_key: appKey })
            .eq('user_id', user.userId);
        } catch {
          // Falha na criação do app key — continua sem ele
        }
      }

      const raw = await hueRequest('/resource/light', { accessToken, appKey: appKey ?? undefined });
      const lights = mapHueLights(raw);

      return res.status(200).json({ connected: true, lights });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar lâmpadas';
      const isNotConnected = message.includes('não conectada');
      return res
        .status(isNotConnected ? 401 : 502)
        .json({ error: isNotConnected ? 'not_connected' : 'hue_error', message });
    }
  }

  // ── control ────────────────────────────────────────────────────────────────
  if (action === 'control' && req.method === 'POST') {
    const { lightId, property, value } = req.body as {
      lightId?: string;
      property?: string;
      value?: unknown;
    };

    if (!lightId || !property || value === undefined) {
      return res.status(400).json({ error: 'invalid_request', message: 'lightId, property e value são obrigatórios' });
    }

    try {
      const { accessToken, appKey } = await getValidHueToken(user.userId, user.token);

      const hueBody: Record<string, unknown> = {};

      if (property === 'isOn') {
        hueBody.on = { on: Boolean(value) };
      } else if (property === 'brightness') {
        const bri = Math.max(1, Math.min(100, Number(value)));
        hueBody.dimming = { brightness: bri };
        hueBody.on = { on: true };
      } else if (property === 'color') {
        const hex = String(value);
        const xy = hexToXy(hex);
        if (!xy) {
          return res.status(400).json({ error: 'invalid_color', message: `Cor inválida: ${hex}` });
        }
        hueBody.color = { xy };
        hueBody.on = { on: true };
      } else if (property === 'colorTemperature') {
        const mirek = tempNameToMirek(value as string | number);
        if (!mirek) {
          return res.status(400).json({ error: 'invalid_temp', message: `Temperatura inválida: ${value}` });
        }
        hueBody.color_temperature = { mirek };
        hueBody.on = { on: true };
      } else {
        return res.status(400).json({ error: 'unknown_property', message: `Propriedade desconhecida: ${property}` });
      }

      await hueRequest(`/resource/light/${lightId}`, {
        method: 'PUT',
        body: hueBody,
        accessToken,
        appKey: appKey ?? undefined,
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao controlar lâmpada';
      return res.status(502).json({ error: 'hue_error', message });
    }
  }

  return res.status(400).json({ error: 'invalid_action', message: `Ação inválida: ${action}` });
}
