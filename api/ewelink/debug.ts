/** Diagnóstico temporário — remover depois de identificar o problema. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserFromAuthHeader } from '../_lib/ewelink';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const appId = process.env.EWELINK_APP_ID ?? '';
  const appSecret = process.env.EWELINK_APP_SECRET ?? '';
  const expectedAppId = 'DNdFGgy46PxDF20YcEbVDHKqlf64i9WO';

  return res.status(200).json({
    appIdLength: appId.length,
    appIdMatchesExpected: appId === expectedAppId,
    appIdFirst5: appId.slice(0, 5),
    appIdLast5: appId.slice(-5),
    appIdHasWhitespace: appId !== appId.trim(),
    appSecretLength: appSecret.length,
    appSecretHasWhitespace: appSecret !== appSecret.trim(),
    appSecretFirst3: appSecret.slice(0, 3),
  });
}
