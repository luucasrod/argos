/**
 * api/ewelink/authorize.ts — gera a URL de autorização OAuth do eWeLink.
 * O App Secret nunca sai do servidor.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildAuthorizeUrl, getUserFromAuthHeader } from '../_lib/ewelink';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Faça login para conectar dispositivos.' });
  }

  const origin = `https://${req.headers.host}`;
  const redirectUrl = `${origin}/integrations/ewelink/callback`;
  const url = buildAuthorizeUrl(redirectUrl, user.userId);

  return res.status(200).json({ url });
}
