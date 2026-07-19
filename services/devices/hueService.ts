/**
 * hueService.ts — bridge client-side para a rota /api/hue (router unificado).
 */
import { getAccessToken } from '@/services/auth/session';

const BASE = '/api/hue';

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface HueLightInfo {
  id: string;
  name: string;
  isOn: boolean;
  brightness: number;
  color: string | null;
  colorTemp: number | null;
  supportsColor: boolean;
  supportsColorTemp: boolean;
}

export async function getHueAuthorizeUrl(): Promise<string> {
  const res = await fetch(`${BASE}?action=authorize`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao gerar URL do Hue');
  }
  const data = await res.json() as { url: string };
  return data.url;
}

export async function exchangeHueCode(code: string): Promise<void> {
  const res = await fetch(`${BASE}?action=exchange`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao conectar Philips Hue');
  }
}

export async function fetchHueLights(): Promise<{ connected: boolean; lights: HueLightInfo[] }> {
  const res = await fetch(`${BASE}?action=lights`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) return { connected: false, lights: [] };
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao buscar lâmpadas Hue');
  }
  return res.json() as Promise<{ connected: boolean; lights: HueLightInfo[] }>;
}

export async function controlHueLight(
  lightId: string,
  property: string,
  value: unknown
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ lightId, property, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao controlar lâmpada Hue');
  }
}
