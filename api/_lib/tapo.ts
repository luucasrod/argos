import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TAPO_CLOUD = 'https://wap.tplinkcloud.com';
const APP_TYPE = 'Tapo_Android';
const TERMINAL_UUID = 'b4c3d2a1-e5f6-7890-abcd-ef1234567890';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';

export function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function getUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const sb = supabaseAsUser(token);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  return { user, token };
}

function hashPassword(password: string): string {
  return crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
}

interface TapoCloudResponse<T = unknown> {
  error_code: number;
  msg?: string;
  result?: T;
}

async function tapoPost<T = unknown>(
  body: unknown,
  serverUrl = TAPO_CLOUD,
  token?: string
): Promise<T> {
  const url = token ? `${serverUrl}?token=${encodeURIComponent(token)}` : serverUrl;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tapo HTTP error: ${res.status}`);
  const json = (await res.json()) as TapoCloudResponse<T>;
  if (json.error_code !== 0) {
    const msg = json.msg ?? `error_code ${json.error_code}`;
    if (json.error_code === -1010 || json.error_code === -1008) {
      throw new Error('Credenciais inválidas. Verifica o e-mail e senha da conta Tapo.');
    }
    throw new Error(`Tapo: ${msg}`);
  }
  return json.result as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

interface LoginResult {
  cloudUserName: string;
  token: string;
}

export async function tapoLogin(email: string, password: string): Promise<{ token: string }> {
  const result = await tapoPost<LoginResult>({
    method: 'login',
    params: {
      appType: APP_TYPE,
      cloudUserName: email,
      cloudPassword: hashPassword(password),
      terminalUUID: TERMINAL_UUID,
    },
  });
  if (!result?.token) throw new Error('Tapo não retornou token. Verifica as credenciais.');
  return { token: result.token };
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface TapoDevice {
  deviceId: string;
  alias: string;
  deviceModel: string;
  deviceType: string;
  appServerUrl: string;
  status: number;
  isOn: boolean;
  brightness: number | null;
  colorTemp: number | null;
  color: string | null;
  supportsColor: boolean;
  supportsColorTemp: boolean;
  supportsBrightness: boolean;
}

interface TapoCloudDevice {
  deviceId: string;
  alias: string;
  deviceModel: string;
  deviceType: string;
  appServerUrl: string;
  status: number;
}

interface DeviceInfoResult {
  device_on?: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  color_temp?: number;
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

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : diff / max, v: max };
}

async function getDeviceInfo(
  deviceId: string,
  appServerUrl: string,
  token: string
): Promise<DeviceInfoResult> {
  try {
    const result = await tapoPost<{ responseData: string }>(
      { method: 'passthrough', params: { deviceId, requestData: JSON.stringify({ method: 'get_device_info', params: {} }) } },
      appServerUrl,
      token
    );
    const parsed = JSON.parse(result.responseData) as { result?: DeviceInfoResult };
    return parsed.result ?? {};
  } catch {
    return {};
  }
}

// Light device types — plugs/switches ignored in device card
const LIGHT_TYPES = new Set(['SMART.TAPOBULB', 'SMART.TAPOSTRIP', 'SMART.KASALIGHT', 'SMART.KASACOLORLIGHT']);

export async function tapoGetDevices(token: string): Promise<TapoDevice[]> {
  const result = await tapoPost<{ deviceList: TapoCloudDevice[] }>(
    { method: 'getDeviceList', params: { token } }
  );

  const devices = (result.deviceList ?? []);

  return Promise.all(
    devices.map(async (d) => {
      const isLight = LIGHT_TYPES.has(d.deviceType) ||
        d.deviceType.toLowerCase().includes('bulb') ||
        d.deviceType.toLowerCase().includes('light') ||
        d.deviceType.toLowerCase().includes('strip');

      let isOn = false, brightness: number | null = null, colorTemp: number | null = null, color: string | null = null;
      let supportsColor = false, supportsColorTemp = false, supportsBrightness = false;

      if (d.status === 1) {
        const info = await getDeviceInfo(d.deviceId, d.appServerUrl, token);
        isOn = info.device_on ?? false;
        if (info.brightness != null) { brightness = info.brightness; supportsBrightness = true; }
        if (info.color_temp != null) { colorTemp = info.color_temp; supportsColorTemp = true; }
        if (info.hue != null && info.saturation != null) {
          supportsColor = true;
          color = hsvToHex(info.hue, info.saturation / 100, (info.brightness ?? 100) / 100);
        }
      }

      // infer capabilities from model name
      const model = (d.deviceModel ?? '').toUpperCase();
      if (!supportsColor && (model.includes('L530') || model.includes('L630') || model.includes('L900') || model.includes('L920') || model.includes('L930'))) {
        supportsColor = true;
      }
      if (!supportsBrightness && isLight) supportsBrightness = true;
      if (!supportsColorTemp && isLight) supportsColorTemp = true;

      return {
        deviceId: d.deviceId,
        alias: d.alias || d.deviceModel || 'Dispositivo Tapo',
        deviceModel: d.deviceModel,
        deviceType: d.deviceType,
        appServerUrl: d.appServerUrl,
        status: d.status,
        isOn,
        brightness,
        colorTemp,
        color,
        supportsColor,
        supportsColorTemp,
        supportsBrightness,
      };
    })
  );
}

// ─── Control ──────────────────────────────────────────────────────────────────

export async function tapoControl(
  deviceId: string,
  appServerUrl: string,
  token: string,
  property: string,
  value: unknown
): Promise<void> {
  let params: Record<string, unknown>;

  if (property === 'isOn') {
    params = { device_on: Boolean(value) };
  } else if (property === 'brightness' && typeof value === 'number') {
    params = { device_on: true, brightness: Math.max(1, Math.min(100, value)) };
  } else if (property === 'color' && typeof value === 'string') {
    const rgb = hexToRgb(value);
    if (!rgb) throw new Error(`Cor inválida: ${value}`);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    params = { device_on: true, hue: Math.round(hsv.h), saturation: Math.round(hsv.s * 100), brightness: Math.round(hsv.v * 100) };
  } else if (property === 'colorTemperature' && typeof value === 'string') {
    const temp = value === 'warm' ? 2700 : value === 'neutral' ? 4000 : 6500;
    params = { device_on: true, color_temp: temp };
  } else {
    throw new Error(`Propriedade não suportada: ${property}`);
  }

  await tapoPost(
    { method: 'passthrough', params: { deviceId, requestData: JSON.stringify({ method: 'set_device_info', params }) } },
    appServerUrl,
    token
  );
}

// ─── Token management ─────────────────────────────────────────────────────────

export async function saveTapoAccount(userId: string, token: string, authToken: string): Promise<void> {
  await supabaseAsUser(authToken).from('tapo_accounts').upsert(
    { user_id: userId, access_token: token, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function getTapoToken(userId: string, authToken: string): Promise<string> {
  const { data, error } = await supabaseAsUser(authToken)
    .from('tapo_accounts')
    .select('access_token')
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('Conta Tapo não conectada');
  return (data as { access_token: string }).access_token;
}
