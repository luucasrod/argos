/**
 * api/ewelink/login.ts — login direto com e-mail/senha do eWeLink
 * (alternativa à página OAuth, que depende de propagação do APPID).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserFromAuthHeader, loginWithPassword, supabaseAsUser } from '../_lib/ewelink';

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

    if (error) {
      return res.status(500).json({ error: 'db_error', message: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao fazer login no eWeLink';
    return res.status(401).json({ error: 'ewelink_login_error', message });
  }
}
