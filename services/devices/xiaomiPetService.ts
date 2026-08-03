import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const BASE = `${API_BASE}/api/xiaomi-pet`;

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface XiaomiPetDeviceInfo {
  did: string;
  name: string;
  model: string;
  deviceType: 'feeder' | 'litter-box' | 'water-feeder' | 'other-pet';
  isOnline: boolean;
  isOn: boolean;
  feedAmountValue?: number;
  feedingScheduleValue?: string;
  waterLevelValue?: number;
  wasteLevelValue?: number;
  cleaningModeValue?: number;
  lightControlValue?: boolean;
  temperatureValue?: number;
  power?: { siid: number; piid: number };
  feedAmount?: { siid: number; piid: number; min: number; max: number };
  feedingSchedule?: { siid: number; piid: number };
  waterLevel?: { siid: number; piid: number; min: number; max: number };
  wasteLevel?: { siid: number; piid: number; min: number; max: number };
  cleaningMode?: { siid: number; piid: number; options: Array<{ value: number; label: string }> };
  lightControl?: { siid: number; piid: number };
  temperature?: { siid: number; piid: number };
}

/** Usa a mesma autenticação Xiaomi já estabelecida — não precisa novo login */
export async function fetchXiaomiPetDevices(): Promise<{
  connected: boolean;
  devices: XiaomiPetDeviceInfo[];
}> {
  const res = await fetch(`${BASE}?action=devices`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, devices: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar dispositivos Xiaomi Pet.');
  }
  return res.json() as Promise<{ connected: boolean; devices: XiaomiPetDeviceInfo[] }>;
}

export async function controlXiaomiPetDevice(
  did: string,
  siid: number,
  piid: number,
  value: unknown
): Promise<void> {
  const res = await fetch(`${BASE}?action=control`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ did, siid, piid, value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao controlar dispositivo Xiaomi Pet.');
  }
}
