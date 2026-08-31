/**
 * api/ha.ts — Integração com Home Assistant
 *
 * Gerenciamento de chave (requer auth Supabase):
 *   POST   /api/ha?action=generate-key   → { api_key }
 *   GET    /api/ha?action=get-key        → { api_key, created_at }
 *   DELETE /api/ha?action=delete-key     → { ok: true }
 *
 * Conversa (requer header x-ha-key):
 *   POST   /api/ha
 *   Body:  { "message": "liga a luz da sala", "session_id"?: "..." }
 *   Resp:  { "reply": "...", "session_id"?: "..." }
 *
 * Ao contrário do fluxo do app (onde o CLIENTE executa as ações recebidas do
 * Claude), aqui não existe cliente — o Home Assistant só fala texto e espera
 * texto de volta. Por isso essa rota executa as ações de dispositivo
 * diretamente no servidor, reaproveitando os helpers server-side dos
 * outros integrações (_lib/wiz, _lib/ewelink, _lib/xiaomi, _lib/tuya).
 *
 * Melhorias vs. versão original:
 *  - Cache de dispositivos (45 s) — comandos rápidos em sequência não relêem 4 APIs
 *  - Histórico de sessão em memória (20 min) — contexto multi-turno real
 *  - Comandos de cor diretos (fast path) — "muda pra azul" sem chamar o Claude
 *  - Consultas de estado (fast path) — "tá ligado?" respondido da lista
 *  - Invalida cache de dispositivos após ação — estado refletido na próxima consulta
 *  - Prompt multi-turno — Claude sabe que tem histórico e usa contexto anterior
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { wizListDevices, wizControl, buildWizParams, type WizDevice } from './_lib/wiz';
import { getValidAccessToken as getValidEwelinkToken, ewelinkRequest } from './_lib/ewelink';
import { xiaomiListFans, xiaomiSetProperty, type XiaomiSession, type XiaomiDeviceDto } from './_lib/xiaomi';
import { getProjectCredentials, tuyaListDevices, tuyaControl, hexToTuyaHsv, tempNameToTuya, type TuyaCredentials } from './_lib/tuya';
import { selectMemoryContext } from '../services/ai/memorySelection';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-ha-key');
}

function generateApiKey(): string {
  return 'argos_ha_' + crypto.randomBytes(24).toString('hex');
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface UnifiedDevice {
  id: string;
  name: string;
  category: string;
  isOn: boolean;
  supportsColor?: boolean;
  supportsBrightness?: boolean;
  source: 'wiz' | 'ewelink' | 'xiaomi' | 'tuya';
}

interface ExecutionContext {
  wizDevices: Map<string, WizDevice>;
  wizCreds?: { token: string; homeId: string };
  ewelinkDevices: Map<string, { deviceid: string; switches?: Array<{ switch: string; outlet: number }> }>;
  ewelinkToken?: { accessToken: string; region: string };
  xiaomiDevices: Map<string, XiaomiDeviceDto>;
  xiaomiSession?: { session: XiaomiSession; region: string };
  tuyaCreds?: TuyaCredentials;
}

interface DeviceAction {
  deviceId: string;
  action: string;
  property: string;
  value: unknown;
  label: string;
}

interface HaParsedResponse {
  type: 'device_control' | 'chat';
  speech?: string;
  actions?: DeviceAction[];
}

// ── Cache de dispositivos (45 s por usuário) ─────────────────────────────────
//
// Funciona porque instâncias Vercel "warm" são reaproveitadas entre requisições
// do mesmo usuário. Quando o usuário executa comandos em sequência (típico no
// uso de voz), o cache evita recarregar 4 APIs externas a cada fala.

interface DeviceCacheEntry {
  devices: UnifiedDevice[];
  ctx: ExecutionContext;
  ts: number;
}

const deviceCache = new Map<string, DeviceCacheEntry>();
const DEVICE_CACHE_TTL = 45_000; // 45 segundos

function getCachedDevices(userId: string): DeviceCacheEntry | null {
  const entry = deviceCache.get(userId);
  if (!entry || Date.now() - entry.ts > DEVICE_CACHE_TTL) return null;
  return entry;
}

function setCachedDevices(userId: string, devices: UnifiedDevice[], ctx: ExecutionContext) {
  deviceCache.set(userId, { devices, ctx, ts: Date.now() });
}

function invalidateDeviceCache(userId: string) {
  // Após executar uma ação, o estado dos dispositivos mudou — invalida o cache
  // pra que a próxima consulta ("tá ligado?") reflita o novo estado.
  deviceCache.delete(userId);
}

// ── Histórico de sessão (multi-turno, 20 min em memória) ─────────────────────
//
// Cada session_id do HA mantém os últimos N turnos da conversa. Como instâncias
// Vercel warm sobrevivem entre requisições, isso funciona para conversas curtas.
// Cold starts zeram o histórico, mas o sistema degrada graciosamente.

interface SessionEntry {
  messages: Anthropic.MessageParam[];
  ts: number;
}

const sessionCache = new Map<string, SessionEntry>();
const SESSION_TTL = 20 * 60 * 1000; // 20 minutos
const SESSION_MAX_TURNS = 12; // 6 exchanges (user+assistant)

function getSessionHistory(sessionId: string | undefined): Anthropic.MessageParam[] {
  if (!sessionId) return [];
  const entry = sessionCache.get(sessionId);
  if (!entry || Date.now() - entry.ts > SESSION_TTL) return [];
  return entry.messages;
}

function updateSession(sessionId: string | undefined, userMsg: string, assistantMsg: string) {
  if (!sessionId) return;
  const existing = getSessionHistory(sessionId);
  const updated: Anthropic.MessageParam[] = [
    ...existing,
    { role: 'user', content: userMsg },
    { role: 'assistant', content: assistantMsg },
  ];
  sessionCache.set(sessionId, {
    messages: updated.slice(-SESSION_MAX_TURNS),
    ts: Date.now(),
  });
}

// ── Carregamento de dispositivos ──────────────────────────────────────────────

async function loadDevices(userId: string): Promise<{ devices: UnifiedDevice[]; ctx: ExecutionContext }> {
  const ctx: ExecutionContext = {
    wizDevices: new Map(),
    ewelinkDevices: new Map(),
    xiaomiDevices: new Map(),
  };

  const [wizResult, ewelinkResult, xiaomiResult, tuyaResult] = await Promise.allSettled([
    // ── WiZ ────────────────────────────────────────────────────────────────
    (async () => {
      const { data: wizRow } = await supabaseAdmin
        .from('wiz_accounts')
        .select('access_token, home_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!wizRow) return [] as UnifiedDevice[];
      const row = wizRow as { access_token: string; home_id: string | null };
      ctx.wizCreds = { token: row.access_token, homeId: row.home_id ?? '' };
      const lights = await wizListDevices(row.access_token, row.home_id ?? '');
      return lights.map((light) => {
        ctx.wizDevices.set(light.mac, light);
        const typeUp = light.type.toUpperCase();
        return {
          id: `wiz:${light.mac}`,
          name: light.name.trim(),
          category: 'lights',
          isOn: light.isOn,
          supportsColor: typeUp.includes('COLOR') || typeUp.includes('RGB'),
          supportsBrightness: light.brightness != null || typeUp.includes('DIMMABLE') || typeUp.includes('TW'),
          source: 'wiz' as const,
        };
      });
    })(),
    // ── eWeLink ─────────────────────────────────────────────────────────────
    (async () => {
      const tokenInfo = await getValidEwelinkToken(supabaseAdmin as ReturnType<typeof supabaseAsUser>, userId);
      if (!tokenInfo) return [] as UnifiedDevice[];
      ctx.ewelinkToken = tokenInfo;
      const result = await ewelinkRequest(tokenInfo.region, '/v2/device/thing?num=0', {
        accessToken: tokenInfo.accessToken,
      });
      if (result.error !== 0) return [] as UnifiedDevice[];
      const thingList =
        (result.data.thingList as Array<{ itemType: number; itemData: Record<string, unknown> }>) ?? [];
      return thingList
        .filter((t) => t.itemType === 1 || t.itemType === 2)
        .map((t) => {
          const d = t.itemData;
          const params = (d.params as Record<string, unknown>) ?? {};
          const switches = params.switches as Array<{ switch: string; outlet: number }> | undefined;
          const isOn = switches?.length ? switches.some((s) => s.switch === 'on') : params.switch === 'on';
          const deviceid = d.deviceid as string;
          ctx.ewelinkDevices.set(deviceid, { deviceid, switches });
          return {
            id: `ewelink:${deviceid}`,
            name: (d.name as string).trim(),
            category: 'outlets',
            isOn,
            source: 'ewelink' as const,
          };
        });
    })(),
    // ── Xiaomi ──────────────────────────────────────────────────────────────
    (async () => {
      const { data: xiaomiRow } = await supabaseAdmin
        .from('xiaomi_accounts')
        .select('region, ssecurity, mi_user_id, c_user_id, service_token, pass_token')
        .eq('user_id', userId)
        .maybeSingle();
      if (!xiaomiRow) return [] as UnifiedDevice[];
      const row = xiaomiRow as {
        region: string; ssecurity: string; mi_user_id: string;
        c_user_id: string; service_token: string; pass_token: string;
      };
      const session: XiaomiSession = {
        ssecurity: row.ssecurity, userId: row.mi_user_id, cUserId: row.c_user_id,
        serviceToken: row.service_token, passToken: row.pass_token,
      };
      ctx.xiaomiSession = { session, region: row.region };
      const { devices: fans } = await xiaomiListFans(session, row.region);
      return fans.map((fan) => {
        ctx.xiaomiDevices.set(fan.did, fan);
        return {
          id: `xiaomi:${fan.did}`,
          name: fan.name.trim(),
          category: 'fans',
          isOn: fan.isOn,
          supportsBrightness: !!fan.speed,
          source: 'xiaomi' as const,
        };
      });
    })(),
    // ── Tuya ────────────────────────────────────────────────────────────────
    (async () => {
      const creds = await getProjectCredentials();
      ctx.tuyaCreds = creds;
      const lights = await tuyaListDevices(creds.uid, creds.accessToken, creds.region);
      return lights.map((light) => ({
        id: `tuya:${light.id}`,
        name: light.name,
        category: 'lights',
        isOn: light.isOn,
        supportsColor: light.supportsColor,
        supportsBrightness: light.supportsBrightness,
        source: 'tuya' as const,
      }));
    })(),
  ]);

  if (wizResult.status === 'rejected') console.error('[ha] falha WiZ', wizResult.reason);
  if (ewelinkResult.status === 'rejected') console.error('[ha] falha eWeLink', ewelinkResult.reason);
  if (xiaomiResult.status === 'rejected') console.error('[ha] falha Xiaomi', xiaomiResult.reason);
  if (tuyaResult.status === 'rejected') console.error('[ha] falha Tuya', tuyaResult.reason);

  const devices: UnifiedDevice[] = [
    ...(wizResult.status === 'fulfilled' ? wizResult.value : []),
    ...(ewelinkResult.status === 'fulfilled' ? ewelinkResult.value : []),
    ...(xiaomiResult.status === 'fulfilled' ? xiaomiResult.value : []),
    ...(tuyaResult.status === 'fulfilled' ? tuyaResult.value : []),
  ];

  return { devices, ctx };
}

// ── Execução de ações ──────────────────────────────────────────────────────────

async function executeAction(action: DeviceAction, ctx: ExecutionContext): Promise<void> {
  const [source, ...rest] = action.deviceId.split(':');
  const rawId = rest.join(':');

  if (source === 'wiz' && ctx.wizCreds) {
    const params = buildWizParams(action.property, action.value);
    if (!params) throw new Error(`Propriedade ou valor inválido pra WiZ: ${action.property}=${action.value}`);
    await wizControl(ctx.wizCreds.token, rawId, params);
    return;
  }

  if (source === 'ewelink' && ctx.ewelinkToken) {
    const device = ctx.ewelinkDevices.get(rawId);
    let params: Record<string, unknown> = { switch: action.value ? 'on' : 'off' };
    if (device?.switches?.length) {
      params = { switches: device.switches.map((s) => ({ switch: action.value ? 'on' : 'off', outlet: s.outlet })) };
    }
    const result = await ewelinkRequest(ctx.ewelinkToken.region, '/v2/device/thing/status', {
      method: 'POST',
      accessToken: ctx.ewelinkToken.accessToken,
      body: { type: 1, id: rawId, params },
    });
    if (result.error !== 0) throw new Error(result.msg || 'Erro ao controlar dispositivo eWeLink');
    return;
  }

  if (source === 'xiaomi' && ctx.xiaomiSession) {
    const fan = ctx.xiaomiDevices.get(rawId);
    if (!fan) throw new Error('Ventilador não encontrado');
    if (action.property === 'isOn' && fan.power) {
      await xiaomiSetProperty(
        ctx.xiaomiSession.session,
        ctx.xiaomiSession.region,
        rawId,
        fan.power.siid,
        fan.power.piid,
        Boolean(action.value)
      );
    } else if (action.property === 'brightness' && fan.speed) {
      const pct = Math.max(0, Math.min(100, Number(action.value)));
      const scaled = Math.round(fan.speed.min + (pct / 100) * (fan.speed.max - fan.speed.min));
      await xiaomiSetProperty(
        ctx.xiaomiSession.session,
        ctx.xiaomiSession.region,
        rawId,
        fan.speed.siid,
        fan.speed.piid,
        scaled
      );
    }
    return;
  }

  if (source === 'tuya' && ctx.tuyaCreds) {
    const commands: Array<{ code: string; value: unknown }> = [];
    if (action.property === 'isOn') {
      commands.push({ code: 'switch_led', value: Boolean(action.value) });
    } else if (action.property === 'brightness') {
      const pct = Math.max(1, Math.min(100, Number(action.value)));
      commands.push({ code: 'switch_led', value: true });
      commands.push({ code: 'bright_value_v2', value: Math.round(10 + (pct / 100) * 990) });
      commands.push({ code: 'work_mode', value: 'white' });
    } else if (action.property === 'color') {
      const hsv = hexToTuyaHsv(String(action.value));
      if (!hsv) throw new Error(`Cor inválida: ${action.value}`);
      commands.push({ code: 'switch_led', value: true });
      commands.push({ code: 'work_mode', value: 'colour' });
      commands.push({ code: 'colour_data_v2', value: hsv });
    } else if (action.property === 'colorTemperature') {
      const tuyaTemp = tempNameToTuya(action.value as string | number);
      if (tuyaTemp === null) throw new Error(`Temperatura inválida: ${action.value}`);
      commands.push({ code: 'switch_led', value: true });
      commands.push({ code: 'work_mode', value: 'white' });
      commands.push({ code: 'temp_value_v2', value: tuyaTemp });
    }
    if (commands.length) {
      await tuyaControl(rawId, commands, ctx.tuyaCreds.accessToken, ctx.tuyaCreds.region);
    }
    return;
  }

  throw new Error(`Dispositivo ou fonte não suportada: ${action.deviceId}`);
}

// ── Normalização de texto ─────────────────────────────────────────────────────

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

// ── Vocabulário de controle ────────────────────────────────────────────────────

const ON_WORDS = ['liga', 'ligar', 'acende', 'acender', 'ativa', 'ativar', 'ligado', 'ligada', 'turn on', 'on'];
const OFF_WORDS = ['desliga', 'desligar', 'apaga', 'apagar', 'desativa', 'desativar', 'desligado', 'desligada', 'para', 'parar', 'apagado', 'apagada'];

const SPEED_MAX = ['maximo', 'maxima', 'total', 'tudo', 'cem', '100', 'potencia', 'potencia maxima'];
const SPEED_MIN = ['minimo', 'minima', 'quase', 'pouco', 'fraco', 'fraca', 'suave'];
const SPEED_HIGH = ['forte', 'forca', 'mais', 'aumenta', 'aumentar', 'sobe', 'subir', 'rapido', 'rapida', 'alto', 'alta', 'acelera'];
const SPEED_LOW = ['menos', 'diminui', 'diminuir', 'desce', 'descer', 'devagar', 'lento', 'lenta', 'baixo', 'baixa', 'reduz'];

// Cores e temperaturas de cor — mapeadas para hex ou nome canônico de temperatura.
const COLOR_MAP: Record<string, string> = {
  'vermelho': '#FF0000',
  'vermelha': '#FF0000',
  'verde': '#00CC44',
  'azul': '#0055FF',
  'amarelo': '#FFD700',
  'amarela': '#FFD700',
  'laranja': '#FF8800',
  'roxo': '#8800FF',
  'roxa': '#8800FF',
  'rosa': '#FF69B4',
  'ciano': '#00CED1',
  'turquesa': '#00CED1',
  'branco': '#FFFFFF',
  'branca': '#FFFFFF',
  'lilas': '#C8A2C8',
  'lilás': '#C8A2C8',
};

const COLOR_TEMP_MAP: Record<string, string> = {
  'quente': 'warm',
  'quentinho': 'warm',
  'amarelado': 'warm',
  'amarelada': 'warm',
  'neutro': 'neutral',
  'neutra': 'neutral',
  'neutral': 'neutral',
  'fria': 'cool',
  'frio': 'cool',
  'branca fria': 'cool',
  'luz fria': 'cool',
  'luz quente': 'warm',
};

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  fans: ['ventilador', 'ventiladores', 'vento', 'ar', 'fan'],
  lights: ['luz', 'luzes', 'lampada', 'lampadas', 'luminaria', 'led'],
  outlets: ['tomada', 'tomadas', 'plugue'],
};

const NAME_STOPWORDS = new Set(['de', 'da', 'do', 'a', 'o', 'e', 'smart', 'mi', 'the', 'wi', 'fi', 'rgb']);

function nameKeywords(name: string): string[] {
  return normalizeText(name)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NAME_STOPWORDS.has(w));
}

function extractPercentage(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%|(\d{1,3})\s*por\s*cento/);
  const raw = m ? (m[1] ?? m[2]) : null;
  if (!raw) return null;
  return Math.max(0, Math.min(100, parseInt(raw, 10)));
}

function findTargetDevices(text: string, devices: UnifiedDevice[]): UnifiedDevice[] {
  const byFullName = devices.filter((d) => text.includes(normalizeText(d.name)));
  if (byFullName.length > 0) return byFullName;

  const byCategory = devices.filter((d) => {
    const synonyms = CATEGORY_SYNONYMS[d.category] ?? [];
    return synonyms.some((w) => text.includes(w));
  });
  if (byCategory.length === 1) return byCategory;
  if (byCategory.length > 1) {
    const narrowed = byCategory.filter((d) => nameKeywords(d.name).some((kw) => text.includes(kw)));
    return narrowed.length > 0 ? narrowed : byCategory;
  }

  return devices.filter((d) => nameKeywords(d.name).some((kw) => text.includes(kw)));
}

// ── Fast paths ────────────────────────────────────────────────────────────────

/** Liga/desliga: "liga a luz da sala", "desliga o ventilador" */
function matchToggleCommand(text: string, devices: UnifiedDevice[]): { speech: string; actions: DeviceAction[] } | null {
  const words = text.split(/\s+/);
  if (words.length > 12) return null;

  let isOn: boolean | null = null;
  // OFF_WORDS first: "desliga" contains "liga" (ON_WORD), checking OFF first avoids false positives.
  if (OFF_WORDS.some((w) => text.includes(w))) isOn = false;
  else if (ON_WORDS.some((w) => text.includes(w))) isOn = true;
  if (isOn === null) return null;

  const targets = findTargetDevices(text, devices);
  if (targets.length === 0) return null;

  const verb = isOn ? 'Ligando' : 'Desligando';
  const actions = targets.map((d) => ({
    deviceId: d.id,
    action: isOn ? 'setOn' : 'setOff',
    property: 'isOn',
    value: isOn,
    label: `${verb} ${d.name}`,
  }));
  const speech = targets.length === 1
    ? `${verb} ${targets[0].name}, senhor.`
    : `${verb} ${targets.length} dispositivos, senhor.`;
  return { speech, actions };
}

