/**
 * api/ewelink/devices.ts — lista os dispositivos eWeLink do usuário logado.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ewelinkRequest, getUserFromAuthHeader, getValidAccessToken, supabaseAsUser } from '../_lib/ewelink';

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
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' });
  }

  const client = supabaseAsUser(user.token);
  const tokenInfo = await getValidAccessToken(client, user.userId);
  if (!tokenInfo) {
    return res.status(200).json({ connected: false, devices: [] });
  }

  try {
    const result = await ewelinkRequest(tokenInfo.region, '/v2/device/thing?num=0', {
      accessToken: tokenInfo.accessToken,
    });

    if (result.error !== 0) {
      return res.status(502).json({ error: 'ewelink_error', message: result.msg });
    }

    const thingList = (result.data.thingList as Array<{ itemType: number; itemData: Record<string, unknown> }>) ?? [];
    const devices = thingList
      .filter((t) => t.itemType === 1 || t.itemType === 2)
      .map((t) => {
        const d = t.itemData;
        const params = (d.params as Record<string, unknown>) ?? {};
        // Dispositivos multi-canal (ex.: tomadas com várias saídas) reportam o
        // estado em params.switches (array por outlet), não em params.switch.
        const switches = params.switches as Array<{ switch: string; outlet: number }> | undefined;
        const isOn = switches?.length
          ? switches.some((s) => s.switch === 'on')
          : params.switch === 'on';
        return {
          deviceid: d.deviceid as string,
          name: d.name as string,
          online: d.online as boolean,
          isOn,
          productModel: d.productModel as string | undefined,
        };
      });

    return res.status(200).json({ connected: true, devices });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar dispositivos eWeLink';
    return res.status(502).json({ error: 'ewelink_error', message });
  }
}
