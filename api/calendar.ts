import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  supabaseAsUser,
  getUserFromAuthHeader,
  getGoogleCalendarAuthorizeUrl,
  getValidGoogleCalendarToken,
  listUpcomingEvents,
  encodeState,
} from './_lib/googleCalendar';
import { REDIRECT_URI } from './_lib/googleCalendarConfig';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query['action'] as string | undefined;

  // ── authorize ────────────────────────────────────────────────────────────
  if (action === 'authorize') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const platform = req.query['platform'] === 'web' ? 'web' : 'native';
    const state = encodeState(auth.user.id, platform);
    const url = getGoogleCalendarAuthorizeUrl(state, REDIRECT_URI);
    return res.json({ url });
  }

  // ── events ───────────────────────────────────────────────────────────────
  if (action === 'events') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const token = await getValidGoogleCalendarToken(auth.user.id, auth.token);
      const events = await listUpcomingEvents(token);
      return res.json({ connected: true, events });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not connected')) return res.status(401).json({ connected: false, events: [] });
      console.error('[calendar] events error:', err);
      return res.status(502).json({ error: msg });
    }
  }

  // ── disconnect ───────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    const auth = await getUserFromAuthHeader(req.headers.authorization ?? null);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAsUser(auth.token).from('google_calendar_accounts').delete().eq('user_id', auth.user.id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
