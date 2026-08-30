/**
 * api/tuya.ts — router unificado para todas as operações Tuya/Smart Life.
 * ?action=authorize  GET  → URL OAuth
 * ?action=exchange   POST → trocar code por tokens
 * ?action=devices    GET  → listar dispositivos
 * ?action=control    POST → controlar dispositivo
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUserFromAuthHeader,
  getTuyaOAuthUrl,
  exchangeTuyaCode,
  tuyaLoginWithPassword,
  supabaseAsUser,
  getValidTuyaCredentials,
  getProjectCredentials,
  tuyaListDevices,
  tuyaControl,
  hexToTuyaHsv,
  tempNameToTuya,
  type TuyaCredentials,
} from './_lib/tuya';

/*
 * Nem toda lâmpada Tuya usa o código `switch_led` para ligar/desligar — alguns
 * modelos usam `switch`. `mapTuyaDevices` (_lib/tuya.ts) já lê os dois ao
 * interpretar o estado (`get('switch_led') ?? get('switch')`), mas o envio de
 * comando só mandava `switch_led`, sempre. Num dispositivo que só tem `switch`,
 * o comando é rejeitado pela nuvem Tuya e a lâmpada nunca recebe nada — sem
 * erro visível no app, porque a falha é engolida no client (fire-and-forget).
 * Aqui: tenta `switch_led` e, se a nuvem recusar, tenta de novo com `switch`.
 */
async function tuyaControlWithFallback(
  deviceId: string,
  commands: Array<{ code: string; value: unknown }>,
  accessToken: string,
  region: string
): Promise<void> {
  try {
    await tuyaControl(deviceId, commands, accessToken, region);
  } catch (err) {
    if (!commands.some((c) => c.code === 'switch_led')) throw err;
    const retryCommands = commands.map((c) =>
      c.code === 'switch_led' ? { ...c, code: 'switch' } : c
    );
    await tuyaControl(deviceId, retryCommands, accessToken, region);
  }
}

