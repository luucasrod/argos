import { getAccessToken } from '@/services/auth/session';

const BASE = '/api/amazon';

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface AlexaDeviceInfo {
  entityId: string;
  entityType: string;
  friendlyName: string;
  isEnabled: boolean;
  capabilities: string[];
}

export async function getAmazonAuthorizeUrl(): Promise<string> {
  const res = await fetch(`${BASE}?action=authorize`, { headers: await authHeaders() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao gerar URL da Amazon');
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function exchangeAmazonCode(code: string, state: string, region?: string): Promise<void> {
  const res = await fetch(`${BASE}?action=exchange`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code, state, region: region ?? 'na' }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao conectar conta Amazon');
  }
}

export async function fetchAlexaDevices(): Promise<{
  connected: boolean;
  devices: AlexaDeviceInfo[];
}> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, devices: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar dispositivos Alexa');
  }
  return res.json() as Promise<{ connected: boolean; devices: AlexaDeviceInfo[] }>;
}

export async function controlAlexaDevice(
  entityId: string,
  entityType: string,
  property: string,
  value: unknown
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ entityId, entityType, property, value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao controlar dispositivo Alexa');
  }
}

export async function disconnectAmazon(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao desconectar Amazon');
  }
}
