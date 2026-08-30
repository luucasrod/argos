import type { Device } from '@/types/device.types';

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

/*
 * Substituições conferidas em assets/model-pt (vocab.json extraído de Gr.fst).
 * Todos os tokens à direita existem no vocabulário; os da esquerda não.
 */
const SPEAKABLE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bar-condicionado\b/giu, 'ar condicionado'],
  [/\bspeaker\b/giu, 'caixa de som'],
  [/\bstanding\b/giu, 'pedestal'],
  [/\b4k\b/giu, 'quatro'],
  [/\btv\b/giu, 'televisor'],
  [/\b2\b/gu, 'dois'],
];

/** Retorna um nome inteiramente falável quando o nome original contém tokens ausentes. */
export function getSpeakableDeviceAlias(name: string): string | null {
  let alias = name;
  for (const [pattern, replacement] of SPEAKABLE_REPLACEMENTS) {
    alias = alias.replace(pattern, replacement);
  }
  alias = alias.replace(/\s+/g, ' ').trim();
  return normalize(alias) === normalize(name) ? null : alias;
}

/**
 * Converte o apelido reconhecido de volta ao nome real antes do fast intent/IA.
 * Apelidos duplicados são ignorados para nunca escolher um aparelho no chute.
 */
export function resolveDeviceVoiceAlias(text: string, devices: Device[]): string {
  const normalizedText = normalize(text);
  const devicesByAlias = new Map<string, Device[]>();

  for (const device of devices) {
    const alias = getSpeakableDeviceAlias(device.name);
    if (!alias) continue;
    const key = normalize(alias);
    devicesByAlias.set(key, [...(devicesByAlias.get(key) ?? []), device]);
  }

  const uniqueAliases = [...devicesByAlias.entries()]
    .filter(([, matches]) => matches.length === 1)
    .sort(([a], [b]) => b.length - a.length);

  for (const [alias, [device]] of uniqueAliases) {
    if (normalizedText.includes(alias)) {
      return normalizedText.replace(alias, device.name);
    }
  }

  return text.trim();
}
