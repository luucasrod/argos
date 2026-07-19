import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  supabaseAsUser,
  getUserFromAuthHeader,
  xiaomiLogin,
  xiaomiListFans,
  xiaomiSetProperty,
  saveXiaomiAccount,
  getXiaomiAccount,
  XiaomiVerificationRequiredError,
} from './_lib/xiaomi';

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
      const session = await xiaomiLogin(body.email.trim(), body.password);
      const { region } = await xiaomiListFans(session, '');
      await saveXiaomiAccount(auth.user.id, auth.token, session, region);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[xiaomi] login error:', err);
      if (err instanceof XiaomiVerificationRequiredError) {
        return res.status(401).json({ error: err.message, verificationUrl: err.verificationUrl });
      }
      return res.status(401).json({ error: err instanceof Error ? err.message : 'Falha ao autenticar na Xiaomi.' });
    }
  }

  // ── devices ───────────────────────────────────────────────────────────────
  if (action === 'devices') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { session, region } = await getXiaomiAccount(auth.user.id, auth.token);
      const { devices } = await xiaomiListFans(session, region);
      return res.json({ connected: true, devices });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('não conectada')) return res.json({ connected: false, devices: [] });
      console.error('[xiaomi] devices error:', err);
      return res.status(502).json({ error: msg });
    }
  }

  // ── control ───────────────────────────────────────────────────────────────
  if (action === 'control') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { did?: string; siid?: number; piid?: number; value?: unknown };
    if (!body.did || body.siid === undefined || body.piid === undefined || body.value === undefined)
      return res.status(400).json({ error: 'did, siid, piid e value são obrigatórios.' });

    try {
      const { session, region } = await getXiaomiAccount(auth.user.id, auth.token);
      await xiaomiSetProperty(session, region, body.did, body.siid, body.piid, body.value);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[xiaomi] control error:', err);
      return res.status(502).json({ error: err instanceof Error ? err.message : 'Falha ao controlar o ventilador Xiaomi.' });
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAsUser(auth.token).from('xiaomi_accounts').delete().eq('user_id', auth.user.id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
