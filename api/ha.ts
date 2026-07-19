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
 * outros integrações (_lib/hue, _lib/ewelink, _lib/xiaomi).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { hueRequest, mapHueLights, hexToXy, tempNameToMirek, refreshHueToken, createHueAppKey, type HueLight } from './_lib/hue';
import { getValidAccessToken as getValidEwelinkToken, ewelinkRequest } from './_lib/ewelink';
import { xiaomiListFans, xiaomiSetProperty, type XiaomiSession, type XiaomiDeviceDto } from './_lib/xiaomi';
import { getProjectCredentials, tuyaListDevices, tuyaControl, hexToTuyaHsv, tempNameToTuya, type TuyaCredentials } from './_lib/tuya';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
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

// ── Dispositivo unificado (id prefixado por fonte: "hue:xxx", "ewelink:xxx", "xiaomi:xxx") ──

interface UnifiedDevice {
  id: string;
  name: string;
  category: string;
  isOn: boolean;
  supportsColor?: boolean;
  supportsBrightness?: boolean;
  source: 'hue' | 'ewelink' | 'xiaomi' | 'tuya';
}

interface ExecutionContext {
  hueLights: Map<string, HueLight>;
  hueCreds?: { accessToken: string; appKey: string | null };
  ewelinkDevices: Map<string, { deviceid: string; switches?: Array<{ switch: string; outlet: number }> }>;
  ewelinkToken?: { accessToken: string; region: string };
  xiaomiDevices: Map<string, XiaomiDeviceDto>;
  xiaomiSession?: { session: XiaomiSession; region: string };
  tuyaCreds?: TuyaCredentials;
}

/** Busca dispositivos reais de todas as integrações conectadas do usuário, direto do servidor (sem token de sessão do usuário — usa service role). */
async function loadDevices(userId: string): Promise<{ devices: UnifiedDevice[]; ctx: ExecutionContext }> {
  const devices: UnifiedDevice[] = [];
  const ctx: ExecutionContext = {
    hueLights: new Map(),
    ewelinkDevices: new Map(),
    xiaomiDevices: new Map(),
  };

  // ── Hue ──────────────────────────────────────────────────────────────────
  try {
    const { data: hueRow } = await supabaseAdmin
      .from('hue_accounts')
      .select('access_token, refresh_token, at_expires_at, hue_app_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (hueRow) {
      const row = hueRow as {
        access_token: string;
        refresh_token: string;
        at_expires_at: string;
        hue_app_key: string | null;
      };

      let accessToken = row.access_token;
      let appKey = row.hue_app_key;
      const expiresAt = new Date(row.at_expires_at).getTime();

      if (expiresAt - Date.now() < 5 * 60 * 1000) {
        const tokens = await refreshHueToken(row.refresh_token);
        accessToken = tokens.access_token;
        await supabaseAdmin
          .from('hue_accounts')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            at_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }

      if (!appKey) {
        try {
          appKey = await createHueAppKey(accessToken);
          await supabaseAdmin.from('hue_accounts').update({ hue_app_key: appKey }).eq('user_id', userId);
        } catch {
          // Sem link button pressionado recentemente — segue sem app key (Hue vai falhar abaixo)
        }
      }

      ctx.hueCreds = { accessToken, appKey };

      const raw = await hueRequest('/resource/light', { accessToken, appKey: appKey ?? undefined });
      const lights = mapHueLights(raw);
      for (const light of lights) {
        ctx.hueLights.set(light.id, light);
        devices.push({
          id: `hue:${light.id}`,
          name: light.name.trim(),
          category: 'lights',
          isOn: light.isOn,
          supportsColor: light.supportsColor,
          supportsBrightness: true,
          source: 'hue',
        });
      }
    }
  } catch (err) {
    console.error('[ha] falha ao carregar dispositivos Hue', err);
  }

  // ── eWeLink ──────────────────────────────────────────────────────────────
  try {
    const tokenInfo = await getValidEwelinkToken(supabaseAdmin as ReturnType<typeof supabaseAsUser>, userId);
    if (tokenInfo) {
      ctx.ewelinkToken = tokenInfo;
      const result = await ewelinkRequest(tokenInfo.region, '/v2/device/thing?num=0', {
        accessToken: tokenInfo.accessToken,
      });
      if (result.error === 0) {
        const thingList =
          (result.data.thingList as Array<{ itemType: number; itemData: Record<string, unknown> }>) ?? [];
        for (const t of thingList) {
          if (t.itemType !== 1 && t.itemType !== 2) continue;
          const d = t.itemData;
          const params = (d.params as Record<string, unknown>) ?? {};
          const switches = params.switches as Array<{ switch: string; outlet: number }> | undefined;
          const isOn = switches?.length ? switches.some((s) => s.switch === 'on') : params.switch === 'on';
          const deviceid = d.deviceid as string;
          ctx.ewelinkDevices.set(deviceid, { deviceid, switches });
          devices.push({
            id: `ewelink:${deviceid}`,
            name: (d.name as string).trim(),
            category: 'outlets',
            isOn,
            source: 'ewelink',
          });
        }
      }
    }
  } catch (err) {
    console.error('[ha] falha ao carregar dispositivos eWeLink', err);
  }

  // ── Xiaomi (ventiladores) ────────────────────────────────────────────────
  try {
    const { data: xiaomiRow } = await supabaseAdmin
      .from('xiaomi_accounts')
      .select('region, ssecurity, mi_user_id, c_user_id, service_token, pass_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (xiaomiRow) {
      const row = xiaomiRow as {
        region: string;
        ssecurity: string;
        mi_user_id: string;
        c_user_id: string;
        service_token: string;
        pass_token: string;
      };
      const session: XiaomiSession = {
        ssecurity: row.ssecurity,
        userId: row.mi_user_id,
        cUserId: row.c_user_id,
        serviceToken: row.service_token,
        passToken: row.pass_token,
      };
      ctx.xiaomiSession = { session, region: row.region };

      const { devices: fans } = await xiaomiListFans(session, row.region);
      for (const fan of fans) {
        ctx.xiaomiDevices.set(fan.did, fan);
        devices.push({
          id: `xiaomi:${fan.did}`,
          name: fan.name.trim(),
          category: 'fans',
          isOn: fan.isOn,
          supportsBrightness: !!fan.speed,
          source: 'xiaomi',
        });
      }
    }
  } catch (err) {
    console.error('[ha] falha ao carregar dispositivos Xiaomi', err);
  }

  // ── Tuya / Smart Life (credenciais de projeto, não por usuário) ───────────
  try {
    const creds = await getProjectCredentials();
    ctx.tuyaCreds = creds;
    const lights = await tuyaListDevices(creds.uid, creds.accessToken, creds.region);
    for (const light of lights) {
      devices.push({
        id: `tuya:${light.id}`,
        name: light.name,
        category: 'lights',
        isOn: light.isOn,
        supportsColor: light.supportsColor,
        supportsBrightness: light.supportsBrightness,
        source: 'tuya',
      });
    }
  } catch (err) {
    console.error('[ha] falha ao carregar dispositivos Tuya', err);
  }

  return { devices, ctx };
}

