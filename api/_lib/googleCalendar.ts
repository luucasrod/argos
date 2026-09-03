import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Cliente com service role — só usado no callback do OAuth (Google redireciona
 * direto pro nosso servidor, sem levar o Bearer token do usuário junto). O
 * `state` carrega o userId; a política RLS de `google_calendar_accounts`
 * continua ativa para qualquer outro acesso via `supabaseAsUser`.
 */
export function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function getUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const sb = supabaseAsUser(token);
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  return { user, token };
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/**
 * `state` carrega userId + plataforma de origem (separados por `|`), para o
 * callback (server-to-server, sem sessão) saber quem é o usuário E pra onde
 * mandar de volta no fim — app nativo (esquema `argos://`) ou PWA (URL normal).
 */
export function encodeState(userId: string, platform: 'native' | 'web'): string {
  return `${userId}|${platform}`;
}

export function decodeState(state: string): { userId: string; platform: 'native' | 'web' } {
  const [userId, platform] = state.split('|');
  return { userId, platform: platform === 'web' ? 'web' : 'native' };
}

export function getGoogleCalendarAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    // Sem isto o Google só devolve refresh_token na PRIMEIRA autorização —
    // reconectar depois de já ter conectado antes ficaria sem refresh_token.
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export async function exchangeGoogleCalendarCode(code: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  const data = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    tokenType: data.token_type,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
  };
}

async function refreshGoogleToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error('Google token refresh failed');
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function getValidGoogleCalendarToken(userId: string, authToken: string): Promise<string> {
  const sb = supabaseAsUser(authToken);
  const { data, error } = await sb
    .from('google_calendar_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Google Calendar account not connected');

  const expiresAt = new Date(data.expires_at as string);
  if (expiresAt > new Date(Date.now() + 60_000)) {
    return data.access_token as string;
  }

  const refreshed = await refreshGoogleToken(data.refresh_token as string);
  await sb
    .from('google_calendar_accounts')
    .update({ access_token: refreshed.accessToken, expires_at: refreshed.expiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return refreshed.accessToken;
}

// ---------- Google Calendar API ----------

export interface CalendarEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
}

interface GoogleEventEntry {
  id: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export async function listUpcomingEvents(accessToken: string, maxResults = 10): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Calendar events failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { items?: GoogleEventEntry[] };
  return (data.items ?? []).map((item) => ({
    id: item.id,
    title: item.summary ?? '(sem título)',
    start: item.start?.dateTime ?? item.start?.date ?? null,
    end: item.end?.dateTime ?? item.end?.date ?? null,
    allDay: Boolean(item.start?.date && !item.start?.dateTime),
    location: item.location ?? null,
  }));
}
