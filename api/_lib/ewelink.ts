/**
 * api/_lib/ewelink.ts — helpers compartilhados pelas rotas de eWeLink.
 * Mantém EWELINK_APP_SECRET apenas no servidor.
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const APP_ID = process.env.EWELINK_APP_ID ?? '';
const APP_SECRET = process.env.EWELINK_APP_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function getUserFromAuthHeader(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { token, userId: data.user.id };
}

function hmacBase64(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(Buffer.from(message, 'utf-8')).digest('base64');
}

function randomNonce(len = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Monta a URL de autorização OAuth (assinada com o App Secret). */
export function buildAuthorizeUrl(redirectUrl: string, state: string): string {
  const seq = Date.now().toString();
  const nonce = randomNonce();
  const authorization = hmacBase64(APP_SECRET, `${APP_ID}_${seq}`);

  const params = new URLSearchParams({
    clientId: APP_ID,
    seq,
    authorization,
    redirectUrl,
    state,
    nonce,
    grantType: 'authorization_code',
    showQRCode: 'false',
  });

  return `https://c2ccdn.coolkit.cc/oauth/index.html?${params.toString()}`;
}

const REGION_HOSTS: Record<string, string> = {
  cn: 'cn-apia.coolkit.cn',
  as: 'as-apia.coolkit.cc',
  us: 'us-apia.coolkit.cc',
  eu: 'eu-apia.coolkit.cc',
};

export function apiHost(region: string): string {
  return REGION_HOSTS[region] ?? REGION_HOSTS.eu;
}

/** Chama uma interface v2 já autenticada (com accessToken do usuário). */
export async function ewelinkRequest(
  region: string,
  path: string,
  options: { method?: string; body?: unknown; accessToken: string }
): Promise<{ error: number; msg: string; data: Record<string, unknown> }> {
  const host = apiHost(region);
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'X-CK-Appid': APP_ID,
    Authorization: `Bearer ${options.accessToken}`,
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`https://${host}${path}`, { method, headers, body });
  return res.json() as Promise<{ error: number; msg: string; data: Record<string, unknown> }>;
}

/** Troca o "code" do OAuth pelos tokens de acesso. */
export async function exchangeCodeForTokens(
  region: string,
  code: string,
  redirectUrl: string
): Promise<{
  accessToken: string;
  atExpiredTime: number;
  refreshToken: string;
  rtExpiredTime: number;
}> {
  const host = apiHost(region);
  const body = { code, redirectUrl, grantType: 'authorization_code' };
  const bodyStr = JSON.stringify(body);
  const authorization = hmacBase64(APP_SECRET, bodyStr);

  const res = await fetch(`https://${host}/v2/user/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CK-Appid': APP_ID,
      Authorization: `Sign ${authorization}`,
    },
    body: bodyStr,
  });

  const json = (await res.json()) as {
    error: number;
    msg: string;
    data: {
      accessToken: string;
      atExpiredTime: number;
      refreshToken: string;
      rtExpiredTime: number;
    };
  };

  if (json.error !== 0) {
    throw new Error(json.msg || 'Falha ao trocar code por token eWeLink');
  }

  return json.data;
}

const ALL_REGIONS = ['eu', 'us', 'as', 'cn'];

/** Login direto com e-mail/senha (sem passar pela página OAuth). */
export async function loginWithPassword(
  email: string,
  password: string,
  countryCode: string,
  preferredRegion?: string
): Promise<{ accessToken: string; refreshToken: string; region: string }> {
  const regionsToTry = preferredRegion
    ? [preferredRegion, ...ALL_REGIONS.filter((r) => r !== preferredRegion)]
    : ALL_REGIONS;

  let lastError = 'Falha ao fazer login no eWeLink';

  for (const region of regionsToTry) {
    const host = apiHost(region);
    const body = { email, password, countryCode };
    const bodyStr = JSON.stringify(body);
    const authorization = hmacBase64(APP_SECRET, bodyStr);

    const res = await fetch(`https://${host}/v2/user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CK-Appid': APP_ID,
        Authorization: `Sign ${authorization}`,
      },
      body: bodyStr,
    });

    const json = (await res.json()) as {
      error: number;
      msg: string;
      data: { at?: string; rt?: string; region?: string };
    };

    if (json.error === 0 && json.data.at && json.data.rt) {
      return {
        accessToken: json.data.at,
        refreshToken: json.data.rt,
        region: json.data.region ?? region,
      };
    }

    // 10004 = conta não está nesta região, tenta a próxima
    if (json.error !== 10004) {
      throw new Error(json.msg || 'Falha ao fazer login no eWeLink');
    }
    lastError = json.msg || lastError;
  }

  throw new Error(lastError);
}

/** Atualiza o access token usando o refresh token. */
export async function refreshTokens(
  region: string,
  refreshToken: string
): Promise<{ at: string; rt: string }> {
  const host = apiHost(region);
  const body = { rt: refreshToken };
  const bodyStr = JSON.stringify(body);
  const authorization = hmacBase64(APP_SECRET, bodyStr);

  const res = await fetch(`https://${host}/v2/user/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CK-Appid': APP_ID,
      Authorization: `Sign ${authorization}`,
    },
    body: bodyStr,
  });

  const json = (await res.json()) as { error: number; msg: string; data: { at: string; rt: string } };
  if (json.error !== 0) {
    throw new Error(json.msg || 'Falha ao renovar token eWeLink');
  }
  return json.data;
}

export interface EwelinkAccountRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  at_expires_at: string;
  rt_expires_at: string;
  region: string;
}

/** Busca a conta eWeLink do usuário, renovando o access token se necessário. */
export async function getValidAccessToken(
  client: ReturnType<typeof supabaseAsUser>,
  userId: string
): Promise<{ accessToken: string; region: string } | null> {
  const { data, error } = await client
    .from('ewelink_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as EwelinkAccountRow;

  const atExpired = new Date(row.at_expires_at).getTime() <= Date.now() + 60_000;
  if (!atExpired) {
    return { accessToken: row.access_token, region: row.region };
  }

  const refreshed = await refreshTokens(row.region, row.refresh_token);
  const atExpiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
  const rtExpiresAt = new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString();

  await client
    .from('ewelink_accounts')
    .update({
      access_token: refreshed.at,
      refresh_token: refreshed.rt,
      at_expires_at: atExpiresAt,
      rt_expires_at: rtExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return { accessToken: refreshed.at, region: row.region };
}
