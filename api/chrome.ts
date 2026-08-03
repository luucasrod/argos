/**
 * api/chrome.ts — Rotas para integração com Google Home/Smart Home API.
 * Endpoints: login, callback, devices, control, disconnect
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildAuthorizeUrl,
  controlChromeDevice,
  disconnectChrome,
  exchangeCodeForTokens,
  getUserFromAuthHeader,
  listChromeDevices,
  refreshAccessToken,
  supabaseAdmin,
} from './_lib/chrome';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const authHeader = req.headers.authorization as string | undefined;

  try {
    // ─── LOGIN ───
    if (req.method === 'GET' && action === 'login') {
      const user = await getUserFromAuthHeader(authHeader);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });

      const state = user.userId;
      const authorizeUrl = buildAuthorizeUrl(state);

      return res.status(200).json({ authUrl: authorizeUrl });
    }

    // ─── CALLBACK (OAuth redirect) ───
    if (req.method === 'GET' && action === 'callback') {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;

      if (!code || !state) {
        return res.status(400).json({ error: 'Code ou state ausente' });
      }

      const tokens = await exchangeCodeForTokens(code);

      const { error } = await supabaseAdmin.from('integrations').upsert(
        {
          user_id: state,
          provider: 'chrome',
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

      if (error) {
        return res.status(500).json({
          error: `Falha ao salvar tokens: ${error.message}`,
        });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      return res.redirect(`${appUrl}/settings?chrome=success`);
    }

    // ─── DEVICES ───
    if (req.method === 'GET' && action === 'devices') {
      const user = await getUserFromAuthHeader(authHeader);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });

      const { data: integration, error: fetchError } = await supabaseAdmin
        .from('integrations')
        .select('access_token,refresh_token,expires_at')
        .eq('user_id', user.userId)
        .eq('provider', 'chrome')
        .single();

      if (fetchError || !integration) {
        return res.status(200).json({ connected: false, devices: [] });
      }

      let accessToken = integration.access_token;
      const expiresAt = new Date(integration.expires_at).getTime();

      if (expiresAt < Date.now()) {
        try {
          const renewed = await refreshAccessToken(integration.refresh_token);
          accessToken = renewed.accessToken;

          await supabaseAdmin
            .from('integrations')
            .update({
              access_token: renewed.accessToken,
              expires_at: new Date(Date.now() + renewed.expiresIn * 1000).toISOString(),
            })
            .eq('user_id', user.userId)
            .eq('provider', 'chrome');
        } catch {
          return res.status(200).json({ connected: false, devices: [] });
        }
      }

      try {
        const devices = await listChromeDevices(accessToken);
        return res.status(200).json({ connected: true, devices });
      } catch {
        return res.status(200).json({ connected: false, devices: [] });
      }
    }

    // ─── CONTROL ───
    if (req.method === 'POST' && action === 'control') {
      const user = await getUserFromAuthHeader(authHeader);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });

      const { deviceId, command, params } = req.body as {
        deviceId: string;
        command: string;
        params?: Record<string, unknown>;
      };

      const { data: integration, error: fetchError } = await supabaseAdmin
        .from('integrations')
        .select('access_token,refresh_token,expires_at')
        .eq('user_id', user.userId)
        .eq('provider', 'chrome')
        .single();

      if (fetchError || !integration) {
        return res.status(401).json({ error: 'Google Home não conectado' });
      }

      let accessToken = integration.access_token;
      const expiresAt = new Date(integration.expires_at).getTime();

      if (expiresAt < Date.now()) {
        try {
          const renewed = await refreshAccessToken(integration.refresh_token);
          accessToken = renewed.accessToken;

          await supabaseAdmin
            .from('integrations')
            .update({
              access_token: renewed.accessToken,
              expires_at: new Date(Date.now() + renewed.expiresIn * 1000).toISOString(),
            })
            .eq('user_id', user.userId)
            .eq('provider', 'chrome');
        } catch {
          return res.status(401).json({ error: 'Falha ao renovar token Google' });
        }
      }

      await controlChromeDevice(accessToken, { deviceId, command, params });
      return res.status(200).json({ success: true });
    }

    // ─── DISCONNECT ───
    if (req.method === 'POST' && action === 'disconnect') {
      const user = await getUserFromAuthHeader(authHeader);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });

      await disconnectChrome(user.userId);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action não suportada' });
  } catch (err) {
    console.error('[chrome] erro:', err);
    return res.status(500).json({
      error: String(err),
    });
  }
}
