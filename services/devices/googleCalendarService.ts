import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const BASE = `${API_BASE}/api/calendar`;

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface CalendarEventInfo {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
}

export async function getGoogleCalendarAuthorizeUrl(platform: 'native' | 'web'): Promise<string> {
  const res = await fetch(`${BASE}?action=authorize&platform=${platform}`, { headers: await authHeaders() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao gerar URL do Google Calendar');
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function fetchCalendarEvents(): Promise<{ connected: boolean; events: CalendarEventInfo[] }> {
  const res = await fetch(`${BASE}?action=events`, { headers: await authHeaders() });
  if (res.status === 401) return { connected: false, events: [] };
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao buscar eventos do Google Calendar');
  }
  return res.json() as Promise<{ connected: boolean; events: CalendarEventInfo[] }>;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await fetch(`${BASE}?action=disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Falha ao desconectar Google Calendar');
  }
}
