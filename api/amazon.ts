import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  supabaseAsUser,
  getUserFromAuthHeader,
  getAmazonAuthorizeUrl,
  exchangeAmazonCode,
  getValidAmazonToken,
  alexaListDevices,
  alexaControlDevice,
  buildAlexaAction,
} from './_lib/amazon';

const REDIRECT_URI = 'https://argos-blue.vercel.app/integrations/amazon/callback';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query['action'] as string | undefined;

  // ── authorize ─────────────────────────────────────────────────────────────
  if (action === 'authorize') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    // state = userId (usado no callback para associar a conta)
    const url = getAmazonAuthorizeUrl(auth.user.id, REDIRECT_URI);
    return res.json({ url });
  }

  // ── exchange ───────────────────────────────────────────────────────────────
  if (action === 'exchange') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { code?: string; state?: string; region?: string };
    if (!body.code) return res.status(400).json({ error: 'code required' });

    try {
      const tokens = await exchangeAmazonCode(body.code, REDIRECT_URI);

      await supabaseAsUser(auth.token).from('amazon_accounts').upsert(
        {
          user_id: auth.user.id,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: tokens.tokenType,
          expires_at: tokens.expiresAt,
          region: body.region ?? 'na',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error('[amazon] exchange error:', err);
      return res.status(500).json({ error: 'Falha ao trocar código Amazon' });
    }
  }

  // ── devices ────────────────────────────────────────────────────────────────
  if (action === 'devices') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { token, region } = await getValidAmazonToken(auth.user.id, auth.token);
      const devices = await alexaListDevices(token, region);
      return res.json({ connected: true, devices });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not connected')) return res.status(401).json({ connected: false, devices: [] });
      console.error('[amazon] devices error:', err);
      return res.status(502).json({ error: msg });
    }
  }

  // ── control ────────────────────────────────────────────────────────────────
  if (action === 'control') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as {
      entityId?: string;
      entityType?: string;
      property?: string;
      value?: unknown;
    };
    if (!body.entityId || !body.entityType || body.property === undefined) {
      return res.status(400).json({ error: 'entityId, entityType, property required' });
    }

    const parameters = buildAlexaAction(body.property, body.value);
    if (!parameters) return res.status(400).json({ error: 'Unsupported property' });

    try {
      const { token, region } = await getValidAmazonToken(auth.user.id, auth.token);
      await alexaControlDevice(token, region, body.entityId, body.entityType, parameters);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[amazon] control error:', err);
      return res.status(502).json({ error: 'Falha ao controlar dispositivo Alexa' });
    }
  }

  // ── disconnect ─────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAsUser(auth.token).from('amazon_accounts').delete().eq('user_id', auth.user.id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
