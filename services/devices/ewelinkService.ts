/**
 * ewelinkService.ts — cliente para as rotas /api/ewelink/* (Vercel).
 * Mantém o App Secret eWeLink fora do bundle web.
 */
import { getAccessToken } from '@/services/auth/session';

async function authHeader(): Promise<Record<string, string>> {
  // getAccessToken valida a sessão e renova o token se estiver expirado —
  // getSession() puro pode devolver um access_token velho logo ao reabrir o
  // app, fazendo as chamadas eWeLink falharem com 401 e o app achar (errado)
  // que a conta eWeLink foi desconectada.
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export interface EwelinkDevice {
  deviceid: string;
  name: string;
  online: boolean;
  isOn: boolean;
  productModel?: string;
}

export async function getEwelinkAuthorizeUrl(): Promise<string> {
  const headers = await authHeader();
  const res = await fetch('/api/ewelink/authorize', { headers });
  if (!res.ok) throw new Error('Não foi possível iniciar a conexão com eWeLink.');
  const json = (await res.json()) as { url: string };
  return json.url;
}

export async function exchangeEwelinkCode(code: string, region: string, state?: string): Promise<void> {
  const headers = await authHeader();
  const res = await fetch('/api/ewelink/exchange', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, region, state }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Falha ao conectar conta eWeLink.');
  }
}

export async function loginEwelinkWithPassword(
  email: string,
  password: string,
  countryCode: string
): Promise<void> {
  const headers = await authHeader();
  const res = await fetch('/api/ewelink/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, countryCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Falha ao fazer login no eWeLink.');
  }
}

export async function fetchEwelinkDevices(): Promise<{ connected: boolean; devices: EwelinkDevice[] }> {
  const headers = await authHeader();
  const res = await fetch('/api/ewelink/devices', { headers });
  if (!res.ok) return { connected: false, devices: [] };
  return res.json();
}

export async function controlEwelinkDevice(deviceId: string, params: Record<string, unknown>): Promise<void> {
  const headers = await authHeader();
  const res = await fetch('/api/ewelink/control', {
    method: 'POST',
    headers,
    body: JSON.stringify({ deviceId, params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Falha ao controlar dispositivo eWeLink.');
  }
}