function cors(res: VercelResponse, methods: string) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Tenta a conta Smart Life do próprio usuário (login OAuth); se ele nunca
// conectou a conta (fluxo de login ainda depende de um app OEM registrado na
// Tuya), cai para a conta vinculada ao Cloud Project via QR code.
async function resolveTuyaCredentials(userId: string, userToken: string): Promise<TuyaCredentials> {
  try {
    return await getValidTuyaCredentials(userId, userToken);
  } catch {
    return getProjectCredentials();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;

  if (req.method === 'OPTIONS') {
    cors(res, 'GET, POST');
    return res.status(200).end();
  }

  cors(res, 'GET, POST');

  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  // ── login (email+senha direto) ────────────────────────────────────────────
  if (action === 'login' && req.method === 'POST') {
    const { email, password, countryCode } = req.body as { email?: string; password?: string; countryCode?: string };
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    try {
      const tokens = await tuyaLoginWithPassword(email, password, countryCode ?? '55');
      const expiresAt = new Date(Date.now() + tokens.expire_time * 1000).toISOString();
      const client = supabaseAsUser(user.token);
      await client.from('tuya_accounts').upsert(
        {
          user_id: user.userId,
          tuya_uid: tokens.uid,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          region: tokens.region,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[tuya] login error:', err);
      return res.status(401).json({ error: err instanceof Error ? err.message : 'Falha ao autenticar no Smart Life.' });
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (action === 'disconnect' && req.method === 'POST') {
    const client = supabaseAsUser(user.token);
    await client.from('tuya_accounts').delete().eq('user_id', user.userId);
    return res.status(200).json({ ok: true });
  }

  // ── authorize ──────────────────────────────────────────────────────────────
  if (action === 'authorize' && req.method === 'GET') {
    const redirectUri = `https://${req.headers.host}/integrations/tuya/callback`;
    const url = getTuyaOAuthUrl(redirectUri);
    return res.status(200).json({ url });
  }

  // ── exchange ───────────────────────────────────────────────────────────────
  if (action === 'exchange' && req.method === 'POST') {
    const { code } = req.body as { code?: string };
    if (!code) return res.status(400).json({ error: 'invalid_request', message: 'code é obrigatório' });

    try {
      const tokens = await exchangeTuyaCode(code);
      const expiresAt = new Date(Date.now() + tokens.expire_time * 1000).toISOString();

      const client = supabaseAsUser(user.token);
      const { error } = await client.from('tuya_accounts').upsert(
        {
          user_id: user.userId,
          tuya_uid: tokens.uid,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          region: tokens.region,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) return res.status(500).json({ error: 'db_error', message: error.message });
      return res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao conectar Smart Life';
      return res.status(502).json({ error: 'tuya_error', message });
    }
  }

  // ── devices ────────────────────────────────────────────────────────────────
  if (action === 'devices' && req.method === 'GET') {
    try {
      const { accessToken, uid, region } = await resolveTuyaCredentials(user.userId, user.token);
      const devices = await tuyaListDevices(uid, accessToken, region);
      return res.status(200).json({ connected: true, devices });
    } catch (err) {
      // Sem este log o 502 chega mudo: a mensagem só ia no corpo da resposta,
      // que exige request autenticado para ser lida. Com ele a causa real da
      // Tuya (token de projeto, conta desvinculada, subscrição) fica nos logs.
      console.error('[tuya] devices error:', err);
      const message = err instanceof Error ? err.message : 'Erro ao buscar dispositivos';
      return res.status(502).json({ error: 'tuya_error', message });
    }
  }

  // ── control ────────────────────────────────────────────────────────────────
  if (action === 'control' && req.method === 'POST') {
    const { deviceId, property, value, currentColor } = req.body as {
      deviceId?: string;
      property?: string;
      value?: unknown;
      currentColor?: string;
    };

    if (!deviceId || !property || value === undefined) {
      return res.status(400).json({ error: 'invalid_request', message: 'deviceId, property e value são obrigatórios' });
    }

    try {
      const { accessToken, region } = await resolveTuyaCredentials(user.userId, user.token);
      const commands: Array<{ code: string; value: unknown }> = [];

      if (property === 'isOn') {
        commands.push({ code: 'switch_led', value: Boolean(value) });
      } else if (property === 'brightness') {
        const pct = Math.max(1, Math.min(100, Number(value)));
        commands.push({ code: 'switch_led', value: true });
        const colorHsv = currentColor ? hexToTuyaHsv(currentColor) : null;
        if (colorHsv) {
          // em modo cor: mantém H e S, ajusta só o V (brilho)
          commands.push({ code: 'work_mode', value: 'colour' });
          commands.push({ code: 'colour_data_v2', value: { h: colorHsv.h, s: colorHsv.s, v: Math.round(10 + (pct / 100) * 990) } });
        } else {
          commands.push({ code: 'bright_value_v2', value: Math.round(10 + (pct / 100) * 990) });
          commands.push({ code: 'work_mode', value: 'white' });
        }
      } else if (property === 'color') {
        const hsv = hexToTuyaHsv(String(value));
        if (!hsv) return res.status(400).json({ error: 'invalid_color', message: `Cor inválida: ${value}` });
        commands.push({ code: 'switch_led', value: true });
        commands.push({ code: 'work_mode', value: 'colour' });
        commands.push({ code: 'colour_data_v2', value: hsv });
      } else if (property === 'colorTemperature') {
        const tuyaTemp = tempNameToTuya(value as string | number);
        if (tuyaTemp === null) return res.status(400).json({ error: 'invalid_temp', message: `Temperatura inválida: ${value}` });
        commands.push({ code: 'switch_led', value: true });
        commands.push({ code: 'work_mode', value: 'white' });
        commands.push({ code: 'temp_value_v2', value: tuyaTemp });
      } else {
        return res.status(400).json({ error: 'unknown_property', message: `Propriedade desconhecida: ${property}` });
      }

      await tuyaControlWithFallback(deviceId, commands, accessToken, region);
      return res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao controlar dispositivo';
      return res.status(502).json({ error: 'tuya_error', message });
    }
  }

  return res.status(400).json({ error: 'invalid_action', message: `Ação inválida: ${action}` });
}
