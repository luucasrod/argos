import { speakToggle, speakToggleMany, speakBrightness } from '@/services/ai/fastIntentSpeech';
import { Device } from '@/types/device.types';
import { ParsedIntent } from './intentParser';

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

const ON_WORDS = ['liga', 'ligar', 'acende', 'acender', 'ativa', 'ativar'];
const OFF_WORDS = ['desliga', 'desligar', 'apaga', 'apagar', 'desativa', 'desativar'];
const TOGGLE_WORDS = ['alterna', 'inverte'];

// Palavras-chave para brilho (só funciona com dispositivos que suportam 'brightness')
const BRIGHT_MAX = ['maximo', 'total', 'tudo', 'cem', '100'];
const BRIGHT_HIGH = ['alto', 'alta', 'mais', 'aumenta', 'aumentar', 'sobe', 'subir'];
const BRIGHT_LOW = ['baixo', 'baixa', 'menos', 'diminui', 'diminuir', 'desce', 'descer', 'fraca'];
const BRIGHT_MIN = ['minimo', 'quase', 'pouco'];

/*
 * Palavras de cor. O atalho rápido só sabe ligar/desligar/brilho — se a frase
 * também pedir cor, ele reconhecia só o "liga" e IGNORAVA o resto em silêncio,
 * porque devolve o intent assim que acha um verbo on/off e nunca mais olha pra
 * frase. "Liga a luz do escritório e deixa vermelho" virava só "liga a luz do
 * escritório". Aqui a frase é rejeitada cedo para cair na IA, que processa
 * várias ações (ligar + cor) na mesma resposta.
 */
const COLOR_WORDS = [
  'cor', 'vermelha', 'vermelho', 'verde', 'azul', 'amarela', 'amarelo',
  'laranja', 'roxa', 'roxo', 'rosa', 'ciano', 'quente', 'fria', 'neutra',
];

/*
 * Conectores que não distinguem aparelho nenhum. Sem tirá-los, o "do" de
 * "Luz do escritório" casaria com qualquer frase que tivesse "do".
 */
const NAME_STOP_WORDS = ['do', 'da', 'de', 'dos', 'das', 'a', 'o', 'as', 'os', 'e'];

/** Palavras significativas do nome de um aparelho, para casar por nome parcial. */
function nameTokens(name: string): string[] {
  return normalize(name)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !NAME_STOP_WORDS.includes(token));
}

function extractPercentage(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%/);
  if (m) return Math.max(1, Math.min(100, parseInt(m[1], 10)));
  return null;
}

/**
 * Detecta comandos de brilho para lâmpadas inteligentes.
 * Ex: "aumenta o brilho", "brilho 50%", "brilho máximo"
 */
function matchBrightnessCommand(text: string, devices: Device[]): ParsedIntent | null {
  if (!/brilho|luminosidade|intensidade/.test(text)) return null;

  const lights = devices.filter(
    (d) => d.status === 'online' && d.capabilities.some((c) => c.property === 'brightness')
  );
  if (lights.length === 0) return null;

  const pct = extractPercentage(text);
  let value: number;
  let label: string;

  if (pct !== null) {
    value = pct;
    label = `${pct}%`;
  } else if (BRIGHT_MAX.some((w) => text.includes(w))) {
    value = 100;
    label = 'maximo';
  } else if (BRIGHT_MIN.some((w) => text.includes(w))) {
    value = 10;
    label = 'minimo';
  } else if (BRIGHT_HIGH.some((w) => text.includes(w))) {
    value = 80;
    label = 'alto';
  } else if (BRIGHT_LOW.some((w) => text.includes(w))) {
    value = 25;
    label = 'baixo';
  } else {
    return null;
  }

  // Filtra por nome de dispositivo se mencionado
  const named = lights.filter((d) => text.includes(normalize(d.name)));
  const targets = named.length > 0 ? named : lights;

  const actions = targets.map((d) => ({
    deviceId: d.id,
    action: 'setValue',
    property: 'brightness',
    value,
    label: `Brilho ${label} em ${d.name}`,
  }));

  const speech =
    targets.length === 1
      ? speakBrightness(targets[0].name, label)
      : speakBrightness(`${targets.length} lâmpadas`, label);

  return { type: 'device_control', speech, text: speech, actions };
}

/**
 * Detecta comandos óbvios de ligar/desligar/brilho sem passar pela IA.
 */
export function matchFastDeviceCommand(input: string, devices: Device[]): ParsedIntent | null {
  const text = normalize(input);
  if (!text) return null;
  const words = text.split(/\s+/);

  // Frases longas tendem a ter contexto/condições — deixa a IA interpretar.
  if (words.length > 10) return null;

  // Pedido de cor: o atalho não sabe processar, deixa a IA cuidar da frase inteira.
  if (COLOR_WORDS.some((w) => words.includes(w))) return null;

  // Tenta brilho antes de on/off
  const brightnessMatch = matchBrightnessCommand(text, devices);
  if (brightnessMatch) return brightnessMatch;

  let action: 'setOn' | 'setOff' | 'toggle' | null = null;
  if (ON_WORDS.some((w) => words.includes(w))) action = 'setOn';
  else if (OFF_WORDS.some((w) => words.includes(w))) action = 'setOff';
  else if (TOGGLE_WORDS.some((w) => words.includes(w))) action = 'toggle';
  if (!action) return null;

  const verb = action === 'setOff' ? 'Desligando' : action === 'setOn' ? 'Ligando' : 'Alternando';
  const online = devices.filter((d) => d.status === 'online');

  let matches = online.filter((d) => text.includes(normalize(d.name)));

  /*
   * Nome parcial. A fala natural quase nunca traz o nome completo do aparelho, e
   * o Vosk ainda corta o que não está na gramática: "desliga a luz do escritório"
   * chegou aqui como "desliga luz". Como o teste acima exige a frase inteira
   * ("luz do escritorio"), o atalho não casava e o comando ia para a IA — uma ida
   * à nuvem inteira, medida em ~3s, para um liga/desliga trivial.
   *
   * Aceita casar por palavra significativa do nome, mas só quando UM único
   * aparelho casa: com duas luzes, "desliga luz" é ambíguo e escolher no chute
   * apagaria a lâmpada errada. Ambíguo continua indo para a IA, que tem contexto
   * para desempatar.
   */
  if (matches.length === 0) {
    const partial = online.filter((d) =>
      nameTokens(d.name).some((token) => words.includes(token))
    );
    if (partial.length === 1) matches = partial;
  }

  let targets = matches;
  if (matches.length === 0 && /\btudo\b/.test(text)) {
    targets = online;
  }

  if (targets.length === 0) return null;

  const actions = targets.map((d) => ({
    deviceId: d.id,
    action: action as string,
    property: 'isOn',
    value: action === 'setOff' ? false : action === 'setOn' ? true : undefined,
    label: `${verb} ${d.name}`,
  }));

  // A personalidade (tom Jarvis, "senhor", humor) vive no systemPrompt e NUNCA
  // chega aqui: este caminho existe justamente para não chamar o modelo. Por
  // isso a frase precisa trazer o tom por conta própria — sem isso o Argos fica
  // seco exatamente nos comandos que o usuário mais usa.
  const speech =
    actions.length > 1
      ? speakToggleMany(actions.length, verb)
      : speakToggle(targets[0].name, action !== 'setOff');

  return {
    type: 'device_control',
    speech,
    text: speech,
    actions,
  };
}
