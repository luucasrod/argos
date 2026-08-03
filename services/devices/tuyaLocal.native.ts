/**
 * tuyaLocal.native.ts — controle das lâmpadas Tuya DIRETO na rede local.
 *
 * Por que existe: pelo caminho da nuvem um comando percorre
 * celular → internet → servidor Tuya → internet → lâmpada, o que dá 1 a 3
 * segundos e para de funcionar se a internet cair. Na LAN é celular → lâmpada,
 * dezenas de milissegundos, e funciona com o roteador sozinho.
 *
 * Protocolo (formato binário da Tuya, TCP porta 6668):
 *   55AA | seq(4) | comando(4) | tamanho(4) | payload | crc32(4) | 0000AA55
 * O payload é JSON cifrado com AES-128-ECB usando a `local_key` do aparelho
 * (16 bytes, obtida da nuvem uma única vez). Na versão 3.3 o payload de comando
 * ainda leva um cabeçalho de 15 bytes com a versão.
 *
 * Escopo: versão 3.3, que é a das lâmpadas comuns. As versões 3.4 e 3.5 trocam
 * ECB por GCM e exigem negociação de chave de sessão — detectadas e recusadas
 * de forma explícita em vez de falhar em silêncio.
 */
import TcpSocket from 'react-native-tcp-socket';
import aesjs from 'aes-js';

const TUYA_PORT = 6668;
const PREFIX = 0x000055aa;
const SUFFIX = 0x0000aa55;

const CMD_CONTROL = 7;
const CMD_DHCP_QUERY = 0x0a; // status

/** Timeout curto de propósito: se a LAN não responder rápido, vai pela nuvem. */
const DEFAULT_TIMEOUT_MS = 700;

export interface TuyaLocalTarget {
  deviceId: string;
  localKey: string;
  ip: string;
  protocolVersion?: string | null;
}

export function supportsLocalProtocol(version: string | null | undefined): boolean {
  // Sem versão informada assumimos 3.3, que é o caso mais comum.
  if (!version) return true;
  return version === '3.1' || version === '3.3';
}

/* ─── CRC32 (tabela padrão, igual à usada pelo firmware Tuya) ─────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/* ─── Utilidades de bytes ─────────────────────────────────────────────────── */

function strToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function bytesToStr(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function writeUInt32BE(view: Uint8Array, offset: number, value: number): void {
  view[offset] = (value >>> 24) & 0xff;
  view[offset + 1] = (value >>> 16) & 0xff;
  view[offset + 2] = (value >>> 8) & 0xff;
  view[offset + 3] = value & 0xff;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/* ─── Criptografia ────────────────────────────────────────────────────────── */

/** PKCS#7 — o firmware exige o preenchimento completo, inclusive bloco extra. */
function pkcs7Pad(data: Uint8Array): Uint8Array {
  const pad = 16 - (data.length % 16);
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  out.fill(pad, data.length);
  return out;
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0) return data;
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 16 || pad > data.length) return data;
  return data.subarray(0, data.length - pad);
}

function encrypt(plain: Uint8Array, key: string): Uint8Array {
  const ecb = new aesjs.ModeOfOperation.ecb(strToBytes(key));
  return new Uint8Array(ecb.encrypt(pkcs7Pad(plain)));
}

function decrypt(cipher: Uint8Array, key: string): Uint8Array {
  if (cipher.length === 0 || cipher.length % 16 !== 0) return cipher;
  const ecb = new aesjs.ModeOfOperation.ecb(strToBytes(key));
  return pkcs7Unpad(new Uint8Array(ecb.decrypt(cipher)));
}

/* ─── Enquadramento ───────────────────────────────────────────────────────── */

let sequence = 0;

function buildFrame(command: number, payload: Uint8Array): Uint8Array {
  sequence = (sequence + 1) >>> 0;

  // tamanho = payload + crc32(4) + sufixo(4)
  const header = new Uint8Array(16);
  writeUInt32BE(header, 0, PREFIX);
  writeUInt32BE(header, 4, sequence);
  writeUInt32BE(header, 8, command);
  writeUInt32BE(header, 12, payload.length + 8);

  const semCrc = concat(header, payload);
  const tail = new Uint8Array(8);
  writeUInt32BE(tail, 0, crc32(semCrc));
  writeUInt32BE(tail, 4, SUFFIX);

  return concat(semCrc, tail);
}

