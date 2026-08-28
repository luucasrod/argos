/**
 * Fast Path — Camada determinística de comandos simples
 * Sem IA, sem latência, só regras diretas
 */
import { Intent, ConfidenceMetrics } from '@/types/router.types';
import { Device } from '@/types/device.types';

interface FastPathMatch {
  matched: boolean;
  intent?: Intent;
  confidence: number;
}

const DEVICE_KEYWORDS = {
  toggle: [
    'liga',
    'liga',
    'desliga',
    'apaga',
    'acende',
    'ligar',
    'desligar',
    'apagar',
    'acender',
    'toggle',
  ],
  on: ['liga', 'acende', 'ligar', 'acender', 'on', 'ativa', 'ativar'],
  off: ['desliga', 'apaga', 'desligar', 'apagar', 'off', 'desativa', 'desativar'],
  brightness: ['brilho', 'brightness', 'intensidade', 'mais claro', 'mais escuro'],
  color: ['cor', 'color', 'vermelho', 'azul', 'verde', 'branco', 'quente', 'frio', 'neutro'],
};

export function fastPathDeviceControl(
  utterance: string,
  devices: Device[]
): FastPathMatch {
  const text = utterance.toLowerCase();

  // Se tem palavra de cor, adia para IA (coi caso complexo)
  if (
    Object.values(DEVICE_KEYWORDS.color).some((kw) => text.includes(kw)) &&
    Object.values(DEVICE_KEYWORDS.toggle).some((kw) => text.includes(kw))
  ) {
    return { matched: false, confidence: 0 };
  }

  // Encontra nome de dispositivo
  const matchedDevice = devices.find((d) =>
    text.includes(d.name.toLowerCase()) || text.includes(d.id.toLowerCase())
  );

  if (!matchedDevice) {
    return { matched: false, confidence: 0 };
  }

  // Identifica ação
  let action: 'toggle' | 'on' | 'off' | undefined;
  if (DEVICE_KEYWORDS.on.some((kw) => text.includes(kw))) {
    action = 'on';
  } else if (DEVICE_KEYWORDS.off.some((kw) => text.includes(kw))) {
    action = 'off';
  } else if (DEVICE_KEYWORDS.toggle.some((kw) => text.includes(kw))) {
    action = 'toggle';
  }

  if (!action) {
    return { matched: false, confidence: 0 };
  }

  const metrics: ConfidenceMetrics = {
    confidence: 0.95,
    coverage: 1.0,
    requiredSlots: ['device', 'action'],
    missingSlots: [],
    ambiguities: [],
    unparsedSegments: [],
    actionRisk: 'low',
    contextDependency: false,
    multiIntent: false,
  };

  return {
    matched: true,
    confidence: 0.95,
    intent: {
      type: 'device_control',
      confidence: 0.95,
      coverage: 1.0,
      metrics,
      deviceIds: [matchedDevice.id],
      actions: [
        {
          deviceId: matchedDevice.id,
          action: action === 'toggle' ? 'toggle' : action === 'on' ? 'setOn' : 'setOff',
          property: 'isOn',
          value: action === 'on' ? true : action === 'off' ? false : !matchedDevice.isOn,
        },
      ],
      raw: utterance,
    },
  };
}

export function fastPathDeviceQuery(
  utterance: string,
  devices: Device[]
): FastPathMatch {
  const text = utterance.toLowerCase();
  const queryKeywords = [
    'qual',
    'como está',
    'tá',
    'estado',
    'status',
    'ligado',
    'desligado',
    'é',
    'está',
  ];

  if (!queryKeywords.some((kw) => text.includes(kw))) {
    return { matched: false, confidence: 0 };
  }

  const matchedDevice = devices.find((d) =>
    text.includes(d.name.toLowerCase()) || text.includes(d.id.toLowerCase())
  );

  if (!matchedDevice) {
    return { matched: false, confidence: 0 };
  }

  const metrics: ConfidenceMetrics = {
    confidence: 0.9,
    coverage: 1.0,
    requiredSlots: ['device'],
    missingSlots: [],
    ambiguities: [],
    unparsedSegments: [],
    actionRisk: 'low',
    contextDependency: false,
    multiIntent: false,
  };

  return {
    matched: true,
    confidence: 0.9,
    intent: {
      type: 'device_query',
      confidence: 0.9,
      coverage: 1.0,
      metrics,
      queryDeviceIds: [matchedDevice.id],
      queryProperty: 'isOn',
      raw: utterance,
    },
  };
}

/**
 * Fast Path —análise geral de uma frase
 */
export function analyzeFastPath(
  utterance: string,
  devices: Device[]
): { matched: boolean; route?: 'device_control' | 'device_query'; intent?: Intent } {
  // Tenta controle de dispositivo primeiro
  const controlMatch = fastPathDeviceControl(utterance, devices);
  if (controlMatch.matched && controlMatch.intent) {
    return { matched: true, route: 'device_control', intent: controlMatch.intent };
  }

  // Depois tenta query
  const queryMatch = fastPathDeviceQuery(utterance, devices);
  if (queryMatch.matched && queryMatch.intent) {
    return { matched: true, route: 'device_query', intent: queryMatch.intent };
  }

  return { matched: false };
}
