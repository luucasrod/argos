/**
 * api/ewelink.ts — router unificado para todas as operações eWeLink.
 * ?action=authorize  GET  → URL OAuth
 * ?action=exchange   POST → trocar code por tokens
 * ?action=login      POST → login direto com e-mail/senha
 * ?action=devices    GET  → listar dispositivos
 * ?action=control    POST → liga/desliga um dispositivo
 *
 * Consolidado num único arquivo (era 5 rotas separadas) para caber no limite
 * de Serverless Functions do plano Hobby da Vercel.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  loginWithPassword,
  getUserFromAuthHeader,
  getValidAccessToken,
  ewelinkRequest,
  supabaseAsUser,
} from './_lib/ewelink';

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
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' });
  }

  // ── authorize ──────────────────────────────────────────────────────────────
  if (action === 'authorize' && req.method === 'GET') {
    const origin = `https://${req.headers.host}`;
    const redirectUrl = `${origin}/integrations/ewelink/callback`;
    const url = buildAuthorizeUrl(redirectUrl, user.userId);
    return res.status(200).json({ url });
  }

  // ── exchange ───────────────────────────────────────────────────────────────
  if (action === 'exchange' && req.method === 'POST') {
    const { code, region } = req.body as { code?: string; region?: string; state?: string };
    if (!code || !region) {
      return res.status(400).json({ error: 'invalid_request', message: 'code e region são obrigatórios' });
    }

    try {
      const origin = `https://${req.headers.host}`;
      const redirectUrl = `${origin}/integrations/ewelink/callback`;
      const tokens = await exchangeCodeForTokens(region, code, redirectUrl);

      const client = supabaseAsUser(user.token);
      const atExpiresAt = new Date(tokens.atExpiredTime).toISOString();
      const rtExpiresAt = new Date(tokens.rtExpiredTime).toISOString();

      const { error } = await client.from('ewelink_accounts').upsert({
        user_id: user.userId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        at_expires_at: atExpiresAt,
        rt_expires_at: rtExpiresAt,
        region,
        updated_at: new Date().toISOString(),
      });

      if (error) return res.status(500).json({ error: 'db_error', message: error.message });
      return res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao conectar eWeLink';
      return res.status(502).json({ error: 'ewelink_error', message });
    }
  }

  // ── login ──────────────────────────────────────────────────────────────────
  if (action === 'login' && req.method === 'POST') {
    const { email, password, countryCode } = req.body as {
      email?: string;
      password?: string;
      countryCode?: string;
    };

    if (!email || !password || !countryCode) {
      return res
        .status(400)
        .json({ error: 'invalid_request', message: 'email, password e countryCode são obrigatórios' });
    }

    try {
      const result = await loginWithPassword(email, password, countryCode);

      const client = supabaseAsUser(user.token);
      const atExpiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
      const rtExpiresAt = new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await client.from('ewelink_accounts').upsert({
        user_id: user.userId,
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        at_expires_at: atExpiresAt,
        rt_expires_at: rtExpiresAt,
        region: result.region,
        updated_at: new Date().toISOString(),
      });

      if (error) return res.status(500).json({ error: 'db_error', message: error.message });
      return res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao fazer login no eWeLink';
      return res.status(401).json({ error: 'ewelink_login_error', message });
    }
  }

  // ── devices ────────────────────────────────────────────────────────────────
  if (action === 'devices' && req.method === 'GET') {
    const client = supabaseAsUser(user.token);
    const tokenInfo = await getValidAccessToken(client, user.userId);
    if (!tokenInfo) {
      return res.status(200).json({ connected: false, devices: [] });
    }

    try {
      const result = await ewelinkRequest(tokenInfo.region, '/v2/device/thing?num=0', {
        accessToken: tokenInfo.accessToken,
      });

      if (result.error !== 0) {
        return res.status(502).json({ error: 'ewelink_error', message: result.msg });
      }

      const thingList = (result.data.thingList as Array<{ itemType: number; itemData: Record<string, unknown> }>) ?? [];
      const devices = thingList
        .filter((t) => t.itemType === 1 || t.itemType === 2)
        .map((t) => {
          const d = t.itemData;
          const params = (d.params as Record<string, unknown>) ?? {};
          const switches = params.switches as Array<{ switch: string; outlet: number }> | undefined;
          const isOn = switches?.length
            ? switches.some((s) => s.switch === 'on')
            : params.switch === 'on';
          return {
            deviceid: d.deviceid as string,
            name: d.name as string,
            online: d.online as boolean,
            isOn,
            productModel: d.productModel as string | undefined,
          };
        });

      return res.status(200).json({ connected: true, devices });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar dispositivos eWeLink';
      return res.status(502).json({ error: 'ewelink_error', message });
    }
  }

  // ── control ────────────────────────────────────────────────────────────────
  if (action === 'control' && req.method === 'POST') {
    const { deviceId, params } = req.body as { deviceId?: string; params?: Record<string, unknown> };
    if (!deviceId || !params) {
      return res.status(400).json({ error: 'invalid_request', message: 'deviceId e params são obrigatórios' });
    }

    const client = supabaseAsUser(user.token);
    const tokenInfo = await getValidAccessToken(client, user.userId);
    if (!tokenInfo) {
      return res.status(409).json({ error: 'not_connected', message: 'Conta eWeLink não conectada.' });
    }

    try {
      let outgoingParams = params;
      if (typeof params.switch === 'string') {
        const thingResult = await ewelinkRequest(tokenInfo.region, '/v2/device/thing?num=0', {
          accessToken: tokenInfo.accessToken,
        });
        const thingList =
          (thingResult.data?.thingList as Array<{ itemData: Record<string, unknown> }>) ?? [];
        const thing = thingList.find((t) => (t.itemData as { deviceid?: string }).deviceid === deviceId);
        const currentParams = (thing?.itemData as { params?: Record<string, unknown> })?.params;
        const switches = currentParams?.switches as Array<{ switch: string; outlet: number }> | undefined;
        if (switches?.length) {
          outgoingParams = { switches: switches.map((s) => ({ switch: params.switch, outlet: s.outlet })) };
        }
      }

      const result = await ewelinkRequest(tokenInfo.region, '/v2/device/thing/status', {
        method: 'POST',
        accessToken: tokenInfo.accessToken,
        body: { type: 1, id: deviceId, params: outgoingParams },
      });

      if (result.error !== 0) {
        console.error('[ewelink control] erro da API eWeLink', {
          deviceId,
          outgoingParams,
          region: tokenInfo.region,
          ewelinkError: result.error,
          ewelinkMsg: result.msg,
        });
        return res.status(502).json({ error: 'ewelink_error', message: result.msg });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao controlar dispositivo eWeLink';
      console.error('[ewelink control] exceção', { deviceId, params, message });
      return res.status(502).json({ error: 'ewelink_error', message });
    }
  }

  return res.status(400).json({ error: 'invalid_action', message: `Ação inválida: ${action}` });
}