/** Velocidade/brilho: "ventilador no máximo", "luz a 70%" */
function matchBrightnessCommand(text: string, devices: UnifiedDevice[]): { speech: string; actions: DeviceAction[] } | null {
  const words = text.split(/\s+/);
  if (words.length > 14) return null;

  const pctMatch = extractPercentage(text);
  const hasSpeedWord =
    pctMatch !== null ||
    /velocidade|forca|brilho|intensidade/.test(text) ||
    SPEED_MAX.some((w) => words.includes(w)) ||
    SPEED_MIN.some((w) => words.includes(w)) ||
    SPEED_HIGH.some((w) => words.includes(w)) ||
    SPEED_LOW.some((w) => words.includes(w));

  if (!hasSpeedWord) return null;

  const brightnessDevices = devices.filter((d) => d.supportsBrightness);
  const targets = findTargetDevices(text, brightnessDevices.length > 0 ? brightnessDevices : devices)
    .filter((d) => d.supportsBrightness);
  if (targets.length === 0) return null;

  let value: number;
  let label: string;
  if (pctMatch !== null) {
    value = pctMatch;
    label = `${pctMatch}%`;
  } else if (SPEED_MAX.some((w) => words.includes(w))) {
    value = 100; label = 'máximo';
  } else if (SPEED_MIN.some((w) => words.includes(w))) {
    value = 10; label = 'mínimo';
  } else if (SPEED_HIGH.some((w) => words.includes(w))) {
    value = 80; label = 'mais forte';
  } else if (SPEED_LOW.some((w) => words.includes(w))) {
    value = 25; label = 'mais fraco';
  } else {
    value = 80; label = 'mais forte';
  }

  const actions = targets.map((d) => ({
    deviceId: d.id,
    action: 'setValue',
    property: 'brightness',
    value,
    label: `${d.name} em ${label}`,
  }));
  const speech = targets.length === 1
    ? `${targets[0].name} em ${label}, senhor.`
    : `${targets.length} dispositivos em ${label}, senhor.`;
  return { speech, actions };
}

