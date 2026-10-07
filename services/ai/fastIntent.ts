import { speakToggle, speakToggleMany, speakBrightness, speakColor } from '@/services/ai/fastIntentSpeech';
import { Device } from '@/types/device.types';
import { Automation } from '@/types/automation.types';
import { Memory } from '@/types/memory.types';
import { ParsedIntent } from './intentParser';
import { getLastIntentContext } from '@/services/voice/intentContext';

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

// Palavras de cor RGB (mapeadas para hex) e temperatura de cor.
// Comandos mistos (ligar + cor) ainda vão para a IA; comandos só de cor são
// resolvidos localmente aqui.
const COLOR_WORDS = [
  'cor', 'vermelha', 'vermelho', 'verde', 'azul', 'amarela', 'amarelo',
  'laranja', 'roxa', 'roxo', 'rosa', 'ciano', 'quente', 'fria', 'neutra',
];

const COLOR_HEX_MAP: Record<string, string> = {
  vermelha: '#FF0000', vermelho: '#FF0000',
  verde: '#00C800',
  azul: '#0000FF',
  amarela: '#FFFF00', amarelo: '#FFFF00',
  laranja: '#FF7800',
  roxa: '#8B00FF', roxo: '#8B00FF',
  rosa: '#FF69B4',
  ciano: '#00FFFF',
};

const COLOR_TEMP_MAP: Record<string, 'warm' | 'neutral' | 'cool'> = {
  quente: 'warm',
  fria: 'cool',
  neutra: 'neutral',
};

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

function supportsOnOff(device: Device): boolean {
  return device.capabilities.some(
    (capability) => capability.type === 'toggle' &&
      ['isOn', 'onOff', 'power'].includes(capability.property)
  );
}

function setOffIntent(targets: Device[], speech: string): ParsedIntent | null {
  if (targets.length === 0) return null;

  return {
    type: 'device_control',
    // Descreve uma acao em andamento; o executor registra o resultado real.
    speech,
    text: speech,
    actions: targets.map((device) => ({
      deviceId: device.id,
      action: 'setOff',
      property: 'isOn',
      value: false,
      label: `Desligando ${device.name}`,
    })),
  };
}

