import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  supabaseAsUser,
  getUserFromAuthHeader,
  tapoLogin,
  tapoGetDevices,
  tapoControl,
  saveTapoAccount,
  getTapoToken,
} from './_lib/tapo';

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
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    try {
      const { token } = await tapoLogin(body.email.trim(), body.password);
      await saveTapoAccount(auth.user.id, token, auth.token);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[tapo] login error:', err);
      return res.status(401).json({ error: err instanceof Error ? err.message : 'Falha ao autenticar na Tapo.' });
    }
  }

  // ── devices ───────────────────────────────────────────────────────────────
  if (action === 'devices') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const token = await getTapoToken(auth.user.id, auth.token);
      const devices = await tapoGetDevices(token);
      return res.json({ connected: true, devices });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('não conectada')) return res.json({ connected: false, devices: [] });
      console.error('[tapo] devices error:', err);
      return res.status(502).json({ error: msg });
    }
  }

  // ── control ───────────────────────────────────────────────────────────────
  if (action === 'control') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { deviceId?: string; appServerUrl?: string; property?: string; value?: unknown };
    if (!body.deviceId || !body.appServerUrl || body.property === undefined)
      return res.status(400).json({ error: 'deviceId, appServerUrl e property são obrigatórios.' });

    try {
      const token = await getTapoToken(auth.user.id, auth.token);
      await tapoControl(body.deviceId, body.appServerUrl, token, body.property, body.value);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[tapo] control error:', err);
      return res.status(502).json({ error: err instanceof Error ? err.message : 'Falha ao controlar dispositivo Tapo.' });
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAsUser(auth.token).from('tapo_accounts').delete().eq('user_id', auth.user.id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
