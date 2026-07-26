import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const BASE = `${API_BASE}/api/xiaomi`;

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface XiaomiFanInfo {
  did: string;
  name: string;
  model: string;
  isOnline: boolean;
  isOn: boolean;
  speedValue?: number;
  swingValue?: boolean;
  angleValue?: number;
  modeValue?: number;
  power?: { siid: number; piid: number };
  speed?: { siid: number; piid: number; min: number; max: number };
  swing?: { siid: number; piid: number };
  angle?: { siid: number; piid: number; options: number[] };
  mode?: { siid: number; piid: number; options: Array<{ value: number; label: string }> };
}

export class XiaomiVerificationRequiredError extends Error {
  verificationUrl: string;
  constructor(message: string, verificationUrl: string) {
    super(message);
    this.verificationUrl = verificationUrl;
  }
}

export async function loginXiaomi(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}?action=login`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; verificationUrl?: string };
    if (err.verificationUrl) {
      throw new XiaomiVerificationRequiredError(err.error ?? 'Verificação de identidade necessária.', err.verificationUrl);
    }
    throw new Error(err.error ?? 'Falha ao fazer login na Xiaomi.');
  }
}

export async function fetchXiaomiDevices(): Promise<{ connected: boolean; devices: XiaomiFanInfo[] }> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, devices: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar dispositivos Xiaomi.');
  }
  return res.json() as Promise<{ connected: boolean; devices: XiaomiFanInfo[] }>;
}

export async function controlXiaomiDevice(did: string, siid: number, piid: number, value: unknown): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ did, siid, piid, value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao controlar o ventilador Xiaomi.');
  }
}

export async function disconnectXiaomi(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao desconectar Xiaomi.');
  }
}