/** Cor: "muda a luz pra azul", "deixa vermelho", "tom quente" */
function matchColorCommand(text: string, devices: UnifiedDevice[]): { speech: string; actions: DeviceAction[] } | null {
  const words = text.split(/\s+/);
  if (words.length > 14) return null;

  // Detecta cor exata
  let colorValue: string | null = null;
  let colorLabel = '';
  for (const [word, hex] of Object.entries(COLOR_MAP)) {
    if (words.includes(word)) {
      colorValue = hex;
      colorLabel = word;
      break;
    }
  }

  // Detecta temperatura de cor
  let tempValue: string | null = null;
  let tempLabel = '';
  if (!colorValue) {
    for (const [word, temp] of Object.entries(COLOR_TEMP_MAP)) {
      if (text.includes(word)) {
        tempValue = temp;
        tempLabel = word;
        break;
      }
    }
  }

  if (!colorValue && !tempValue) return null;

  // Precisa de verbo de mudança OU menção a dispositivo
  const hasVerb = /muda|coloca|deixa|bota|fica|pe|pos|fa[cç]|bota|vira|fica|mude|ponha/.test(text);
  const hasCategoryWord = Object.values(CATEGORY_SYNONYMS).flat().some((w) => text.includes(w));
  if (!hasVerb && !hasCategoryWord) return null;

  const isTemp = tempValue !== null;
  const candidateDevices = isTemp
    ? devices.filter((d) => d.supportsBrightness)
    : devices.filter((d) => d.supportsColor);

  const targets = findTargetDevices(text, candidateDevices.length > 0 ? candidateDevices : devices)
    .filter((d) => isTemp ? d.supportsBrightness : d.supportsColor);
  if (targets.length === 0) return null;

  const property = isTemp ? 'colorTemperature' : 'color';
  const value = isTemp ? tempValue! : colorValue!;
  const label = isTemp ? tempLabel : colorLabel;

  const actions = targets.map((d) => ({
    deviceId: d.id,
    action: 'setValue',
    property,
    value,
    label: `${d.name} em ${label}`,
  }));
  const speech = targets.length === 1
    ? `${targets[0].name} em ${label}, senhor.`
    : `${targets.length} luzes em ${label}, senhor.`;
  return { speech, actions };
}

