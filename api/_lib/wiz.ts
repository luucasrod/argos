import { createClient } from '@supabase/supabase-js';

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

// ─── WiZ Cloud API ────────────────────────────────────────────────────────────
const WIZ_API = 'https://homeapi.wizconnected.com/api';

interface WizAuthResponse {
  data?: {
    token?: string;
    userId?: number;
    homeId?: number | string;
  };
  // algumas versões respondem flat
  token?: string;
  homeId?: number | string;
}

async function extractWizToken(raw: WizAuthResponse, token: string): Promise<{ token: string; homeId: string }> {
  const homeIdRaw = raw.data?.homeId ?? raw.homeId;
  let homeId = homeIdRaw ? String(homeIdRaw) : '';

  if (!homeId) {
    const homesRes = await fetch(`${WIZ_API}/homes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (homesRes.ok) {
      const homes = (await homesRes.json()) as { data?: Array<{ id: number | string }> } | Array<{ id: number | string }>;
      const list = Array.isArray(homes) ? homes : homes.data ?? [];
      if (list.length > 0) homeId = String(list[0].id);
    }
  }
  return { token, homeId };
}

// Login com Google token via Firebase Auth (projecto WiZ: wiz-system-166010)
export async function wizLoginWithGoogleToken(googleToken: string): Promise<{ token: string; homeId: string }> {
  const WIZ_FIREBASE_KEY = 'AIzaSyDrQpNvVkllq9W78GCR_EpX1Z7BDb4EbEM';
  const WIZ_FIREBASE_PROJECT = 'wiz-system-166010';
  const WIZ_NEW_API = 'https://api.wiz.world';

  // Passo 1: trocar Google access token por Firebase ID token do projecto WiZ
  const fbRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${WIZ_FIREBASE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `access_token=${googleToken}&providerId=google.com`,
        requestUri: `https://${WIZ_FIREBASE_PROJECT}.firebaseapp.com/__/auth/handler`,
        returnSecureToken: true,
      }),
    }
  );
  const fbData = (await fbRes.json().catch(() => null)) as { idToken?: string; error?: { message?: string } } | null;
  console.log('[wiz firebase signInWithIdp]', fbRes.status, JSON.stringify(fbData));

  if (!fbRes.ok || !fbData?.idToken) {
    const errMsg = fbData?.error?.message ?? `Firebase status ${fbRes.status}`;
    throw new Error(`WiZ Firebase login falhou: ${errMsg}`);
  }

  const firebaseIdToken = fbData.idToken;

  // Passo 2: tentar usar o Firebase ID token com a API WiZ
  const wizAttempts: Array<{ url: string; method: 'GET' | 'POST'; body?: Record<string, string> }> = [
    { url: `${WIZ_NEW_API}/v1/user/me`, method: 'GET' },
    { url: `${WIZ_NEW_API}/v1/homes`, method: 'GET' },
    { url: `${WIZ_NEW_API}/v1/auth/firebase`, method: 'POST', body: { idToken: firebaseIdToken } },
    { url: `${WIZ_NEW_API}/v1/user/firebase-login`, method: 'POST', body: { idToken: firebaseIdToken } },
    { url: `${WIZ_NEW_API}/oauth/v2/firebase/login`, method: 'POST', body: { idToken: firebaseIdToken } },
  ];

  const errors: string[] = [];
  for (const attempt of wizAttempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${firebaseIdToken}`,
        },
        body: attempt.method === 'POST' && attempt.body ? JSON.stringify(attempt.body) : undefined,
      });
      const raw = (await res.json().catch(() => null)) as (WizAuthResponse & { message?: string; error?: string }) | null;
      console.log(`[wiz api] ${attempt.method} ${attempt.url} => ${res.status}`, JSON.stringify(raw));

      if (!res.ok) {
        errors.push(`${attempt.url}: ${res.status} ${raw?.message ?? raw?.error ?? ''}`);
        continue;
      }
      if (!raw) continue;
      const wizToken = raw.data?.token ?? raw.token ?? firebaseIdToken;
      return extractWizToken(raw, wizToken);
    } catch (e) {
      errors.push(`${attempt.url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(`WiZ API nao aceitou Firebase token. Tentativas: ${errors.join(' | ')}`);
}

// Tenta múltiplos endpoints — a API WiZ não é documentada publicamente
export async function wizLogin(email: string, password: string): Promise<{ token: string; homeId: string }> {
  const endpoints = [
    `${WIZ_API}/account/authenticate`,
    `${WIZ_API}/v1/user/login`,
    `${WIZ_API}/users/login`,
  ];

  let lastStatus = 0;
  let socialAccountError: string | null = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      lastStatus = res.status;
      const raw = (await res.json().catch(() => null)) as (WizAuthResponse & { message?: string }) | null;
      const msg = raw?.message ?? '';

      if (!res.ok) {
        // Conta criada com Google/Facebook — não há endpoint alternativo
        if (res.status === 401 && (msg.toLowerCase().includes('social') || msg.toLowerCase().includes('google') || msg.toLowerCase().includes('facebook'))) {
          socialAccountError = 'SOCIAL_ACCOUNT: Esta conta foi criada com o Google ou Facebook. Na app WiZ → Mais → Conta → Alterar senha, define uma senha e volta aqui com o e-mail + nova senha.';
          break;
        }
        continue;
      }

      if (!raw) continue;
      const token = (raw as WizAuthResponse).data?.token ?? (raw as WizAuthResponse).token;
      if (token) return extractWizToken(raw as WizAuthResponse, token);
    } catch {
      // tenta próximo endpoint
    }
  }

  if (socialAccountError) throw new Error(socialAccountError);
  if (lastStatus === 401) {
    throw new Error('E-mail ou senha incorretos. Se criaste a conta com o Google, abre a app WiZ → Mais → Conta → Alterar senha e define uma senha.');
  }
  throw new Error('Não foi possível ligar à conta WiZ. Verifica o e-mail e a senha.');
}

