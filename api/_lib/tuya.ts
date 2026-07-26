/**
 * api/_lib/tuya.ts — helpers para a integração Tuya / Smart Life.
 * Suporta HMAC-SHA256 signing exigido por todas as rotas da Tuya OpenAPI.
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID ?? '';
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';

// Regiões suportadas — tentadas em ordem ao fazer exchange do code
const TUYA_REGIONS = [
  'https://openapi.tuyaeu.com',   // Europa (data center do projeto Argos)
  'https://openapi.tuyaus.com',   // Western America
  'https://openapi.tuyain.com',   // Índia
  'https://openapi.tuyacn.com',   // China
];

const TUYA_API_BASE = TUYA_REGIONS[0];

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

// ─── HMAC signing ────────────────────────────────────────────────────────────

function nonce(): string {
  return crypto.randomBytes(8).toString('hex');
}

function calcSign(
  accessToken: string,
  t: number,
  n: string,
  method: string,
  path: string,
  body: string
): string {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
  const str = `${TUYA_CLIENT_ID}${accessToken}${t}${n}${stringToSign}`;
  return crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(str).digest('hex').toUpperCase();
}

function buildHeaders(accessToken: string, t: number, n: string, sign: string): Record<string, string> {
  return {
    'client_id': TUYA_CLIENT_ID,
    'access_token': accessToken,
    't': String(t),
    'nonce': n,
    'sign': sign,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json',
  };
}

// ─── Requests ─────────────────────────────────────────────────────────────────

async function tuyaFetch(
  path: string,
  options: { method?: string; body?: unknown; accessToken: string; base?: string }
): Promise<unknown> {
  const base = options.base ?? TUYA_API_BASE;
  const method = (options.method ?? 'GET').toUpperCase();
  const bodyStr = options.body ? JSON.stringify(options.body) : '';
  const t = Date.now();
  const n = nonce();
  const sign = calcSign(options.accessToken, t, n, method, path, bodyStr);
  const headers = buildHeaders(options.accessToken, t, n, sign);

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body ? bodyStr : undefined,
  });

  const json = await res.json() as { success?: boolean; result?: unknown; msg?: string; code?: number };
  if (!json.success) {
    throw new Error(`Tuya API error (code ${json.code}): ${json.msg ?? 'unknown'}`);
  }
  return json.result;
}

// Token request sem access_token (usa apenas client_id + secret)
async function tuyaClientFetch(path: string, base = TUYA_API_BASE): Promise<unknown> {
  const method = 'GET';
  const bodyStr = '';
  const t = Date.now();
  const n = nonce();
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
  const str = `${TUYA_CLIENT_ID}${t}${n}${stringToSign}`;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(str).digest('hex').toUpperCase();

  const headers: Record<string, string> = {
    'client_id': TUYA_CLIENT_ID,
    't': String(t),
    'nonce': n,
    'sign': sign,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${base}${path}`, { method, headers });
  const json = await res.json() as { success?: boolean; result?: unknown; msg?: string; code?: number };
  if (!json.success) {
    throw new Error(`Tuya token error (code ${json.code}): ${json.msg ?? 'unknown'}`);
  }
  return json.result;
}

// ─── Email/password login ─────────────────────────────────────────────────────

// POST client-signed sem access_token
async function tuyaClientPost(path: string, body: unknown, base = TUYA_API_BASE): Promise<unknown> {
  const method = 'POST';
  const bodyStr = JSON.stringify(body);
  const t = Date.now();
  const n = nonce();
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
  const str = `${TUYA_CLIENT_ID}${t}${n}${stringToSign}`;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(str).digest('hex').toUpperCase();

  const headers: Record<string, string> = {
    'client_id': TUYA_CLIENT_ID,
    't': String(t),
    'nonce': n,
    'sign': sign,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${base}${path}`, { method, headers, body: bodyStr });
  const json = await res.json() as { success?: boolean; result?: unknown; msg?: string; code?: number };
  if (!json.success) throw new Error(`Tuya error (code ${json.code}): ${json.msg ?? 'unknown'}`);
  return json.result;
}

export async function tuyaLoginWithPassword(
  email: string,
  password: string,
  countryCode = '55'
): Promise<TuyaTokenWithRegion> {
  const hashedPwd = crypto.createHash('md5').update(password).digest('hex').toLowerCase();
  const path = '/v1.0/iot-01/associated-users/actions/authorized-login';
  const body = { username: email, password: hashedPwd, country_code: countryCode, username_type: 3 };
  const errors: string[] = [];

  for (const base of TUYA_REGIONS) {
    try {
      const result = await tuyaClientPost(path, body, base);
      return { ...(result as TuyaTokenResult), region: base };
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Falha ao autenticar no Smart Life: ${errors[0] ?? 'erro desconhecido'}`);
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

// Gera a URL de login OAuth do Smart Life.
// openapi.tuyaeu.com/login é a página H5 hospedada pela Tuya que autentica
// o utilizador no Smart Life e redireciona para redirect_uri com ?code=...
// Não requer HMAC — é um redirect de browser, não uma chamada API.
export function getTuyaOAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: TUYA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    from: 'smart_life',
  });
  return `${TUYA_API_BASE}/login?${params.toString()}`;
}

interface TuyaTokenResult {
  access_token: string;
  refresh_token: string;
  expire_time: number;
  uid: string;
}

export interface TuyaTokenWithRegion extends TuyaTokenResult {
  region: string;
}

// Tenta exchange do code em todas as regiões — o code só é válido na região
// onde o utilizador fez login (determinada por geo-redirect da Tuya).
export async function exchangeTuyaCode(code: string): Promise<TuyaTokenWithRegion> {
  const path = `/v1.0/oauth/token?code=${encodeURIComponent(code)}&grant_type=4`;
  const errors: string[] = [];

  for (const base of TUYA_REGIONS) {
    try {
      const result = await tuyaClientFetch(path, base);
      return { ...(result as TuyaTokenResult), region: base };
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error(`Falha ao conectar Smart Life em todas as regiões: ${errors.join(' | ')}`);
}

export async function refreshTuyaToken(refreshToken: string, base = TUYA_API_BASE): Promise<TuyaTokenResult> {
  const path = `/v1.0/oauth/token?grant_type=13&refresh_token=${encodeURIComponent(refreshToken)}`;
  const result = await tuyaClientFetch(path, base);
  return result as TuyaTokenResult;
}

// ─── Token management (Supabase) ─────────────────────────────────────────────

interface TuyaAccount {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  tuya_uid: string;
  region: string | null;
}

export interface TuyaCredentials {
  accessToken: string;
  uid: string;
  region: string;
}

const TUYA_LINKED_UID = process.env.TUYA_LINKED_UID ?? '';
let cachedProjectToken: { accessToken: string; expiresAt: number } | null = null;

// Fallback: token de projeto (grant_type=1, client credentials) — usado quando
// o usuário ainda não fez o login OAuth por conta própria (fluxo hoje quebrado,
// requer app OEM registrado na Tuya). Autentica só com Client ID/Secret e vale
// para dispositivos da conta Smart Life vinculada ao Cloud Project via QR code
// ("Account Authorization" em Devices > Link App Account no Tuya IoT Platform).
export async function getProjectCredentials(): Promise<TuyaCredentials> {
  if (!TUYA_LINKED_UID) {
    throw new Error('Conta Smart Life não conectada');
  }
  if (!cachedProjectToken || cachedProjectToken.expiresAt <= Date.now() + 60_000) {
    const result = (await tuyaClientFetch('/v1.0/token?grant_type=1')) as {
      access_token: string;
      expire_time: number;
    };
    cachedProjectToken = {
      accessToken: result.access_token,
      expiresAt: Date.now() + result.expire_time * 1000,
    };
  }
  return { accessToken: cachedProjectToken.accessToken, uid: TUYA_LINKED_UID, region: TUYA_API_BASE };
}

export async function getValidTuyaCredentials(userId: string, userToken: string): Promise<TuyaCredentials> {
  const client = supabaseAsUser(userToken);
  const { data, error } = await client
    .from('tuya_accounts')
    .select('access_token, refresh_token, expires_at, tuya_uid, region')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Conta Smart Life não conectada');

  const account = data as TuyaAccount;
  const base = account.region ?? TUYA_API_BASE;
  const expiresAt = new Date(account.expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now < 5 * 60 * 1000) {
    const tokens = await refreshTuyaToken(account.refresh_token, base);
    const newExpiry = new Date(now + tokens.expire_time * 1000).toISOString();

    await client.from('tuya_accounts').upsert(
      {
        user_id: userId,
        tuya_uid: tokens.uid || account.tuya_uid,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiry,
        region: base,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return { accessToken: tokens.access_token, uid: tokens.uid || account.tuya_uid, region: base };
  }

  return { accessToken: account.access_token, uid: account.tuya_uid, region: base };
}

// ─── Device types ─────────────────────────────────────────────────────────────

export interface TuyaDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  isOn: boolean;
  brightness: number | null;        // 0–100
  color: string | null;             // hex
  colorTemp: number | null;         // 0=warm, 100=cool (normalizado)
  supportsColor: boolean;
  supportsColorTemp: boolean;
  supportsBrightness: boolean;
}

// Categorias Tuya consideradas "lâmpadas"
const LIGHT_CATEGORIES = new Set(['dj', 'dc', 'xdd', 'fsd', 'tgq', 'tgkg', 'dd', 'tdq', 'fs', 'xktyd']);

function parseColorData(value: unknown): string | null {
  if (!value) return null;
  try {
    let h: number, s: number, v: number;
    if (typeof value === 'string') {
      // JSON string
      const parsed = JSON.parse(value) as { h?: number; s?: number; v?: number };
      h = parsed.h ?? 0; s = parsed.s ?? 0; v = parsed.v ?? 0;
    } else {
      const obj = value as { h?: number; s?: number; v?: number };
      h = obj.h ?? 0; s = obj.s ?? 0; v = obj.v ?? 0;
    }
    return hsvToHex(h, s / 1000, v / 1000);
  } catch {
    return null;
  }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToTuyaHsv(hex: string): { h: number; s: number; v: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s: Math.round((max === 0 ? 0 : diff / max) * 1000), v: Math.round(max * 1000) };
}

export function tempNameToTuya(value: string | number): number | null {
  if (typeof value === 'number') {
    if (value >= 0 && value <= 100) return Math.round(value * 10);
    if (value >= 0 && value <= 1000) return value;
    return null;
  }
  const v = String(value).toLowerCase();
  if (v === 'warm' || v === 'quente') return 0;
  if (v === 'neutral' || v === 'neutro') return 500;
  if (v === 'cool' || v === 'frio') return 1000;
  return null;
}

interface TuyaStatusItem { code: string; value: unknown }

export function mapTuyaDevices(rawList: unknown[]): TuyaDevice[] {
  return rawList
    .filter((d: unknown) => {
      const dev = d as { category?: string };
      return LIGHT_CATEGORIES.has(dev.category ?? '');
    })
    .map((d: unknown) => {
      const dev = d as {
        id: string;
        name: string;
        category: string;
        online: boolean;
        status?: TuyaStatusItem[];
      };

      const status = dev.status ?? [];
      const get = (code: string) => status.find((s) => s.code === code)?.value;

      const isOn = Boolean(get('switch_led') ?? get('switch') ?? false);
      const workMode = get('work_mode');
      const colorRaw = get('colour_data_v2') ?? get('colour_data');
      const color = parseColorData(colorRaw);

      // Em modo cor, o brilho real está no V do HSV — bright_value_v2 continua
      // a reportar o brilho do modo branco (geralmente 1000 = 100%) e não serve.
      let brightness: number | null = null;
      if (workMode === 'colour' && colorRaw) {
        try {
          const hsv = (typeof colorRaw === 'string' ? JSON.parse(colorRaw) : colorRaw) as { v?: number };
          if (hsv.v != null) brightness = Math.round(((Number(hsv.v) - 10) / 990) * 100);
        } catch { /* usa fallback abaixo */ }
      }
      if (brightness === null) {
        const brightRaw = get('bright_value_v2') ?? get('bright_value');
        brightness = brightRaw != null ? Math.round(((Number(brightRaw) - 10) / 990) * 100) : null;
      }

      const tempRaw = get('temp_value_v2') ?? get('temp_value');
      const colorTemp = tempRaw != null ? Math.round((Number(tempRaw) / 1000) * 100) : null;

      const supportsColor = status.some((s) => s.code === 'colour_data_v2' || s.code === 'colour_data');
      const supportsColorTemp = status.some((s) => s.code === 'temp_value_v2' || s.code === 'temp_value');
      const supportsBrightness = status.some((s) => s.code === 'bright_value_v2' || s.code === 'bright_value');

      return {
        id: dev.id,
        name: dev.name || 'Lâmpada Smart',
        category: dev.category,
        online: dev.online,
        isOn,
        brightness,
        color,
        colorTemp,
        supportsColor,
        supportsColorTemp,
        supportsBrightness,
      };
    });
}

// ─── Public API wrappers ───────────────────────────────────────────────────────

export async function tuyaListDevices(uid: string, accessToken: string, base = TUYA_API_BASE): Promise<TuyaDevice[]> {
  const result = await tuyaFetch(`/v1.0/users/${encodeURIComponent(uid)}/devices`, { accessToken, base });
  const list = Array.isArray(result) ? result : [];
  return mapTuyaDevices(list as unknown[]);
}

export async function tuyaControl(
  deviceId: string,
  commands: Array<{ code: string; value: unknown }>,
  accessToken: string,
  base = TUYA_API_BASE
): Promise<void> {
  await tuyaFetch(`/v1.0/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: 'POST',
    body: { commands },
    accessToken,
    base,
  });
}
