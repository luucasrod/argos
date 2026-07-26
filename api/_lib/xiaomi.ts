/**
 * Xiaomi Mi Home / MIoT cloud client — API não-oficial (a Xiaomi não publica
 * uma API pública), documentada pela comunidade a partir de engenharia
 * reversa do app Mi Home (o mesmo método usado por integrações conhecidas
 * como a do Home Assistant). Login é feito com e-mail/senha da conta Mi,
 * igual ao fluxo já usado aqui para Tapo/Tuya/eWeLink.
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';

export function supabaseAsUser(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export class XiaomiVerificationRequiredError extends Error {
  verificationUrl: string;
  constructor(url: string) {
    super('A Xiaomi pediu uma verificação extra de identidade pra este login.');
    this.verificationUrl = url;
  }
}

export async function getUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const sb = supabaseAsUser(token);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  return { user, token };
}

const UA = 'APP/com.xiaomi.mihome APPV/6.6.7 iosPassportSDK/3.9.0 iOS/14.4';
const LOCALE = 'en_US';

// Servidores regionais da Xiaomi — testa todos até achar um com dispositivos.
const REGIONS = ['i2', 'de', 'us', 'ru', 'tw', 'sg', 'in', 'cn'];

// ─── RC4 (implementação própria — evita depender de RC4 no OpenSSL do runtime) ──

function rc4WithDrop1024(key: Buffer, data: Buffer): Buffer {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    const tmp = S[i]; S[i] = S[j]; S[j] = tmp;
  }
  let i = 0;
  j = 0;
  // descarta os primeiros 1024 bytes do keystream (variante usada pela Xiaomi)
  for (let k = 0; k < 1024; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i]; S[i] = S[j]; S[j] = tmp;
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i]; S[i] = S[j]; S[j] = tmp;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

// ─── Cookies (fetch não tem cookie jar embutido) ────────────────────────────

class CookieJar {
  private cookies: Record<string, string> = {};
  setOne(name: string, value: string) {
    this.cookies[name] = value;
  }
  absorb(res: { headers: { get(name: string): string | null } }) {
    const h = res.headers as unknown as { getSetCookie?: () => string[] };
    const raw = typeof h.getSetCookie === 'function' ? h.getSetCookie() : ((res.headers.get('set-cookie') && [res.headers.get('set-cookie') as string]) || []);
    for (const sc of raw) {
      const pair = sc.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  get(name: string): string | undefined {
    return this.cookies[name];
  }
  header(): string {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function parseXiaomiJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^&&&START&&&/, '');
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Login (conta.xiaomi.com — 3 passos) ────────────────────────────────────

export interface XiaomiSession {
  ssecurity: string;
  userId: string;
  cUserId: string;
  serviceToken: string;
  passToken: string;
}

export async function xiaomiLogin(username: string, password: string): Promise<XiaomiSession> {
  const jar = new CookieJar();
  jar.setOne('userId', username);
  // deviceId estável por conta — se for aleatório a cada tentativa, a Xiaomi
  // trata toda tentativa como um aparelho novo e nunca reconhece uma
  // verificação de identidade já confirmada anteriormente.
  const stableDeviceId = crypto.createHash('md5').update(`argos:${username}`).digest('hex').slice(0, 16);
  jar.setOne('deviceId', stableDeviceId);

  let res = await fetch('https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true', {
    headers: { 'User-Agent': UA, Cookie: jar.header() },
  });
  jar.absorb(res);
  const step1 = parseXiaomiJson(await res.text());
  const sign = step1?.['_sign'];
  if (typeof sign !== 'string') {
    throw new Error('Não foi possível iniciar o login na Xiaomi. Tenta novamente mais tarde.');
  }

  const step2Params = new URLSearchParams({
    sid: 'xiaomiio',
    hash: crypto.createHash('md5').update(password).digest('hex').toUpperCase(),
    callback: 'https://sts.api.io.mi.com/sts',
    qs: '?sid=xiaomiio&_json=true',
    user: username,
    _sign: sign,
    _json: 'true',
  });
  res = await fetch(`https://account.xiaomi.com/pass/serviceLoginAuth2?${step2Params.toString()}`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Cookie: jar.header(), 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  jar.absorb(res);
  const step2 = parseXiaomiJson(await res.text());
  if (!step2 || step2['code'] !== 0 || typeof step2['ssecurity'] !== 'string' || !step2['location']) {
    console.error('[xiaomi] login step2 raw response:', JSON.stringify(step2));
    const notificationUrl = step2?.['notificationUrl'];
    if (typeof notificationUrl === 'string') {
      const absoluteUrl = notificationUrl.startsWith('http')
        ? notificationUrl
        : `https://account.xiaomi.com${notificationUrl}`;
      throw new XiaomiVerificationRequiredError(absoluteUrl);
    }
    if (step2?.['code'] === 70016 || typeof step2?.['captchaUrl'] === 'string') {
      throw new Error(
        'A Xiaomi pediu um captcha pra este login — não dá pra automatizar isso. Tenta novamente daqui a pouco.'
      );
    }
    throw new Error(
      `Login na Xiaomi falhou (código ${step2?.['code'] ?? 'desconhecido'}). Verifica o e-mail e a senha da conta Mi Home. Se a verificação em duas etapas estiver ativa, desativa temporariamente para conectar o Argos.`
    );
  }

  res = await fetch(step2['location'] as string, { headers: { 'User-Agent': UA, Cookie: jar.header() } });
  jar.absorb(res);
  const serviceToken = jar.get('serviceToken');
  if (!serviceToken) throw new Error('Falha ao obter o token de sessão da Xiaomi.');

  return {
    ssecurity: step2['ssecurity'] as string,
    userId: String(step2['userId']),
    cUserId: String(step2['cUserId']),
    serviceToken,
    passToken: String(step2['passToken']),
  };
}

// ─── Chamadas assinadas à API cloud (miot / home) ───────────────────────────

function apiUrl(region: string, path: string): string {
  const host = region === 'cn' ? 'api.io.mi.com' : `${region}.api.io.mi.com`;
  return `https://${host}/app${path}`;
}

function generateNonce(): { nonceB64: string } {
  const millis = Date.now();
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(Math.floor(millis / 60000) >>> 0);
  const buf = Buffer.concat([crypto.randomBytes(8), tail]);
  return { nonceB64: buf.toString('base64') };
}

function signedNonceB64(ssecurity: string, nonceB64: string): string {
  return crypto
    .createHash('sha256')
    .update(Buffer.concat([Buffer.from(ssecurity, 'base64'), Buffer.from(nonceB64, 'base64')]))
    .digest('base64');
}

function generateEncSignature(url: string, method: string, signedNonce: string, params: Record<string, string>): string {
  const path = url.split('.com')[1]?.replace('/app/', '/') ?? url;
  const parts = [method.toUpperCase(), path];
  for (const [k, v] of Object.entries(params)) parts.push(`${k}=${v}`);
  parts.push(signedNonce);
  return crypto.createHash('sha1').update(parts.join('&'), 'utf8').digest('base64');
}

function generateEncParams(
  url: string,
  method: string,
  signedNonce: string,
  nonceB64: string,
  params: Record<string, string>,
  ssecurity: string
): Record<string, string> {
  const working: Record<string, string> = { ...params };
  working['rc4_hash__'] = generateEncSignature(url, method, signedNonce, working);

  const rc4Key = Buffer.from(signedNonce, 'base64');
  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(working)) {
    encrypted[k] = rc4WithDrop1024(rc4Key, Buffer.from(v, 'utf8')).toString('base64');
  }

  encrypted['signature'] = generateEncSignature(url, method, signedNonce, encrypted);
  encrypted['ssecurity'] = ssecurity;
  encrypted['_nonce'] = nonceB64;
  return encrypted;
}

async function xiaomiApiCall<T = Record<string, unknown>>(
  session: XiaomiSession,
  region: string,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = apiUrl(region, path);
  const { nonceB64 } = generateNonce();
  const nonce = signedNonceB64(session.ssecurity, nonceB64);
  const encParams = generateEncParams(url, 'POST', nonce, nonceB64, params, session.ssecurity);
  const qs = new URLSearchParams(encParams).toString();

  const cookie = `userId=${session.userId}; serviceToken=${session.serviceToken}; locale=${LOCALE}`;
  const res = await fetch(`${url}?${qs}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'MIOT-ENCRYPT-ALGORITHM': 'ENCRYPT-RC4',
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
    },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[xiaomi] ${path} HTTP ${res.status} — url=${url} body=${errBody.slice(0, 500)}`);
    throw new Error(`Xiaomi: erro HTTP ${res.status}`);
  }

  const bodyB64 = await res.text();
  const rc4Key = Buffer.from(nonce, 'base64');
  const decrypted = rc4WithDrop1024(rc4Key, Buffer.from(bodyB64, 'base64')).toString('utf8');
  return JSON.parse(decrypted) as T;
}

// ─── Dispositivos ────────────────────────────────────────────────────────────

interface RawXiaomiDevice {
  did: string;
  token: string;
  name: string;
  model: string;
  localip?: string;
  isOnline?: boolean;
}

async function fetchDeviceList(session: XiaomiSession, region: string): Promise<RawXiaomiDevice[]> {
  const result = await xiaomiApiCall<{ result?: { list?: RawXiaomiDevice[] } }>(
    session,
    region,
    '/home/device_list',
    { data: JSON.stringify({ getVirtualModel: false, getHuamiDevices: 0 }) }
  );
  return result?.result?.list ?? [];
}

async function findRegionAndDevices(session: XiaomiSession): Promise<{ region: string; devices: RawXiaomiDevice[] }> {
  for (const region of REGIONS) {
    try {
      const devices = await fetchDeviceList(session, region);
      if (devices.length > 0) return { region, devices };
    } catch {
      // tenta a próxima região
    }
  }
  return { region: REGIONS[0], devices: [] };
}

// ─── Descoberta de spec (miot-spec.org — público, sem autenticação) ────────

export interface XiaomiFanSpec {
  power?: { siid: number; piid: number };
  speed?: { siid: number; piid: number; min: number; max: number };
  swing?: { siid: number; piid: number };
  angle?: { siid: number; piid: number; options: number[] };
  mode?: { siid: number; piid: number; options: Array<{ value: number; label: string }> };
}

let specInstancesCache: Array<{ model: string; type: string; status?: string }> | null = null;

async function fetchSpecInstances(): Promise<Array<{ model: string; type: string; status?: string }>> {
  if (specInstancesCache) return specInstancesCache;
  const res = await fetch('https://miot-spec.org/miot-spec-v2/instances?status=all');
  const json = (await res.json()) as { instances: Array<{ model: string; type: string; status?: string }> };
  specInstancesCache = json.instances ?? [];
  return specInstancesCache;
}

interface MiotProperty {
  iid: number;
  type: string;
  format?: string;
  'value-range'?: number[];
  'value-list'?: Array<{ value: number; description: string }>;
}
interface MiotService {
  iid: number;
  type: string;
  properties?: MiotProperty[];
}

export async function xiaomiGetFanSpec(model: string): Promise<XiaomiFanSpec | null> {
  try {
    const instances = await fetchSpecInstances();
    const matches = instances.filter((i) => i.model === model);
    const chosen = matches.find((i) => i.status === 'released') ?? matches[0];
    if (!chosen) return null;

    const res = await fetch(`https://miot-spec.org/miot-spec-v2/instance?type=${encodeURIComponent(chosen.type)}`);
    const spec = (await res.json()) as { services?: MiotService[] };

    const fanService = spec.services?.find((s) => /:fan:/.test(s.type) || /:fan-control:/.test(s.type));
    if (!fanService?.properties) return null;

    const result: XiaomiFanSpec = {};
    let sawSpeedLevel = false;
    for (const p of fanService.properties) {
      if (/:on:\d/.test(p.type) || /:power:\d/.test(p.type)) {
        result.power = { siid: fanService.iid, piid: p.iid };
      } else if (/:speed-level:\d/.test(p.type)) {
        sawSpeedLevel = true;
        const range = p['value-range'];
        result.speed = { siid: fanService.iid, piid: p.iid, min: range?.[0] ?? 1, max: range?.[1] ?? 100 };
      } else if (!sawSpeedLevel && /:fan-level:\d/.test(p.type)) {
        // fallback — alguns modelos só têm fan-level (níveis inteiros), sem speed-level (0-100%)
        const list = p['value-list'];
        const values = list?.map((v) => v.value) ?? [1, 2, 3];
        result.speed = { siid: fanService.iid, piid: p.iid, min: Math.min(...values), max: Math.max(...values) };
      } else if (/:horizontal-swing:\d/.test(p.type) || /:vertical-swing:\d/.test(p.type)) {
        result.swing = { siid: fanService.iid, piid: p.iid };
      } else if (/:horizontal-angle:\d/.test(p.type) || /:vertical-angle:\d/.test(p.type)) {
        const list = p['value-list'];
        if (list) result.angle = { siid: fanService.iid, piid: p.iid, options: list.map((v) => v.value) };
      } else if (/:mode:\d/.test(p.type)) {
        const list = p['value-list'];
        if (list) result.mode = { siid: fanService.iid, piid: p.iid, options: list.map((v) => ({ value: v.value, label: v.description })) };
      }
    }
    return result;
  } catch {
    return null;
  }
}

// ─── DTO agregado (o que o endpoint /api/xiaomi devolve pro cliente) ───────

export interface XiaomiDeviceDto {
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

export async function xiaomiListFans(
  session: XiaomiSession,
  storedRegion: string
): Promise<{ region: string; devices: XiaomiDeviceDto[] }> {
  let region = storedRegion;
  let raw: RawXiaomiDevice[] = [];

  if (region) {
    try {
      raw = await fetchDeviceList(session, region);
    } catch {
      raw = [];
    }
  }
  if (raw.length === 0) {
    const found = await findRegionAndDevices(session);
    region = found.region;
    raw = found.devices;
  }

  const fans = raw.filter((d) => /fan/i.test(d.model));
  const specs = await Promise.all(fans.map((d) => xiaomiGetFanSpec(d.model)));

  const queries: Array<{ did: string; siid: number; piid: number }> = [];
  fans.forEach((d, i) => {
    const spec = specs[i];
    if (spec?.power) queries.push({ did: d.did, siid: spec.power.siid, piid: spec.power.piid });
    if (spec?.speed) queries.push({ did: d.did, siid: spec.speed.siid, piid: spec.speed.piid });
    if (spec?.swing) queries.push({ did: d.did, siid: spec.swing.siid, piid: spec.swing.piid });
    if (spec?.angle) queries.push({ did: d.did, siid: spec.angle.siid, piid: spec.angle.piid });
    if (spec?.mode) queries.push({ did: d.did, siid: spec.mode.siid, piid: spec.mode.piid });
  });
  const propValues = await xiaomiGetProps(session, region, queries);
  const findValue = (did: string, siid?: number, piid?: number): unknown => {
    if (siid === undefined || piid === undefined) return undefined;
    return propValues.find((p) => p.did === did && p.siid === siid && p.piid === piid)?.value;
  };

  const devices: XiaomiDeviceDto[] = fans.map((d, i) => {
    const spec = specs[i];
    const speedRaw = findValue(d.did, spec?.speed?.siid, spec?.speed?.piid);
    const angleRaw = findValue(d.did, spec?.angle?.siid, spec?.angle?.piid);
    const modeRaw = findValue(d.did, spec?.mode?.siid, spec?.mode?.piid);
    return {
      did: d.did,
      name: d.name || 'Ventilador Xiaomi',
      model: d.model,
      isOnline: d.isOnline ?? false,
      isOn: Boolean(findValue(d.did, spec?.power?.siid, spec?.power?.piid)),
      speedValue: typeof speedRaw === 'number' ? speedRaw : undefined,
      swingValue: Boolean(findValue(d.did, spec?.swing?.siid, spec?.swing?.piid)),
      angleValue: typeof angleRaw === 'number' ? angleRaw : undefined,
      modeValue: typeof modeRaw === 'number' ? modeRaw : undefined,
      power: spec?.power,
      speed: spec?.speed,
      swing: spec?.swing,
      angle: spec?.angle,
      mode: spec?.mode,
    };
  });

  return { region, devices };
}

async function xiaomiGetProps(
  session: XiaomiSession,
  region: string,
  queries: Array<{ did: string; siid: number; piid: number }>
): Promise<Array<{ did: string; siid: number; piid: number; value: unknown }>> {
  if (queries.length === 0) return [];
  try {
    const result = await xiaomiApiCall<{ result?: Array<{ did: string; siid: number; piid: number; value: unknown }> }>(
      session,
      region,
      '/miotspec/prop/get',
      { data: JSON.stringify({ datasource: 1, params: queries }) }
    );
    return result.result ?? [];
  } catch {
    return [];
  }
}

export async function xiaomiSetProperty(
  session: XiaomiSession,
  region: string,
  did: string,
  siid: number,
  piid: number,
  value: unknown
): Promise<void> {
  const result = await xiaomiApiCall<{ code: number }>(session, region, '/miotspec/prop/set', {
    data: JSON.stringify({ params: [{ did, siid, piid, value }] }),
  });
  if (result.code !== 0) {
    throw new Error(`Xiaomi: falha ao controlar o ventilador (código ${result.code}).`);
  }
}

// ─── Persistência da conta (Supabase) ───────────────────────────────────────

interface XiaomiAccountRow {
  region: string;
  ssecurity: string;
  mi_user_id: string;
  c_user_id: string;
  service_token: string;
  pass_token: string;
}

export async function saveXiaomiAccount(
  userId: string,
  authToken: string,
  session: XiaomiSession,
  region: string
): Promise<void> {
  await supabaseAsUser(authToken).from('xiaomi_accounts').upsert(
    {
      user_id: userId,
      region,
      ssecurity: session.ssecurity,
      mi_user_id: session.userId,
      c_user_id: session.cUserId,
      service_token: session.serviceToken,
      pass_token: session.passToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}

export async function getXiaomiAccount(
  userId: string,
  authToken: string
): Promise<{ session: XiaomiSession; region: string }> {
  const { data, error } = await supabaseAsUser(authToken)
    .from('xiaomi_accounts')
    .select('region, ssecurity, mi_user_id, c_user_id, service_token, pass_token')
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('Conta Xiaomi não conectada');
  const row = data as XiaomiAccountRow;
  return {
    region: row.region,
    session: {
      ssecurity: row.ssecurity,
      userId: row.mi_user_id,
      cUserId: row.c_user_id,
      serviceToken: row.service_token,
      passToken: row.pass_token,
    },
  };
}