export async function getWizToken(userId: string, authToken: string): Promise<{ token: string; homeId: string }> {
  const { data, error } = await supabaseAsUser(authToken)
    .from('wiz_accounts')
    .select('access_token, home_id')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('WiZ account not connected');
  return { token: data.access_token as string, homeId: (data.home_id as string) ?? '' };
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface WizDevice {
  mac: string;
  name: string;
  type: string; // "FULL_COLOR" | "DIMMABLE" | "TW" | "SOCKET" etc.
  isOn: boolean;
  brightness: number | null;   // 10–100
  colorTemp: number | null;    // Kelvin
  color: string | null;        // "#rrggbb"
}

interface WizDeviceRaw {
  mac?: string;
  id?: string;
  name?: string;
  typeName?: string;
  type?: string;
  controls?: {
    state?: boolean;
    dimming?: number;
    r?: number;
    g?: number;
    b?: number;
    temp?: number;
  };
  // estado em algumas versões da API
  state?: boolean;
  dimming?: number;
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function parseDevice(raw: WizDeviceRaw): WizDevice | null {
  const mac = raw.mac ?? raw.id;
  if (!mac || !raw.name) return null;

  const controls = raw.controls ?? {};
  const isOn = controls.state ?? raw.state ?? false;
  const dimming = controls.dimming ?? raw.dimming ?? null;
  const r = controls.r;
  const g = controls.g;
  const b = controls.b;
  const temp = controls.temp ?? null;
  const typeName = (raw.typeName ?? raw.type ?? '').toUpperCase();

  const hasColor = typeName.includes('COLOR') || typeName.includes('RGB');
  const hasDim = dimming != null;
  const hasTW = typeName.includes('TW') || typeName.includes('WHITE') || temp != null;

  return {
    mac,
    name: raw.name,
    type: typeName || 'UNKNOWN',
    isOn,
    brightness: hasDim ? dimming : null,
    colorTemp: hasTW && temp ? temp : null,
    color: hasColor && r != null && g != null && b != null ? toHex(r, g, b) : null,
  };
}

export async function wizListDevices(token: string, homeId: string): Promise<WizDevice[]> {
  // tentativa 1: /homes/{homeId}/devices
  if (homeId) {
    const res = await fetch(`${WIZ_API}/homes/${homeId}/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const raw = (await res.json()) as { data?: WizDeviceRaw[] } | WizDeviceRaw[];
      const list: WizDeviceRaw[] = Array.isArray(raw) ? raw : (raw.data ?? []);
      const devices = list.map(parseDevice).filter((d): d is WizDevice => d !== null);
      if (devices.length > 0) return devices;
    }
  }

  // tentativa 2: /devices (sem homeId)
  const res2 = await fetch(`${WIZ_API}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res2.ok) throw new Error(`WiZ device list failed: ${res2.status}`);
  const raw2 = (await res2.json()) as { data?: WizDeviceRaw[] } | WizDeviceRaw[];
  const list2: WizDeviceRaw[] = Array.isArray(raw2) ? raw2 : (raw2.data ?? []);
  return list2.map(parseDevice).filter((d): d is WizDevice => d !== null);
}

// ─── Control ──────────────────────────────────────────────────────────────────

type WizPilotParams =
  | { state: boolean }
  | { dimming: number }
  | { temp: number }
  | { r: number; g: number; b: number; dimming: number };

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function tempNameToKelvin(name: string): number {
  return name === 'warm' ? 2700 : name === 'neutral' ? 4000 : 6500;
}

export function buildWizParams(property: string, value: unknown): WizPilotParams | null {
  if (property === 'isOn') return { state: Boolean(value) };
  if (property === 'brightness' && typeof value === 'number') {
    return { dimming: Math.max(10, Math.min(100, value)) };
  }
  if (property === 'colorTemperature' && typeof value === 'string') {
    return { temp: tempNameToKelvin(value) };
  }
  if (property === 'color' && typeof value === 'string') {
    const rgb = hexToRgb(value);
    if (!rgb) return null;
    return { ...rgb, dimming: 100 };
  }
  return null;
}

export async function wizControl(
  token: string,
  mac: string,
  params: WizPilotParams
): Promise<void> {
  const res = await fetch(`${WIZ_API}/device/${mac}/pilot`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'setPilot', params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WiZ control failed (${res.status}): ${text}`);
  }
}
