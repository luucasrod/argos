import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const BASE = `${API_BASE}/api/chrome`;

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface GoogleDeviceInfo {
  id: string;
  name: string;
  type: string;
  roomHint: string;
  deviceManufacturer: string;
  deviceModel: string;
  hwVersion: string;
  swVersion: string;
  isOnline: boolean;
  isOn?: boolean;
  brightness?: number;
  colorTemperature?: number;
  thermostatTemperatureSetpoint?: number;
  thermostatTemperatureAmbient?: number;
  thermostatHumidityAmbient?: number;
  thermostatMode?: string;
  traits: string[];
}

export async function loginChrome(): Promise<string> {
  const res = await fetch(`${BASE}?action=login`, {
    headers: await authHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as { authUrl?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? 'Falha ao fazer login no Google Home.');
  }
  if (!data.authUrl) throw new Error('URL de autorização do Google não recebida.');
  return data.authUrl;
}

export async function fetchChromeDevices(): Promise<{
  connected: boolean;
  devices: GoogleDeviceInfo[];
}> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, devices: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar dispositivos Google Home.');
  }
  return res.json() as Promise<{ connected: boolean; devices: GoogleDeviceInfo[] }>;
}

export async function controlChromeDevice(
  deviceId: string,
  command: string,
  params?: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ deviceId, command, params }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao controlar dispositivo Google Home.');
  }
}

export async function disconnectChrome(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao desconectar Google Home.');
  }
}
