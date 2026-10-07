/**
 * Telemetria de roteamento de intenções (FASE 23 do Prompt Master).
 * Registra qual caminho cada comando tomou (local vs cloud) e a latência.
 * Dados salvos em AsyncStorage — nunca quebram o app se falharem.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'argos:route_metrics_v1';
const MAX_ENTRIES = 300;

export type RouteEntry = {
  ts: number;
  route: 'local' | 'cloud';
  intent: string;
  latencyMs: number;
  success: boolean;
};

export type RouteStats = {
  totalCommands: number;
  localPercent: number;
  avgLocalMs: number;
  avgCloudMs: number;
};

export async function logRoute(entry: RouteEntry): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const entries: RouteEntry[] = raw ? JSON.parse(raw) : [];
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // telemetria não pode quebrar o app
  }
}

export async function getRouteMetrics(): Promise<RouteEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getRouteStats(): Promise<RouteStats> {
  const entries = await getRouteMetrics();
  if (entries.length === 0) {
    return { totalCommands: 0, localPercent: 0, avgLocalMs: 0, avgCloudMs: 0 };
  }

  const local = entries.filter((e) => e.route === 'local');
  const cloud = entries.filter((e) => e.route === 'cloud');

  const avg = (arr: RouteEntry[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, e) => s + e.latencyMs, 0) / arr.length) : 0;

  return {
    totalCommands: entries.length,
    localPercent: Math.round((local.length / entries.length) * 100),
    avgLocalMs: avg(local),
    avgCloudMs: avg(cloud),
  };
}
