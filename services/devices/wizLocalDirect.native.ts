/**
 * wizLocalDirect.native.ts — controle das lâmpadas WiZ DIRETO na rede local,
 * sem conta, sem Google, sem nuvem WiZ, sem PC ligado como ponte.
 *
 * Fala com `WizUdpModule` (android/app/src/main/java/com/masya/argos/modules/),
 * um módulo nativo Kotlin escrito para este app — zero dependência de pacote
 * npm de terceiros. A primeira tentativa usava `react-native-udp` e derrubava
 * o app inteiro no boot: é módulo de arquitetura antiga, incompatível com a
 * Nova Arquitetura que este app já usa (react-native-mmkv/Nitro exigem).
 * `DatagramSocket` já vem no Android — não precisa de biblioteca nenhuma.
 *
 * Protocolo (documentado pela comunidade — pywizlight, integração WiZ do
 * Home Assistant): UDP, JSON puro, sem criptografia. Porta 38899.
 */
import { NativeModules } from 'react-native';

const { WizUdp } = NativeModules;

export interface WizPilotState {
  mac: string;
  state: boolean;
  dimming: number | null;
  temp: number | null;
  r: number | null;
  g: number | null;
  b: number | null;
}

export interface WizDiscoveredDevice {
  ip: string;
  mac: string;
}

type WizPilotParams =
  | { state: boolean }
  | { dimming: number }
  | { temp: number }
  | { r: number; g: number; b: number; dimming: number };

const DEFAULT_TIMEOUT_MS = 2000;

export async function getWizLocalPilot(
  ip: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WizPilotState | null> {
  if (!WizUdp) return null;
  const result = await WizUdp.getPilot(ip, timeoutMs);
  return result ?? null;
}

export async function setWizLocalPilot(
  ip: string,
  params: WizPilotParams,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  if (!WizUdp) return false;
  return WizUdp.setPilot(ip, JSON.stringify(params), timeoutMs);
}

export async function discoverWizLocal(
  timeoutMs = 3000
): Promise<WizDiscoveredDevice[]> {
  if (!WizUdp) return [];
  const found = await WizUdp.discover(timeoutMs);
  return Array.isArray(found) ? found : [];
}
