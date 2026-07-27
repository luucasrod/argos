/**
 * api/_lib/chrome.ts — helpers para Google Home/Smart Home API integration.
 * Mantém GOOGLE_CLIENT_SECRET apenas no servidor.
 * Suporta controle de dispositivos conectados ao Google Home/Nest.
 */
import { createClient } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/chrome?action=callback';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function getUserFromAuthHeader(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { token, userId: data.user.id };
}

/** Monta a URL de autorização OAuth do Google. */
export function buildAuthorizeUrl(state: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/homegraph',
    'https://www.googleapis.com/auth/sdm.service',
  ];

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Troca o "code" do OAuth pelos tokens de acesso. */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    error?: string;
    error_description?: string;
  };

  if (json.error) {
    throw new Error(json.error_description || 'Falha ao trocar code por token Google');
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? '',
    expiresIn: json.expires_in,
  };
}

/** Renova o accessToken usando o refreshToken. */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    error?: string;
    error_description?: string;
  };

  if (json.error) {
    throw new Error(json.error_description || 'Falha ao renovar token Google');
  }

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
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

/** Lista todos os dispositivos conectados ao Google Home. */
export async function listChromeDevices(accessToken: string): Promise<GoogleDeviceInfo[]> {
  const res = await fetch('https://homegraph.googleapis.com/v1/devices', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (res.status === 401) {
      throw new Error('Unauthorized: accessToken expirado');
    }
    throw new Error(error.error?.message || `Falha ao listar dispositivos Google Home (${res.status})`);
  }

  const data = (await res.json()) as { devices?: Array<Record<string, unknown>> };
  const devices: GoogleDeviceInfo[] = [];

  if (data.devices) {
    for (const dev of data.devices) {
      const traits = (dev.traits as string[]) ?? [];

      devices.push({
        id: String(dev.id ?? ''),
        name: String(dev.name ?? 'Dispositivo Google Home'),
        type: String(dev.type ?? ''),
        roomHint: String(dev.roomHint ?? ''),
        deviceManufacturer: String(dev.deviceManufacturer ?? ''),
        deviceModel: String(dev.deviceModel ?? ''),
        hwVersion: String(dev.hwVersion ?? ''),
        swVersion: String(dev.swVersion ?? ''),
        isOnline: dev.online === true,
        isOn: dev.traits?.includes('action.devices.traits.OnOff')
          ? dev.states?.online?.on === true
          : undefined,
        brightness: traits.includes('action.devices.traits.Brightness')
          ? Number(dev.states?.brightness?.brightness) || undefined
          : undefined,
        colorTemperature: traits.includes('action.devices.traits.ColorTemperature')
          ? Number(dev.states?.colorTemperature?.temperatureK) || undefined
          : undefined,
        thermostatTemperatureSetpoint: traits.includes('action.devices.traits.TemperatureSetting')
          ? Number(dev.states?.thermostatTemperatureSetpoint?.thermostatTemperatureSetpoint) || undefined
          : undefined,
        thermostatTemperatureAmbient: traits.includes('action.devices.traits.TemperatureSetting')
          ? Number(dev.states?.thermostatTemperatureAmbient?.ambientTemperatureCelsius) || undefined
          : undefined,
        thermostatHumidityAmbient: traits.includes('action.devices.traits.TemperatureSetting')
          ? Number(dev.states?.thermostatHumidityAmbient?.ambientHumidityPercent) || undefined
          : undefined,
        thermostatMode: traits.includes('action.devices.traits.TemperatureSetting')
          ? String(dev.states?.thermostatMode?.thermostatMode) || undefined
          : undefined,
        traits,
      });
    }
  }

  return devices;
}

export interface ControlCommand {
  deviceId: string;
  command: string;
  params?: Record<string, unknown>;
}

/** Controla um dispositivo Google Home. */
export async function controlChromeDevice(accessToken: string, cmd: ControlCommand): Promise<void> {
  const commandMap: Record<string, unknown> = {};

  if (cmd.command === 'OnOff') {
    commandMap['action.devices.commands.OnOff'] = { on: cmd.params?.on === true };
  } else if (cmd.command === 'BrightnessAbsolute') {
    commandMap['action.devices.commands.BrightnessAbsolute'] = {
      brightness: Number(cmd.params?.brightness) || 0,
    };
  } else if (cmd.command === 'ColorAbsolute') {
    commandMap['action.devices.commands.ColorAbsolute'] = {
      color: {
        temperatureK: Number(cmd.params?.temperatureK) || 2700,
      },
    };
  } else if (cmd.command === 'ThermostatTemperatureSetpoint') {
    commandMap['action.devices.commands.ThermostatTemperatureSetpoint'] = {
      thermostatTemperatureSetpoint: Number(cmd.params?.temperature) || 20,
    };
  } else if (cmd.command === 'ThermostatSetMode') {
    commandMap['action.devices.commands.ThermostatSetMode'] = {
      thermostatMode: String(cmd.params?.mode) || 'HEAT',
    };
  }

  const body = {
    commands: [
      {
        devices: [{ id: cmd.deviceId }],
        execution: Object.entries(commandMap).map(([command, params]) => ({
          command,
          params,
        })),
      },
    ],
  };

  const res = await fetch('https://homegraph.googleapis.com/v1/devices:executeCommand', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (res.status === 401) {
      throw new Error('Unauthorized: accessToken expirado');
    }
    throw new Error(error.error?.message || `Falha ao controlar dispositivo Google Home (${res.status})`);
  }
}

/** Desconecta a conta Google (limpa tokens no Supabase). */
export async function disconnectChrome(userId: string): Promise<void> {
  const supabase = supabaseAdmin;
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'chrome');

  if (error) {
    throw new Error(`Falha ao desconectar Google Home: ${error.message}`);
  }
}