/**
 * Payload de comando na versão 3.3: 15 bytes de cabeçalho ("3.3" + 12 zeros)
 * antes do JSON cifrado. Sem isso o aparelho ignora o pacote silenciosamente.
 */
function buildControlPayload(json: string, key: string, version: string): Uint8Array {
  const cipher = encrypt(strToBytes(json), key);
  if (version === '3.1') return cipher; // 3.1 usa base64 + md5, fora do escopo
  const versionHeader = concat(strToBytes('3.3'), new Uint8Array(12));
  return concat(versionHeader, cipher);
}

function parseResponse(data: Uint8Array, key: string): unknown | null {
  if (data.length < 24) return null;
  const lengthAt = 12;
  const size =
    (data[lengthAt] << 24) | (data[lengthAt + 1] << 16) | (data[lengthAt + 2] << 8) | data[lengthAt + 3];
  let payload = data.subarray(16, 16 + Math.max(0, size - 8));

  // Respostas costumam vir com o mesmo cabeçalho de versão.
  if (payload.length > 15 && bytesToStr(payload.subarray(0, 3)) === '3.3') {
    payload = payload.subarray(15);
  }

  const plain = decrypt(payload, key);
  const text = bytesToStr(plain).replace(/\0+$/, '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ─── Envio ───────────────────────────────────────────────────────────────── */

/**
 * Abre a conexão, envia um comando e fecha. Conexão por comando é proposital:
 * as lâmpadas Tuya aceitam poucas conexões simultâneas e derrubam sessões
 * ociosas, o que tornaria uma conexão persistente menos confiável que o ganho.
 */
function sendRaw(
  target: TuyaLocalTarget,
  frame: Uint8Array,
  timeoutMs: number
): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    let done = false;
    let socket: ReturnType<typeof TcpSocket.createConnection> | null = null;

    const finish = (result: Uint8Array | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      socket = TcpSocket.createConnection(
        { host: target.ip, port: TUYA_PORT },
        () => {
          try {
            socket?.write(Buffer.from(frame) as unknown as string);
          } catch {
            finish(null);
          }
        }
      );

      socket.on('data', (chunk: string | Buffer) => {
        const bytes =
          typeof chunk === 'string' ? strToBytes(chunk) : new Uint8Array(chunk as unknown as ArrayLike<number>);
        finish(bytes);
      });
      socket.on('error', () => finish(null));
      socket.on('timeout', () => finish(null));
      socket.on('close', () => finish(null));
    } catch {
      finish(null);
    }
  });
}

/**
 * Envia comandos (formato `dps`) direto para a lâmpada.
 * Devolve true só se o aparelho respondeu — a ausência de resposta é tratada
 * como falha para que o chamador caia na nuvem.
 */
export async function tuyaLocalSet(
  target: TuyaLocalTarget,
  dps: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  if (!target.ip || !target.localKey) return false;
  if (!supportsLocalProtocol(target.protocolVersion)) return false;
  if (target.localKey.length !== 16) return false;

  const version = target.protocolVersion === '3.1' ? '3.1' : '3.3';
  const body = JSON.stringify({
    devId: target.deviceId,
    uid: target.deviceId,
    t: Math.round(Date.now() / 1000),
    dps,
  });

  const frame = buildFrame(CMD_CONTROL, buildControlPayload(body, target.localKey, version));
  const reply = await sendRaw(target, frame, timeoutMs);
  return reply !== null;
}

/** Consulta o estado atual direto na lâmpada. null = não respondeu. */
export async function tuyaLocalStatus(
  target: TuyaLocalTarget,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Record<string, unknown> | null> {
  if (!target.ip || !target.localKey) return null;
  if (!supportsLocalProtocol(target.protocolVersion)) return null;
  if (target.localKey.length !== 16) return null;

  const body = JSON.stringify({ gwId: target.deviceId, devId: target.deviceId });
  const frame = buildFrame(CMD_DHCP_QUERY, buildControlPayload(body, target.localKey, '3.3'));
  const reply = await sendRaw(target, frame, timeoutMs);
  if (!reply) return null;

  const parsed = parseResponse(reply, target.localKey) as { dps?: Record<string, unknown> } | null;
  return parsed?.dps ?? null;
}

/** Alcançável agora na LAN? Usado para decidir local x nuvem sem adivinhar. */
export async function tuyaLocalReachable(
  target: TuyaLocalTarget,
  timeoutMs = 400
): Promise<boolean> {
  return (await tuyaLocalStatus(target, timeoutMs)) !== null;
}
