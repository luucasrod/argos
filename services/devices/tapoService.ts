import { getAccessToken } from '@/services/auth/session';

const BASE = '/api/tapo';

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface TapoDeviceInfo {
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

export async function loginTapo(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}?action=login`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao fazer login na Tapo.');
  }
}

export async function fetchTapoDevices(): Promise<{ connected: boolean; devices: TapoDeviceInfo[] }> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, devices: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar dispositivos Tapo.');
  }
  return res.json() as Promise<{ connected: boolean; devices: TapoDeviceInfo[] }>;
}

export async function controlTapoDevice(
  deviceId: string,
  appServerUrl: string,
  property: string,
  value: unknown
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ deviceId, appServerUrl, property, value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao controlar dispositivo Tapo.');
  }
}

export async function disconnectTapo(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao desconectar Tapo.');
  }
}