/** Status: "o ventilador tá ligado?", "quantas luzes estão acesas?" */
function matchStatusQuery(text: string, devices: UnifiedDevice[]): string | null {
  const hasStatusQuestion =
    /\b(esta|está|ta|tá|encontra|tem|ficou|ficaram)\b/.test(text) &&
    /\b(ligad|desligad|on|off|acend|apagad|funcionand|aberta|fechad|ativad)\b/.test(text);

  const hasCountQuestion = /\b(quantas?|tem\s+algum|algum[a]?)\b/.test(text) &&
    /\b(luz|luzes|lampada|lampadas|dispositiv|ventilador|tomada)\b/.test(text);

  if (!hasStatusQuestion && !hasCountQuestion) return null;

  const targets = findTargetDevices(text, devices);
  const queryDevices = targets.length > 0 ? targets : devices;
  if (queryDevices.length === 0) return null;

  if (queryDevices.length === 1) {
    const d = queryDevices[0];
    const isFan = d.category === 'fans';
    const state = d.isOn
      ? (isFan ? 'ligado' : 'ligada')
      : (isFan ? 'desligado' : 'desligada');
    return `${d.name} está ${state}, senhor.`;
  }

  const onCount = queryDevices.filter((d) => d.isOn).length;
  const isFanCategory = queryDevices.every((d) => d.category === 'fans');
  const isLightCategory = queryDevices.every((d) => d.category === 'lights');
  const typeName = isFanCategory ? 'ventilador' : isLightCategory ? 'luz' : 'dispositivo';
  const typePlural = isFanCategory ? 'ventiladores' : isLightCategory ? 'luzes' : 'dispositivos';

  if (onCount === 0) return `Nenhum${isLightCategory ? 'a' : ''} ${typeName} ligad${isLightCategory ? 'a' : 'o'}, senhor.`;
  if (onCount === queryDevices.length) return `Tod${isLightCategory ? 'as' : 'os'} as ${typePlural} estão ligad${isLightCategory ? 'as' : 'os'}, senhor.`;
  return `${onCount} de ${queryDevices.length} ${typePlural} ligad${isLightCategory ? 'as' : 'os'}, senhor.`;
}

