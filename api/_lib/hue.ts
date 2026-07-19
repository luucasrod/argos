/**
 * api/_lib/hue.ts — helpers compartilhados pelas rotas de Philips Hue.
 * Credenciais OAuth nunca saem do servidor.
 */
import { createClient } from '@supabase/supabase-js';

const HUE_CLIENT_ID = process.env.HUE_CLIENT_ID ?? '';
const HUE_CLIENT_SECRET = process.env.HUE_CLIENT_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

const HUE_AUTH_BASE = 'https://api.meethue.com/v2/oauth2';
const HUE_API_BASE = 'https://api.meethue.com/route/clip/v2';

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

function basicAuth(): string {
  return Buffer.from(`${HUE_CLIENT_ID}:${HUE_CLIENT_SECRET}`).toString('base64');
}

/** Monta a URL de autorização OAuth do Hue. */
export function buildHueAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: HUE_CLIENT_ID,
    response_type: 'code',
    scope: 'remote_setup identify',
    redirect_uri: redirectUri,
  });
  return `${HUE_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeHueCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${HUE_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth()}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hue token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function refreshHueToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(`${HUE_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth()}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hue token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

interface HueAccount {
  access_token: string;
  refresh_token: string;
  at_expires_at: string;
  hue_app_key: string | null;
}

export interface HueCredentials {
  accessToken: string;
  appKey: string | null;
}

/** Obtém credenciais válidas (access token + app key), renovando se necessário. */
export async function getValidHueToken(userId: string, userToken: string): Promise<HueCredentials> {
  const client = supabaseAsUser(userToken);
  const { data, error } = await client
    .from('hue_accounts')
    .select('access_token, refresh_token, at_expires_at, hue_app_key')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Conta Philips Hue não conectada');

  const account = data as HueAccount;
  const expiresAt = new Date(account.at_expires_at).getTime();
  const now = Date.now();

  // Renova se expirar em menos de 5 minutos
  if (expiresAt - now < 5 * 60 * 1000) {
    const tokens = await refreshHueToken(account.refresh_token);
    const newExpiry = new Date(now + tokens.expires_in * 1000).toISOString();

    await client.from('hue_accounts').upsert(
      {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        at_expires_at: newExpiry,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return { accessToken: tokens.access_token, appKey: account.hue_app_key };
  }

  return { accessToken: account.access_token, appKey: account.hue_app_key };
}

/** Converte hex (#RRGGBB) para CIE XY (formato da API Hue). */
export function hexToXy(hex: string): { x: number; y: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;

  let r = parseInt(clean.slice(0, 2), 16) / 255;
  let g = parseInt(clean.slice(2, 4), 16) / 255;
  let b = parseInt(clean.slice(4, 6), 16) / 255;

  // Gamma correction (sRGB → linear)
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Wide RGB D65 (Philips Hue spec)
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

  const sum = X + Y + Z;
  if (sum === 0) return { x: 0, y: 0 };

  return {
    x: Math.round((X / sum) * 10000) / 10000,
    y: Math.round((Y / sum) * 10000) / 10000,
  };
}

/** Converte nome de temperatura para mirek (Hue usa 153–500). */
export function tempNameToMirek(value: string | number): number | null {
  if (typeof value === 'number') {
    // Kelvin → mirek
    if (value >= 1000 && value <= 10000) return Math.round(1_000_000 / value);
    // Já é mirek
    if (value >= 153 && value <= 500) return value;
    return null;
  }
  const v = String(value).toLowerCase();
  if (v === 'warm' || v === 'quente') return 454;    // ~2200K
  if (v === 'neutral' || v === 'neutro') return 283; // ~3530K
  if (v === 'cool' || v === 'frio') return 153;      // ~6500K
  return null;
}

export interface HueLight {
  id: string;
  name: string;
  isOn: boolean;
  brightness: number;
  color: string | null;   // hex
  colorTemp: number | null; // mirek
  supportsColor: boolean;
  supportsColorTemp: boolean;
}

/** Chama a API Hue remota com o access token. */
export async function hueRequest(
  path: string,
  options: { method?: string; body?: unknown; accessToken: string; appKey?: string }
): Promise<unknown> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    'Content-Type': 'application/json',
  };
  if (options.appKey) {
    headers['hue-application-key'] = options.appKey;
  }

  const res = await fetch(`${HUE_API_BASE}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hue API error (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Ativa o link button via Remote API e registra a aplicação na bridge,
 * retornando o hue-application-key (username).
 */
export async function createHueAppKey(accessToken: string): Promise<string> {
  const HUE_BRIDGE_BASE = 'https://api.meethue.com/route';

  // Passo 1: Ativa o link button remotamente
  const linkRes = await fetch(`${HUE_BRIDGE_BASE}/api/0/config`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ linkbutton: true }),
  });
  if (!linkRes.ok) {
    const text = await linkRes.text().catch(() => '');
    throw new Error(`Hue linkbutton failed (${linkRes.status}): ${text}`);
  }

  // Passo 2: Registra a aplicação
  const regRes = await fetch(`${HUE_BRIDGE_BASE}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ devicetype: 'argos#app', generateclientkey: true }),
  });
  if (!regRes.ok) {
    const text = await regRes.text().catch(() => '');
    throw new Error(`Hue app registration failed (${regRes.status}): ${text}`);
  }

  const data = await regRes.json() as unknown[];
  const first = data[0] as { success?: { username?: string } };
  const username = first?.success?.username;
  if (!username) {
    throw new Error(`Hue app registration returned no username: ${JSON.stringify(data)}`);
  }
  return username;
}

/** Mapeia a resposta bruta da API para o tipo HueLight. */
export function mapHueLights(raw: unknown): HueLight[] {
  const data = (raw as { data?: unknown[] }).data;
  if (!Array.isArray(data)) return [];

  return data
    .filter((item: unknown) => (item as { type?: string }).type === 'light')
    .map((item: unknown) => {
      const l = item as {
        id: string;
        metadata?: { name?: string };
        on?: { on?: boolean };
        dimming?: { brightness?: number };
        color?: { xy?: { x: number; y: number } };
        color_temperature?: { mirek?: number; mirek_valid?: boolean };
      };

      const supportsColor = !!l.color;
      const supportsColorTemp = !!l.color_temperature;

      // XY → hex aproximado (para exibição)
      let colorHex: string | null = null;
      if (supportsColor && l.color?.xy) {
        colorHex = xyToHex(l.color.xy.x, l.color.xy.y);
      }

      return {
        id: l.id,
        name: l.metadata?.name ?? 'Lâmpada Hue',
        isOn: l.on?.on ?? false,
        brightness: Math.round(l.dimming?.brightness ?? 100),
        color: colorHex,
        colorTemp: l.color_temperature?.mirek_valid ? (l.color_temperature.mirek ?? null) : null,
        supportsColor,
        supportsColorTemp,
      };
    });
}

/** Conversão inversa XY → hex aproximado (para exibição no app). */
function xyToHex(x: number, y: number): string {
  const z = 1 - x - y;
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * z;

  // Wide RGB D65 inversa
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

  const max = Math.max(r, g, b, 1);
  r = Math.max(0, r / max);
  g = Math.max(0, g / max);
  b = Math.max(0, b / max);

  // Gamma correction (linear → sRGB)
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1 / 2.4) - 0.055;

  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v * 255)))
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