/** Comandos de casa inteira que nao dependem de IDs ficticios do prompt. */
function matchHouseCommand(text: string, devices: Device[]): ParsedIntent | null {
  const available = devices.filter((device) => device.status === 'online' && supportsOnOff(device));

  if (/\bboa noite\b/.test(text)) {
    const targets = available.filter(
      (device) => device.category === 'lights' || device.category === 'tv'
    );
    return setOffIntent(targets, 'Iniciando o modo boa noite e desligando os aparelhos.');
  }

  const words = text.split(/\s+/);
  const asksToTurnOff = OFF_WORDS.some((word) => words.includes(word));
  const asksToTurnOn = ON_WORDS.some((word) => words.includes(word));
  const asksForLights = words.some((word) => ['luz', 'luzes', 'lampada', 'lampadas'].includes(word));
  const isCompound = /\b(e|depois|tambem)\b/.test(text);
  if ((!asksToTurnOff && !asksToTurnOn) || !asksForLights || isCompound) return null;

  const lights = available.filter((device) => device.category === 'lights');

  // Room inference: casar por substring (escritório ≈ "escrit") e sinônimos comuns
  const ROOM_ALIASES: Record<string, string[]> = {
    sala: ['sala', 'living', 'estar'],
    quarto: ['quarto', 'bedroom', 'suite', 'suíte', 'dormitorio'],
    cozinha: ['cozinha', 'kitchen'],
    banheiro: ['banheiro', 'lavabo', 'banho'],
    escritorio: ['escritorio', 'escrit', 'office', 'trabalho'],
    varanda: ['varanda', 'sacada', 'terraço', 'terraco'],
    garagem: ['garagem', 'garage'],
  };

  const allRooms = [...new Set(
    devices.filter((d) => d.category === 'lights').map((d) => normalize(d.room ?? ''))
  )].filter(Boolean);

  const mentionedRooms = allRooms.filter((room) => {
    if (text.includes(room)) return true;
    // Verifica aliases para a sala normalizada
    for (const aliases of Object.values(ROOM_ALIASES)) {
      if (aliases.some((alias) => room.includes(alias) && text.includes(alias))) return true;
    }
    // Verifica se alguma palavra significativa do nome do quarto está no texto
    const tokens = room.split(/\s+/).filter((t) => t.length > 3);
    return tokens.some((t) => text.includes(t));
  });

  const targets = mentionedRooms.length > 0
    ? lights.filter((device) => mentionedRooms.includes(normalize(device.room ?? '')))
    : lights;

  if (targets.length === 0) return null;

  if (asksToTurnOn) {
    const actions = targets.map((d) => ({
      deviceId: d.id,
      action: 'setOn',
      property: 'isOn',
      value: true,
      label: `Ligando ${d.name}`,
    }));
    const speech = targets.length === 1
      ? speakToggle(targets[0].name, true)
      : speakToggleMany(targets.length, 'Ligando');
    return { type: 'device_control', speech, text: speech, actions };
  }

  return setOffIntent(
    targets,
    targets.length === 1 ? `Apagando ${targets[0].name}.` : `Apagando ${targets.length} luzes acessiveis.`
  );
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
 * Detecta comandos de cor/temperatura de cor sem chamar a IA.
 * Retorna null se nenhum dispositivo online suportar a propriedade pedida.
 */
function matchColorCommand(text: string, devices: Device[], words: string[]): ParsedIntent | null {
  // Temperatura de cor primeiro (quente/fria/neutra) — mais comum no dia a dia
  const tempWord = words.find((w) => COLOR_TEMP_MAP[w]);
  if (tempWord) {
    const targets = devices.filter(
      (d) => d.status === 'online' && d.capabilities.some((c) => c.property === 'colorTemperature')
    );
    if (targets.length === 0) return null;

    const named = targets.filter((d) => text.includes(normalize(d.name)));
    const finalTargets = named.length > 0 ? named : targets;
    const tempValue = COLOR_TEMP_MAP[tempWord];

    const actions = finalTargets.map((d) => ({
      deviceId: d.id,
      action: 'setValue',
      property: 'colorTemperature',
      value: tempValue,
      label: `Temperatura ${tempWord} em ${d.name}`,
    }));

    const speech = speakColor(
      finalTargets.length === 1 ? finalTargets[0].name : `${finalTargets.length} lâmpadas`,
      tempWord
    );
    return { type: 'device_control', speech, text: speech, actions };
  }

  // Cor RGB
  const colorWord = words.find((w) => COLOR_HEX_MAP[w]);
  if (!colorWord) return null;

  const targets = devices.filter(
    (d) => d.status === 'online' && d.capabilities.some((c) => c.type === 'color')
  );
  if (targets.length === 0) return null;

  const named = targets.filter((d) => text.includes(normalize(d.name)));
  const finalTargets = named.length > 0 ? named : targets;
  const colorHex = COLOR_HEX_MAP[colorWord];

  const actions = finalTargets.map((d) => ({
    deviceId: d.id,
    action: 'setValue',
    property: 'color',
    value: colorHex,
    label: `Cor ${colorWord} em ${d.name}`,
  }));

  const speech = speakColor(
    finalTargets.length === 1 ? finalTargets[0].name : `${finalTargets.length} lâmpadas`,
    colorWord
  );
  return { type: 'device_control', speech, text: speech, actions };
}

// Frases típicas de follow-up que se referem ao contexto anterior
const FOLLOWUP_PHRASES = [
  'e o', 'e a', 'e os', 'e as',
  'tambem o', 'tambem a', 'tambem os', 'tambem as',
  'mais o', 'mais a', 'e esse', 'e essa',
];

/**
 * Detecta follow-up contextual: "e a do quarto também" → repete a última
 * ação sobre um dispositivo diferente, sem precisar mencionar a ação.
 */
export function matchFollowUpCommand(input: string, devices: Device[]): ParsedIntent | null {
  const text = normalize(input);
  const ctx = getLastIntentContext();
  if (!ctx || !ctx.action) return null;

  const isFollowUp = FOLLOWUP_PHRASES.some((p) => text.startsWith(p)) ||
    /^(tambem|igualmente|idem)/.test(text);
  if (!isFollowUp) return null;

  // Remove o prefixo de follow-up para extrair só o nome do dispositivo
  let devicePart = text;
  for (const p of FOLLOWUP_PHRASES) {
    if (text.startsWith(p)) {
      devicePart = text.slice(p.length).trim();
      break;
    }
  }
  if (!devicePart) return null;

  const online = devices.filter((d) => d.status === 'online');
  let target: Device | null = null;

  for (const d of online) {
    if (devicePart.includes(normalize(d.name))) { target = d; break; }
  }
  if (!target) {
    const partial = online.filter((d) =>
      nameTokens(d.name).some((tok) => devicePart.includes(tok))
    );
    if (partial.length === 1) target = partial[0];
  }
  if (!target) return null;

  const prevAction = ctx.intent.actions?.[0];
  const action = ctx.action;
  const verb = action === 'setOff' ? 'Desligando' : action === 'setOn' ? 'Ligando' : 'Alternando';

  const actions = [{
    deviceId: target.id,
    action,
    property: prevAction?.property ?? 'isOn',
    value: prevAction?.value,
    label: `${verb} ${target.name}`,
  }];

  const speech = speakToggle(target.name, action !== 'setOff');
  return { type: 'device_control', speech, text: speech, actions };
}

/**
 * Decompõe comandos compostos por "e" em múltiplas ações no mesmo intent.
 * Ex: "liga a luz e a TV" → [{setOn luz}, {setOn TV}]
 * Só funciona quando TODAS as partes são resolvíveis localmente.
 */
export function matchCompoundDeviceCommand(input: string, devices: Device[]): ParsedIntent | null {
  const text = normalize(input);
  // Precisa conter conector explícito "e"
  if (!/\b(e|mais|tambem)\b/.test(text)) return null;

  // Divide nos conectores, tenta resolver cada parte individualmente
  const parts = text.split(/\b(?:e|mais|tambem)\b/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;

  const allActions: ParsedIntent['actions'] = [];
  let combinedSpeech = '';

  for (const part of parts) {
    // Cada parte deve ser um comando simples (sem sub-compostos)
    if (/\b(?:e|mais|tambem)\b/.test(part)) return null;
    const sub = matchFastDeviceCommand(part, devices);
    if (!sub || sub.type !== 'device_control' || !sub.actions?.length) return null;
    allActions.push(...sub.actions);
  }

  if (allActions.length === 0) return null;

  combinedSpeech = speakToggleMany(allActions.length, 'Executando');
  return { type: 'device_control', speech: combinedSpeech, text: combinedSpeech, actions: allActions };
}

/**
 * Detecta comandos óbvios de ligar/desligar/brilho/cor sem passar pela IA.
 */
export function matchFastDeviceCommand(input: string, devices: Device[]): ParsedIntent | null {
  const text = normalize(input);
  if (!text) return null;
  const words = text.split(/\s+/);

  // Frases longas tendem a ter contexto/condições — deixa a IA interpretar.
  if (words.length > 10) return null;

  const hasColorWord = COLOR_WORDS.some((w) => words.includes(w));
  const hasActionWord =
    ON_WORDS.some((w) => words.includes(w)) || OFF_WORDS.some((w) => words.includes(w));

  // Comando misto (ligar + cor): a IA processa as duas ações juntas.
  if (hasColorWord && hasActionWord) return null;

  // Comando só de cor: tenta resolver localmente.
  if (hasColorWord) {
    return matchColorCommand(text, devices, words);
  }

  const houseMatch = matchHouseCommand(text, devices);
  if (houseMatch) return houseMatch;

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

/**
 * Detecta queries de estado de dispositivo e responde com dados locais,
 * sem chamar a IA. Ex: "está ligada?", "qual o brilho?", "que horas são?"
 * não se aplica — só perguntas sobre o estado atual de aparelhos.
 */
export function matchDeviceStateQuery(input: string, devices: Device[]): ParsedIntent | null {
  const text = normalize(input);
  const words = text.split(/\s+/);

  const isQuery =
    /\b(esta|esta ligad|esta desligad|qual|como esta|ta ligad|ta desligad|mostrar|ver)\b/.test(text) ||
    text.endsWith('?');

  if (!isQuery) return null;

  // Tenta casar com um dispositivo pelo nome parcial
  const online = devices.filter((d) => d.status === 'online');
  let target: Device | null = null;

  for (const d of online) {
    if (text.includes(normalize(d.name))) { target = d; break; }
  }
  if (!target) {
    const partial = online.filter((d) =>
      nameTokens(d.name).some((tok) => words.includes(tok))
    );
    if (partial.length === 1) target = partial[0];
  }
  if (!target) return null;

  // Determina o que foi perguntado
  const asksBrightness = /brilho|luminosidade|intensidade/.test(text);
  const asksColor = /cor|temperatura/.test(text);
  const asksStatus = !asksBrightness && !asksColor;

  let answer = '';
  if (asksStatus) {
    const isOn = target.state?.isOn ?? target.state?.onOff ?? target.state?.power;
    answer = isOn ? `${target.name} está ligada, senhor.` : `${target.name} está desligada, senhor.`;
  } else if (asksBrightness) {
    const br = target.state?.brightness;
    answer = br != null
      ? `Brilho de ${target.name} está em ${br}%, senhor.`
      : `${target.name} não suporta brilho ajustável.`;
  } else if (asksColor) {
    const ct = target.state?.colorTemperature;
    const color = target.state?.color;
    if (ct) answer = `Temperatura de cor de ${target.name}: ${ct}.`;
    else if (color) answer = `Cor atual de ${target.name}: ${color}, senhor.`;
    else answer = `${target.name} não tem cor configurada.`;
  }

  if (!answer) return null;

  return { type: 'query', speech: answer, text: answer };
}

/**
 * Verifica se o input casa com o trigger de voz de alguma automação ativa.
 * Executar a automação é responsabilidade do chamador (runAutomation).
 * Retorna a automação correspondente ou null.
 */
export function matchVoiceTriggeredAutomation(input: string, automations: Automation[]): Automation | null {
  const text = normalize(input);
  if (!text) return null;

  return automations.find((a) => {
    if (!a.isActive) return false;
    if (a.trigger?.type !== 'voice') return false;
    const phrase = a.trigger.config?.phrase as string | undefined;
    if (!phrase) return false;
    return normalize(phrase) === text || text.includes(normalize(phrase));
  }) ?? null;
}

/**
 * Extrai aliases de dispositivos de memórias do tipo 'preference' ou 'location'.
 * Ex: memória "minha lâmpada favorita é a Luz do Escritório"
 *   → alias "minha lampada favorita" → Device{Luz do Escritório}
 */
function extractDeviceAliases(memories: Memory[], devices: Device[]): Map<string, Device> {
  const map = new Map<string, Device>();

  for (const mem of memories) {
    if (!mem.isActive) continue;
    if (mem.category !== 'preference' && mem.category !== 'location') continue;

    // Preserva "é" (acento) antes de normalizar — normalize() transforma "é" → "e"
    // que colide com a conjunção. Por isso usamos toLowerCase() aqui.
    const content = mem.content.toLowerCase();
    const eIdx = content.indexOf(' é ');
    if (eIdx === -1) continue;

    const rawLeft = content.slice(0, eIdx).trim();
    const rawRight = content.slice(eIdx + 3)
      .replace(/^(o|a|os|as|minha|meu|meus|minhas)\s+/, '')
      .trim();

    for (const device of devices) {
      const deviceLower = device.name.toLowerCase();

      if (rawRight.includes(deviceLower) || deviceLower.includes(rawRight)) {
        const alias = normalize(rawLeft);
        if (alias.length > 3) map.set(alias, device);
      } else if (rawLeft.includes(deviceLower) || deviceLower.includes(rawLeft)) {
        const alias = normalize(rawRight);
        if (alias.length > 3) map.set(alias, device);
      }
    }
  }

  return map;
}

/**
 * Resolve aliases definidos pelo usuário em memórias antes de tentar o fast path.
 * Ex: "desliga minha lâmpada favorita" → substitui alias pelo nome real → fast path resolve.
 * FASE 18 do Prompt Master.
 */
export function matchMemoryAwareDeviceCommand(
  input: string,
  devices: Device[],
  memories: Memory[]
): ParsedIntent | null {
  if (!memories.length) return null;

  const aliases = extractDeviceAliases(memories, devices);
  if (!aliases.size) return null;

  const textNorm = normalize(input);
  let resolvedInput = input;
  let matched = false;

  for (const [alias, device] of aliases) {
    if (textNorm.includes(alias)) {
      // Substitui o alias pelo nome do dispositivo, preservando maiúsculas originais
      const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      resolvedInput = resolvedInput.replace(re, device.name);
      matched = true;
      break;
    }
  }

  if (!matched) return null;

  return matchFastDeviceCommand(resolvedInput, devices);
}
