/**
 * api/ewelink/exchange.ts — troca o "code" do OAuth por tokens e salva no Supabase.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCodeForTokens, getUserFromAuthHeader, supabaseAsUser } from '../_lib/ewelink';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' });
  }

  const { code, region, state } = req.body as { code?: string; region?: string; state?: string };
  if (!code || !region) {
    return res.status(400).json({ error: 'invalid_request', message: 'code e region são obrigatórios' });
  }
  if (state && state !== user.userId) {
    return res.status(400).json({ error: 'invalid_state', message: 'State não corresponde ao usuário logado' });
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

    if (error) {
      return res.status(500).json({ error: 'db_error', message: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao conectar eWeLink';
    return res.status(502).json({ error: 'ewelink_error', message });
  }
}