/** Agrupa todos os fast paths — retorna o primeiro match */
function matchFastCommand(rawInput: string, devices: UnifiedDevice[]): { speech: string; actions: DeviceAction[] } | null {
  const text = normalizeText(rawInput);
  if (!text) return null;

  return (
    matchBrightnessCommand(text, devices) ??
    matchColorCommand(text, devices) ??
    matchToggleCommand(text, devices) ??
    null
  );
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildHaSystemPrompt(
  userName: string | null,
  memoriesBlock: string,
  devices: UnifiedDevice[],
  hasHistory: boolean,
): string {
  const deviceLines = devices.length
    ? devices
        .map((d) => {
          let caps = '';
          if (d.supportsColor && d.supportsBrightness) caps = ' | cor+brilho';
          else if (d.supportsColor) caps = ' | cor';
          else if (d.supportsBrightness) caps = ' | brilho/velocidade';
          return `- [${d.id}] ${d.name} (${d.category}) — ${d.isOn ? 'LIGADO' : 'desligado'}${caps}`;
        })
        .join('\n')
    : 'Nenhum dispositivo conectado.';

  return [
    `Você é Argos, assistente de automação residencial${userName ? ` de ${userName}` : ''}.`,
    'Confiante, direto, com uma pitada de humor — nunca robótico. Chama o usuário de "senhor" ocasionalmente.',
    '',
    hasHistory
      ? '## Contexto da conversa\nVocê tem acesso ao histórico desta sessão de voz. Use-o para entender referências como "ela", "aquela luz", "o mesmo" sem pedir confirmação.'
      : '',
    hasHistory ? '' : '',
    '## O que você sabe sobre o usuário',
    memoriesBlock,
    '',
    `## Dispositivos disponíveis (${devices.length})`,
    deviceLines,
    '',
    '## Regras de resposta',
    '- Esta mensagem vem de um satélite de voz via Home Assistant — responda conversando, sem markdown.',
    '- Suas respostas são lidas em voz alta: frases curtas, máx. 2 frases para comandos simples.',
    '- Responda SEMPRE em português brasileiro.',
    '- Se o usuário se referir a "ele", "ela", "aquele" sem especificar, use o contexto da conversa para resolver.',
    '',
    '## Controle de dispositivos',
    'Para controlar dispositivo da lista: responda SOMENTE em JSON válido, sem texto fora:',
    '{"type":"device_control","speech":"frase pra falar","actions":[{"deviceId":"ID_EXATO","action":"setOn|setOff|setValue","property":"isOn|brightness|color|colorTemperature","value":true,"label":"descrição"}]}',
    '',
    'Valores possíveis por property:',
    '- isOn → true ou false',
    '- brightness → 0–100 (intensidade/velocidade em %)',
    '- color → hex "#RRGGBB" — só dispositivos com "cor" na lista',
    '- colorTemperature → "warm" | "neutral" | "cool" — só dispositivos com "brilho" na lista',
    '',
    'Cores de referência: vermelho=#FF0000, verde=#00CC44, azul=#0055FF, amarelo=#FFD700,',
    'laranja=#FF8800, roxo=#8800FF, rosa=#FF69B4, ciano=#00CED1, branco=#FFFFFF.',
    '',
    'Para qualquer outro pedido (perguntas, clima, conversa):',
    '{"type":"chat","speech":"sua resposta"}',
    '',
    'NUNCA confirme ação que não foi executada. Se o dispositivo pedido não existir na lista, diga isso.',
    'Pedidos mistos (dispositivo + computador/app): execute só o que for dispositivo físico.',
    'Sua resposta INTEIRA deve ser sempre um único JSON válido.',
  ].filter((l) => l !== undefined).join('\n');
}

// ── Parser de resposta ────────────────────────────────────────────────────────

function parseHaResponse(raw: string): HaParsedResponse {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { type: 'chat', speech: raw };
  try {
    return JSON.parse(match[0]) as HaParsedResponse;
  } catch {
    return { type: 'chat', speech: raw };
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action as string | undefined;

  // ── Gerenciamento de chave ────────────────────────────────────────────────
  if (action === 'generate-key' || action === 'get-key' || action === 'delete-key') {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const token = authHeader.slice(7);
    const sb = supabaseAsUser(token);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    if (action === 'generate-key') {
      const apiKey = generateApiKey();
      const { error } = await supabaseAdmin
        .from('ha_keys')
        .upsert({ user_id: user.id, api_key: apiKey, created_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ api_key: apiKey });
    }

    if (action === 'get-key') {
      const { data, error } = await supabaseAdmin
        .from('ha_keys')
        .select('api_key, created_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'no_key' });
      return res.status(200).json({ api_key: data.api_key, created_at: data.created_at });
    }

    if (action === 'delete-key') {
      await supabaseAdmin.from('ha_keys').delete().eq('user_id', user.id);
      return res.status(200).json({ ok: true });
    }
  }

  // ── GET /api/ha?action=wiz-devices — lista MAC+nome dos dispositivos WiZ ──
  // Usado pelo Jarvis PC para mapear IPs locais (scan de subnet) a nomes.
  if (action === 'wiz-devices' && req.method === 'GET') {
    const haKey = req.headers['x-ha-key'] as string | undefined;
    if (!haKey) return res.status(401).json({ error: 'Missing x-ha-key header' });

    const { data: keyData } = await supabaseAdmin
      .from('ha_keys')
      .select('user_id')
      .eq('api_key', haKey)
      .maybeSingle();
    if (!keyData) return res.status(401).json({ error: 'Invalid API key' });

    const { data: wizRow } = await supabaseAdmin
      .from('wiz_accounts')
      .select('access_token, home_id')
      .eq('user_id', keyData.user_id as string)
      .maybeSingle();

    if (!wizRow) return res.json({ devices: [] });
    const row = wizRow as { access_token: string; home_id: string | null };
    const lights = await wizListDevices(row.access_token, row.home_id ?? '');
    const devices = lights.map((l) => ({ mac: l.mac.toLowerCase(), name: l.name.trim() }));
    return res.json({ devices });
  }

  // ── Endpoint de conversa ──────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const haKey = (req.headers['x-ha-key'] as string | undefined)
    ?? req.headers.authorization?.replace('Bearer ', '');

  if (!haKey) {
    return res.status(401).json({ error: 'Missing x-ha-key header or Authorization: Bearer <key>' });
  }

  const { data: keyData } = await supabaseAdmin
    .from('ha_keys')
    .select('user_id')
    .eq('api_key', haKey)
    .maybeSingle();

  if (!keyData) return res.status(401).json({ error: 'Invalid API key' });

  const userId = keyData.user_id as string;
  const { message, session_id } = req.body as { message?: string; session_id?: string };
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

  // ── Carrega dados: usa cache de dispositivos quando disponível ───────────
  const cachedEntry = getCachedDevices(userId);
  const [memoriesRes, profileRes, devicesResult] = await Promise.all([
    supabaseAdmin
      .from('memories')
      .select('content, category, title, confidence, source, tags, status, created_at, last_confirmed')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30),
    supabaseAdmin.from('profiles').select('name').eq('id', userId).maybeSingle(),
    cachedEntry ? Promise.resolve(cachedEntry) : loadDevices(userId),
  ]);

  const { devices, ctx } = devicesResult as { devices: UnifiedDevice[]; ctx: ExecutionContext };

  // Armazena no cache se veio de carga fresca
  if (!cachedEntry) {
    setCachedDevices(userId, devices, ctx);
  }

  const memories = memoriesRes.data ?? [];
  const userName = (profileRes.data as { name?: string } | null)?.name ?? null;
  const trimmedMessage = message.trim();

  // ── Fast path: consulta de status (sem IA) ───────────────────────────────
  const statusReply = matchStatusQuery(normalizeText(trimmedMessage), devices);
  if (statusReply) {
    return res.status(200).json({ reply: statusReply, session_id });
  }

  // ── Fast path: comandos óbvios de controle (sem IA) ──────────────────────
  const fastMatch = matchFastCommand(trimmedMessage, devices);
  if (fastMatch) {
    const failed: string[] = [];
    for (const act of fastMatch.actions) {
      try {
        await executeAction(act, ctx);
      } catch (err) {
        console.error('[ha] falha na ação rápida', act, err);
        failed.push(act.label);
      }
    }

    if (failed.length > 0) {
      const reply = failed.length === fastMatch.actions.length
        ? `Tentei, mas deu problema com ${failed.join(' e ')}, senhor.`
        : `Só consegui parte — problema com ${failed.join(' e ')}, senhor.`;
      return res.status(200).json({ reply, session_id });
    }

    // Após ação bem-sucedida, invalida o cache de dispositivos para reflectir o novo estado.
    invalidateDeviceCache(userId);
    updateSession(session_id, trimmedMessage, fastMatch.speech);
    return res.status(200).json({ reply: fastMatch.speech, session_id });
  }

  // ── Claude com histórico de sessão ───────────────────────────────────────
  const memoryContext = selectMemoryContext(
    memories.map((memory) => ({
      content: String(memory.content ?? ''),
      category: memory.category,
      title: memory.title,
      confidence: memory.confidence,
      source: memory.source,
      tags: memory.tags,
      status: memory.status,
      createdAt: memory.created_at ? new Date(memory.created_at) : undefined,
      lastConfirmed: memory.last_confirmed ? new Date(memory.last_confirmed) : undefined,
      isActive: true,
    })),
    trimmedMessage
  );
  if (memoryContext.beforeChars !== memoryContext.afterChars) {
    console.log(
      `[ha-memory] prompt: ${memoryContext.activeCount}/${memoryContext.beforeChars} chars -> ` +
      `${memoryContext.selectedCount}/${memoryContext.afterChars} chars`
    );
  }
  const memoriesBlock = memoryContext.text || 'Nenhuma memória relevante registrada.';

  const history = getSessionHistory(session_id);
  const hasHistory = history.length > 0;
  const systemPrompt = buildHaSystemPrompt(userName, memoriesBlock, devices, hasHistory);

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: trimmedMessage },
  ];

  try {
    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const rawText = aiResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    const parsed = parseHaResponse(rawText);

    if (parsed.type === 'device_control' && parsed.actions?.length) {
      const failed: string[] = [];
      for (const act of parsed.actions) {
        try {
          await executeAction(act, ctx);
        } catch (err) {
          console.error('[ha] falha ao executar ação', act, err);
          failed.push(act.label || act.deviceId);
        }
      }

      if (failed.length > 0) {
        const reply = failed.length === parsed.actions.length
          ? `Não consegui, senhor. Tive um problema com ${failed.join(' e ')}.`
          : `Só consegui parte, senhor. Tive um problema com ${failed.join(' e ')}.`;
        return res.status(200).json({ reply, session_id });
      }

      invalidateDeviceCache(userId);
    }

    const reply = parsed.speech || rawText;
    updateSession(session_id, trimmedMessage, rawText);
    return res.status(200).json({ reply, session_id });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return res.status(e.status ?? 500).json({ error: 'ai_error', message: e.message ?? 'Erro desconhecido' });
  }
}