interface DeviceAction {
  deviceId: string;
  action: string;
  property: string;
  value: unknown;
  label: string;
}

async function executeAction(action: DeviceAction, ctx: ExecutionContext): Promise<void> {
  const [source, ...rest] = action.deviceId.split(':');
  const rawId = rest.join(':');

  if (source === 'hue' && ctx.hueCreds) {
    const body: Record<string, unknown> = {};
    if (action.property === 'isOn') {
      body.on = { on: Boolean(action.value) };
    } else if (action.property === 'brightness') {
      const bri = Math.max(1, Math.min(100, Number(action.value)));
      body.dimming = { brightness: bri };
      body.on = { on: true };
    } else if (action.property === 'color') {
      const xy = hexToXy(String(action.value));
      if (!xy) throw new Error(`Cor inválida: ${action.value}`);
      body.color = { xy };
      body.on = { on: true };
    } else if (action.property === 'colorTemperature') {
      const mirek = tempNameToMirek(action.value as string | number);
      if (!mirek) throw new Error(`Temperatura inválida: ${action.value}`);
      body.color_temperature = { mirek };
      body.on = { on: true };
    }
    await hueRequest(`/resource/light/${rawId}`, {
      method: 'PUT',
      body,
      accessToken: ctx.hueCreds.accessToken,
      appKey: ctx.hueCreds.appKey ?? undefined,
    });
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

// ── Atalho de comandos rápidos (sem passar pelo Claude) ──────────────────────
//
// Reconhece frases óbvias de ligar/desligar/velocidade e executa direto,
// cortando a "pensada" da IA pra esses casos. Baseado no mesmo vocabulário
// usado no app (services/ai/fastIntent.ts), adaptado pra rodar aqui sem
// depender de tipos/estado do client.

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

const ON_WORDS = ['liga', 'ligar', 'acende', 'acender', 'ativa', 'ativar', 'ligado'];
const OFF_WORDS = ['desliga', 'desligar', 'apaga', 'apagar', 'desativa', 'desativar', 'desligado', 'para', 'parar'];

const SPEED_MAX = ['maximo', 'maxima', 'total', 'tudo', 'cem', '100'];
const SPEED_MIN = ['minimo', 'minima', 'quase', 'pouco', 'fraco', 'fraca'];
const SPEED_HIGH = ['forte', 'forca', 'mais', 'aumenta', 'aumentar', 'sobe', 'subir', 'rapido', 'rapida'];
const SPEED_LOW = ['menos', 'diminui', 'diminuir', 'desce', 'descer', 'devagar', 'lento', 'lenta'];

// Sinônimos de categoria — cobre o caso comum de o usuário falar o tipo
// genérico do dispositivo ("ventilador") em vez do nome de marca ("Mi Smart
// Standing Fan 2").
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  fans: ['ventilador', 'ventiladores', 'vento'],
  lights: ['luz', 'luzes', 'lampada', 'lampadas'],
  outlets: ['tomada', 'tomadas'],
};

function extractPercentage(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%|(\d{1,3})\s*por\s*cento/);
  const raw = m ? (m[1] ?? m[2]) : null;
  if (!raw) return null;
  return Math.max(0, Math.min(100, parseInt(raw, 10)));
}

