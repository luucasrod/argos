import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  supabaseAsUser,
  getUserFromAuthHeader,
  wizLogin,
  wizLoginWithGoogleToken,
  getWizToken,
  wizListDevices,
  wizControl,
  buildWizParams,
} from './_lib/wiz';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query['action'] as string | undefined;

  // ── login ─────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { email?: string; password?: string };
    if (!body.email || !body.password)
      return res.status(400).json({ error: 'email e password são obrigatórios' });

    try {
      const { token, homeId } = await wizLogin(body.email, body.password);

      await supabaseAsUser(auth.token).from('wiz_accounts').upsert(
        {
          user_id: auth.user.id,
          access_token: token,
          home_id: homeId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      return res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[wiz] login error:', err);
      return res.status(401).json({ error: msg });
    }
  }


  // ── save-token (token obtido do telemóvel, evita bloqueio Vercel) ────────
  if (action === 'save-token') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { wizToken?: string; homeId?: string };
    if (!body.wizToken) return res.status(400).json({ error: 'wizToken é obrigatório' });

    try {
      await supabaseAsUser(auth.token).from('wiz_accounts').upsert(
        {
          user_id: auth.user.id,
          access_token: body.wizToken,
          home_id: body.homeId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('[wiz] save-token error:', err);
      return res.status(500).json({ error: 'Falha ao guardar token WiZ' });
    }
  }

  // ── google-login ──────────────────────────────────────────────────────────
  if (action === 'google-login') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { googleToken?: string };
    if (!body.googleToken)
      return res.status(400).json({ error: 'googleToken é obrigatório' });

    try {
      const { token, homeId } = await wizLoginWithGoogleToken(body.googleToken);

      await supabaseAsUser(auth.token).from('wiz_accounts').upsert(
        {
          user_id: auth.user.id,
          access_token: token,
          home_id: homeId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      return res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[wiz] google-login error:', err);
      return res.status(401).json({ error: msg });
    }
  }

  // ── devices ───────────────────────────────────────────────────────────────
  if (action === 'devices') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { token, homeId } = await getWizToken(auth.user.id, auth.token);
      const devices = await wizListDevices(token, homeId);
      return res.json({ connected: true, devices });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not connected')) return res.status(401).json({ connected: false, devices: [] });
      console.error('[wiz] devices error:', err);
      return res.status(502).json({ error: msg });
    }
  }

  // ── control ───────────────────────────────────────────────────────────────
  if (action === 'control') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { mac?: string; property?: string; value?: unknown };
    if (!body.mac || body.property === undefined)
      return res.status(400).json({ error: 'mac e property são obrigatórios' });

    const params = buildWizParams(body.property, body.value);
    if (!params) return res.status(400).json({ error: 'Propriedade não suportada' });

    try {
      const { token } = await getWizToken(auth.user.id, auth.token);
      await wizControl(token, body.mac, params);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[wiz] control error:', err);
      return res.status(502).json({ error: 'Falha ao controlar lâmpada WiZ' });
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAsUser(auth.token).from('wiz_accounts').delete().eq('user_id', auth.user.id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
