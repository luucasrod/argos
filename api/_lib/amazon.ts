import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
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

const AMAZON_CLIENT_ID = process.env.AMAZON_LWA_CLIENT_ID!;
const AMAZON_CLIENT_SECRET = process.env.AMAZON_LWA_CLIENT_SECRET!;
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

// Endpoint da Phoenix API varia por região
const ALEXA_BASE: Record<string, string> = {
  na: 'https://alexa.amazon.com',
  eu: 'https://layla.amazon.co.uk',
  fe: 'https://layla.amazon.co.jp',
};

function alexaBase(region = 'na'): string {
  return ALEXA_BASE[region] ?? ALEXA_BASE.na;
}

export function getAmazonAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: AMAZON_CLIENT_ID,
    scope: 'profile:user_id alexa::all',
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });
  return `https://www.amazon.com/ap/oa?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export async function exchangeAmazonCode(code: string, redirectUri: string) {
  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: AMAZON_CLIENT_ID,
      client_secret: AMAZON_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon token exchange failed: ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function refreshAmazonToken(refreshToken: string) {
  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: AMAZON_CLIENT_ID,
      client_secret: AMAZON_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error('Amazon token refresh failed');
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function getValidAmazonToken(userId: string, authToken: string): Promise<{ token: string; region: string }> {
  const sb = supabaseAsUser(authToken);
  const { data, error } = await sb
    .from('amazon_accounts')
    .select('access_token, refresh_token, expires_at, region')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Amazon account not connected');

  const expiresAt = new Date(data.expires_at as string);
  if (expiresAt > new Date(Date.now() + 60_000)) {
    return { token: data.access_token as string, region: (data.region as string) ?? 'na' };
  }

  const refreshed = await refreshAmazonToken(data.refresh_token as string);
  await sb
    .from('amazon_accounts')
    .update({ access_token: refreshed.accessToken, expires_at: refreshed.expiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return { token: refreshed.accessToken, region: (data.region as string) ?? 'na' };
}

// ---------- Alexa Phoenix API ----------

export interface AlexaDevice {
  entityId: string;
  entityType: string;
  friendlyName: string;
  isEnabled: boolean;
  capabilities: string[];
}

// Estrutura aninhada da resposta Phoenix (simplificada)
interface ApplianceEntry {
  entityId?: string;
  entityType?: string;
  friendlyName?: string;
  isEnabled?: boolean;
  supportedOperations?: string[];
}

interface BridgeEntry {
  friendlyName?: string;
  applianceDetails?: { applianceDetailsList?: Record<string, ApplianceEntry> };
}

interface LocationEntry {
  amazonBridgeDetails?: { amazonBridgeDetailsList?: Record<string, BridgeEntry> };
}

interface PhoenixNetworkDetail {
  locationDetails?: Record<string, LocationEntry>;
}

function parsePhoenixDevices(networkDetail: PhoenixNetworkDetail): AlexaDevice[] {
  const devices: AlexaDevice[] = [];
  const seen = new Set<string>();

  for (const loc of Object.values(networkDetail.locationDetails ?? {})) {
    for (const bridge of Object.values(loc.amazonBridgeDetails?.amazonBridgeDetailsList ?? {})) {
      for (const appliance of Object.values(bridge.applianceDetails?.applianceDetailsList ?? {})) {
        if (!appliance.entityId || !appliance.entityType || !appliance.friendlyName) continue;
        if (seen.has(appliance.entityId)) continue;
        seen.add(appliance.entityId);
        devices.push({
          entityId: appliance.entityId,
          entityType: appliance.entityType,
          friendlyName: appliance.friendlyName,
          isEnabled: appliance.isEnabled ?? true,
          capabilities: appliance.supportedOperations ?? [],
        });
      }
    }
  }
  return devices;
}

export async function alexaListDevices(token: string, region = 'na'): Promise<AlexaDevice[]> {
  const base = alexaBase(region);
  const res = await fetch(`${base}/api/phoenix?includeHomeGroups=true&cached=false`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Alexa phoenix list failed: ${res.status}`);

  const raw = (await res.json()) as { networkDetail?: unknown };

  let detail: PhoenixNetworkDetail;
  if (typeof raw.networkDetail === 'string') {
    detail = JSON.parse(raw.networkDetail) as PhoenixNetworkDetail;
  } else if (raw.networkDetail && typeof raw.networkDetail === 'object') {
    detail = raw.networkDetail as PhoenixNetworkDetail;
  } else {
    return [];
  }

  return parsePhoenixDevices(detail);
}

type AlexaAction =
  | { action: 'turnOn' }
  | { action: 'turnOff' }
  | { action: 'setPercentage'; percentage: number }
  | { action: 'setColorTemperature'; colorTemperatureInKelvin: number }
  | { action: 'setColor'; colorName: string };

export function buildAlexaAction(property: string, value: unknown): AlexaAction | null {
  if (property === 'isOn') {
    return value ? { action: 'turnOn' } : { action: 'turnOff' };
  }
  if (property === 'brightness' && typeof value === 'number') {
    return { action: 'setPercentage', percentage: Math.max(1, Math.min(100, value)) };
  }
  if (property === 'colorTemperature' && typeof value === 'string') {
    const kelvin: Record<string, number> = { warm: 2700, neutral: 4000, cool: 6500 };
    const k = kelvin[value];
    if (!k) return null;
    return { action: 'setColorTemperature', colorTemperatureInKelvin: k };
  }
  return null;
}

export async function alexaControlDevice(
  token: string,
  region: string,
  entityId: string,
  entityType: string,
  parameters: AlexaAction
): Promise<void> {
  const base = alexaBase(region);
  const res = await fetch(`${base}/api/phoenix/state`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlRequests: [{ entityId, entityType, parameters }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Alexa control failed: ${res.status} ${text}`);
  }
}