// Palavras muito genéricas que não ajudam a identificar um dispositivo específico
// (nomes de marca/modelo costumam ter isso, e a fala raramente reproduz o nome
// inteiro perfeitamente — então também casamos por palavra-chave isolada).
const NAME_STOPWORDS = new Set(['de', 'da', 'do', 'a', 'o', 'e', 'smart', 'mi', 'the']);

function nameKeywords(name: string): string[] {
  return normalizeText(name)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NAME_STOPWORDS.has(w));
}

function findTargetDevices(text: string, devices: UnifiedDevice[]): UnifiedDevice[] {
  // Nome exato (substring completa) tem prioridade absoluta.
  const byFullName = devices.filter((d) => text.includes(normalizeText(d.name)));
  if (byFullName.length > 0) return byFullName;

  // Categoria genérica ("ventilador", "luz", "tomada") — mais robusto a
  // transcrição imperfeita de nomes de marca em inglês.
  const byCategory = devices.filter((d) => {
    const synonyms = CATEGORY_SYNONYMS[d.category] ?? [];
    return synonyms.some((w) => text.includes(w));
  });
  if (byCategory.length === 1) return byCategory;
  if (byCategory.length > 1) {
    // Mais de um dispositivo na mesma categoria — tenta desambiguar por palavra-chave do nome.
    const narrowed = byCategory.filter((d) => nameKeywords(d.name).some((kw) => text.includes(kw)));
    return narrowed.length > 0 ? narrowed : byCategory;
  }

  // Última tentativa: qualquer palavra-chave do nome de qualquer dispositivo.
  return devices.filter((d) => nameKeywords(d.name).some((kw) => text.includes(kw)));
}

