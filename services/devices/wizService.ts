import { getAccessToken } from '@/services/auth/session';

const BASE = '/api/wiz';

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface WizDeviceInfo {
  mac: string;
  name: string;
  type: string;
  isOn: boolean;
  brightness: number | null;
  colorTemp: number | null;
  color: string | null;
}


// Tenta autenticar com a WiZ directamente do telemóvel (evita bloqueio de IP da Vercel)
export async function loginWizWithGoogle(googleToken: string): Promise<void> {
  const WIZ_NEW_API = 'https://api.wiz.world';

  interface WizRaw {
    data?: { token?: string; homeId?: number | string };
    token?: string;
    homeId?: number | string;
    message?: string;
    error?: string;
  }

  // Tenta api.wiz.world (API nova, pode ter CORS; homeapi.wizconnected.com bloqueia CORS)
  const attempts = [
    { url: `${WIZ_NEW_API}/v1/user/login`, body: { grant_type: 'google', access_token: googleToken } },
    { url: `${WIZ_NEW_API}/v1/auth/social`, body: { provider: 'google', access_token: googleToken } },
    { url: `${WIZ_NEW_API}/v1/auth`, body: { grant_type: 'google', access_token: googleToken } },
    { url: `${WIZ_NEW_API}/v1/user/authenticate`, body: { grant_type: 'google', access_token: googleToken } },
    { url: `${WIZ_NEW_API}/v1/login`, body: { provider: 'google', token: googleToken } },
    { url: `${WIZ_NEW_API}/oauth/token`, body: { grant_type: 'google', access_token: googleToken } },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.body),
      });
      const raw = (await res.json().catch(() => null)) as WizRaw | null;
      console.log('[wiz direct]', attempt.url, '=>', res.status, JSON.stringify(raw));

      if (!res.ok) {
        errors.push(`${res.status} ${raw?.message ?? raw?.error ?? ''}`);
        continue;
      }
      const wizToken = raw?.data?.token ?? raw?.token;
      if (!wizToken) { errors.push('sem token na resposta'); continue; }

      const homeId = raw?.data?.homeId ? String(raw.data.homeId) : '';

      // Token obtido do telemóvel — envia ao backend para guardar no Supabase
      const saveRes = await fetch(`${BASE}?action=save-token`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ wizToken, homeId }),
      });
      if (!saveRes.ok) {
        const err = (await saveRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Falha ao guardar token WiZ');
      }
      return;
    } catch (e) {
      if (e instanceof Error && e.message.includes('Falha ao guardar')) throw e;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new Error(`WiZ Google login falhou (chamada directa). Tentativas: ${errors.join(' | ')}`);
}

export async function loginWiz(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}?action=login`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao fazer login na WiZ');
  }
}

export async function fetchWizDevices(): Promise<{ connected: boolean; devices: WizDeviceInfo[] }> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, devices: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar dispositivos WiZ');
  }
  return res.json() as Promise<{ connected: boolean; devices: WizDeviceInfo[] }>;
}

export async function controlWizDevice(
  mac: string,
  property: string,
  value: unknown
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ mac, property, value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao controlar lâmpada WiZ');
  }
}

export async function disconnectWiz(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao desconectar WiZ');
  }
}
