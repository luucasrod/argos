import { getAccessToken } from '@/services/auth/session';

const BASE = '/api/tuya';

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface TuyaDeviceInfo {
  id: string;
  name: string;
  category: string;
  online: boolean;
  isOn: boolean;
  brightness: number | null;
  color: string | null;
  colorTemp: number | null;
  supportsColor: boolean;
  supportsColorTemp: boolean;
  supportsBrightness: boolean;
}

export async function loginTuya(email: string, password: string, countryCode?: string): Promise<void> {
  const res = await fetch(`${BASE}?action=login`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, password, countryCode: countryCode ?? '55' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Falha ao fazer login no Smart Life.');
  }
}

export async function disconnectTuya(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Falha ao desconectar Smart Life.');
  }
}

export async function getTuyaAuthorizeUrl(): Promise<string> {
  const res = await fetch(`${BASE}?action=authorize`, { headers: await authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao gerar URL do Smart Life');
  }
  const data = await res.json() as { url: string };
  return data.url;
}

export async function exchangeTuyaCode(code: string): Promise<void> {
  const res = await fetch(`${BASE}?action=exchange`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao conectar Smart Life');
  }
}

export async function fetchTuyaDevices(): Promise<{ connected: boolean; devices: TuyaDeviceInfo[] }> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (!res.ok) {
    if (res.status === 401) return { connected: false, devices: [] };
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao buscar dispositivos Tuya');
  }
  return res.json() as Promise<{ connected: boolean; devices: TuyaDeviceInfo[] }>;
}

export async function controlTuyaDevice(
  deviceId: string,
  property: string,
  value: unknown,
  currentColor?: string
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ deviceId, property, value, currentColor }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao controlar dispositivo');
  }
}
