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
/**
 * Normaliza mantendo o mapa de posições para o texto ORIGINAL.
 *
 * Necessário porque `normalize()` encolhe a string: NFD decompõe "ó" em dois
 * caracteres e a remoção do diacrítico deixa um só. Sem este mapa, o índice
 * encontrado no texto normalizado não corresponde ao texto original, e a
 * substituição cairia no lugar errado.
 */
function normalizeWithMap(text: string): { normalized: string; map: number[] } {
  let normalized = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const chunk = text[i].toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '');
    for (let k = 0; k < chunk.length; k += 1) map.push(i);
    normalized += chunk;
  }
  return { normalized, map };
}

export function resolveDeviceVoiceAlias(text: string, devices: Device[]): string {
  const { normalized: normalizedText, map } = normalizeWithMap(text);
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
    const at = normalizedText.indexOf(alias);
    if (at === -1) continue;
    // Substitui SÓ o trecho do apelido, no texto original — o resto da frase
    // mantém acento e caixa. Devolver o texto normalizado inteiro descartava
    // os acentos que o Vosk tinha acabado de reconhecer corretamente, e só
    // quando um apelido casava: assimetria silenciosa entre os dois caminhos.
    const start = map[at];
    const end = map[at + alias.length - 1] + 1;
    return (text.slice(0, start) + device.name + text.slice(end)).trim();
  }

  return text.trim();
}