function matchFastCommand(rawInput: string, devices: UnifiedDevice[]): { speech: string; actions: DeviceAction[] } | null {
  const text = normalizeText(rawInput);
  if (!text) return null;
  const words = text.split(/\s+/);
  if (words.length > 12) return null; // frases longas tendem a ter contexto — deixa o Claude interpretar

  // ── Velocidade/brilho (só dispositivos com supportsBrightness) ────────────
  const pctMatch = extractPercentage(text);
  if (
    pctMatch !== null ||
    /velocidade|forca|forte/.test(text) ||
    SPEED_MAX.some((w) => words.includes(w)) ||
    SPEED_MIN.some((w) => words.includes(w))
  ) {
    const targets = findTargetDevices(text, devices).filter((d) => d.supportsBrightness);
    if (targets.length > 0) {
      const pct = pctMatch;
      let value: number;
      let label: string;
      if (pct !== null) {
        value = pct;
        label = `${pct}%`;
      } else if (SPEED_MAX.some((w) => words.includes(w))) {
        value = 100;
        label = 'máximo';
      } else if (SPEED_MIN.some((w) => words.includes(w))) {
        value = 10;
        label = 'mínimo';
      } else if (SPEED_HIGH.some((w) => words.includes(w))) {
        value = 80;
        label = 'mais forte';
      } else if (SPEED_LOW.some((w) => words.includes(w))) {
        value = 25;
        label = 'mais fraco';
      } else {
        value = 80;
        label = 'mais forte';
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
        : `Ajustando ${targets.length} dispositivos para ${label}, senhor.`;
      return { speech, actions };
    }
  }

  // ── Ligar/desligar ─────────────────────────────────────────────────────────
  let isOn: boolean | null = null;
  if (ON_WORDS.some((w) => words.includes(w))) isOn = true;
  else if (OFF_WORDS.some((w) => words.includes(w))) isOn = false;
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

function buildHaSystemPrompt(userName: string | null, memoriesBlock: string, devices: UnifiedDevice[]): string {
  const deviceLines = devices.length
    ? devices
        .map((d) => `- ${d.name} (${d.category}) | ${d.isOn ? 'Ligado' : 'Desligado'} | ID: ${d.id}`)
        .join('\n')
    : 'Nenhum dispositivo conectado.';

  return [
    `Você é Argos, um assistente de automação residencial pessoal e inteligente${userName ? ` de ${userName}` : ''}.`,
    'Confiante, direto, com uma pitada de humor — nunca robótico ou genérico. Chama o usuário de "senhor" ocasionalmente, como o Jarvis do Homem de Ferro.',
    '',
    '## O que você sabe sobre o usuário',
    memoriesBlock,
    '',
    `## Dispositivos disponíveis (${devices.length})`,
    deviceLines,
    '',
    '## Instruções importantes',
    '- Esta mensagem vem de um satélite de voz conectado via Home Assistant — responda como se estivesse conversando.',
    '- Suas respostas serão lidas em voz alta. Use frases curtas e naturais, sem markdown, listas ou asteriscos.',
    '- Responda sempre em português brasileiro.',
    '- Seja direto: no máximo 2 frases para comandos simples.',
    '',
    '## Controle de dispositivos',
    'Quando o usuário pedir para controlar um dispositivo da lista acima, responda SOMENTE em JSON (nada de texto fora do JSON):',
    '{"type":"device_control","speech":"frase curta a falar","actions":[{"deviceId":"<ID exato da lista>","action":"setOn|setOff|setValue","property":"isOn|brightness|color|colorTemperature","value":true,"label":"..."}]}',
    'Propriedades: isOn (true/false), brightness (0-100, só Hue/Xiaomi), color (hex "#RRGGBB", só luzes Hue com supportsColor), colorTemperature ("warm"|"neutral"|"cool", só Hue).',
    'Cores comuns: vermelho=#FF0000, verde=#00CC44, azul=#0055FF, amarelo=#FFD700, laranja=#FF8800, roxo=#8800FF, rosa=#FF69B4, ciano=#00CED1, branco=#FFFFFF.',
    'Se o dispositivo pedido não estiver na lista, ou o pedido não for controle de dispositivo, responda em JSON assim:',
    '{"type":"chat","speech":"sua resposta"}',
    'NUNCA confirme uma ação que não está na lista de dispositivos. Se não achar o dispositivo, diga isso claramente.',
    'IMPORTANTE: sua resposta inteira deve ser um único JSON válido, nada antes ou depois.',
  ].join('\n');
}

interface HaParsedResponse {
  type: 'device_control' | 'chat';
  speech?: string;
  actions?: DeviceAction[];
}

function parseHaResponse(raw: string): HaParsedResponse {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { type: 'chat', speech: raw };
  try {
    return JSON.parse(match[0]) as HaParsedResponse;
  } catch {
    return { type: 'chat', speech: raw };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action as string | undefined;

  // ── Gerenciamento de chave (requer Bearer token do Supabase) ─────────────
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

  // ── Endpoint de conversa (requer x-ha-key) ────────────────────────────────
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

  const [memoriesRes, profileRes, { devices, ctx }] = await Promise.all([
    supabaseAdmin
      .from('memories')
      .select('content')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30),
    supabaseAdmin.from('profiles').select('name').eq('id', userId).maybeSingle(),
    loadDevices(userId),
  ]);

  const memories = memoriesRes.data ?? [];
  const userName = (profileRes.data as { name?: string } | null)?.name ?? null;

  // ── Atalho rápido: comandos óbvios de ligar/desligar/velocidade não passam pelo Claude ──
  const fastMatch = matchFastCommand(message, devices);
  if (fastMatch) {
    for (const act of fastMatch.actions) {
      try {
        await executeAction(act, ctx);
      } catch (err) {
        console.error('[ha] falha ao executar ação (atalho rápido)', act, err);
        return res.status(200).json({
          reply: `Tentei, mas deu problema ao falar com ${act.label.split(' ').slice(1).join(' ').trim()}, senhor.`,
          session_id,
        });
      }
    }
    return res.status(200).json({ reply: fastMatch.speech, session_id });
  }

  const memoriesBlock = memories.length > 0
    ? memories.map((m) => `- ${(m as { content: string }).content}`).join('\n')
    : 'Nenhuma memória registrada.';

  const systemPrompt = buildHaSystemPrompt(userName, memoriesBlock, devices);

  try {
    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: message.trim() }],
    });

    const rawText = aiResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    const parsed = parseHaResponse(rawText);

    if (parsed.type === 'device_control' && parsed.actions?.length) {
      for (const act of parsed.actions) {
        try {
          await executeAction(act, ctx);
        } catch (err) {
          console.error('[ha] falha ao executar ação', act, err);
        }
      }
    }

    const reply = parsed.speech || rawText;
    return res.status(200).json({ reply, session_id });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return res.status(e.status ?? 500).json({ error: 'ai_error', message: e.message ?? 'Erro desconhecido' });
  }
}
