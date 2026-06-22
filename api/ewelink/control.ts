/**
 * api/ewelink/control.ts — liga/desliga um dispositivo eWeLink do usuário logado.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ewelinkRequest, getUserFromAuthHeader, getValidAccessToken, supabaseAsUser } from '../_lib/ewelink';

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

  const { deviceId, params } = req.body as { deviceId?: string; params?: Record<string, unknown> };
  if (!deviceId || !params) {
    return res.status(400).json({ error: 'invalid_request', message: 'deviceId e params são obrigatórios' });
  }

  const client = supabaseAsUser(user.token);
  const tokenInfo = await getValidAccessToken(client, user.userId);
  if (!tokenInfo) {
    return res.status(409).json({ error: 'not_connected', message: 'Conta eWeLink não conectada.' });
  }

  try {
    // Dispositivos multi-canal (várias saídas/outlets) esperam params no formato
    // { switches: [{ switch, outlet }] }, não { switch: 'on'|'off' }. Detecta o
    // formato real do dispositivo antes de enviar o comando.
    let outgoingParams = params;
    if (typeof params.switch === 'string') {
      const thingResult = await ewelinkRequest(tokenInfo.region, '/v2/device/thing?num=0', {
        accessToken: tokenInfo.accessToken,
      });
      const thingList =
        (thingResult.data?.thingList as Array<{ itemData: Record<string, unknown> }>) ?? [];
      const thing = thingList.find((t) => (t.itemData as { deviceid?: string }).deviceid === deviceId);
      const currentParams = (thing?.itemData as { params?: Record<string, unknown> })?.params;
      const switches = currentParams?.switches as Array<{ switch: string; outlet: number }> | undefined;
      if (switches?.length) {
        outgoingParams = { switches: switches.map((s) => ({ switch: params.switch, outlet: s.outlet })) };
      }
    }

    const result = await ewelinkRequest(tokenInfo.region, '/v2/device/thing/status', {
      method: 'POST',
      accessToken: tokenInfo.accessToken,
      body: { type: 1, id: deviceId, params: outgoingParams },
    });

    if (result.error !== 0) {
      console.error('[ewelink/control] erro da API eWeLink', {
        deviceId,
        outgoingParams,
        region: tokenInfo.region,
        ewelinkError: result.error,
        ewelinkMsg: result.msg,
      });
      return res.status(502).json({ error: 'ewelink_error', message: result.msg });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao controlar dispositivo eWeLink';
    console.error('[ewelink/control] exceção', { deviceId, params, message });
    return res.status(502).json({ error: 'ewelink_error', message });
  }
}
