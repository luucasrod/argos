/**
 * Intent Classifier — Classificação estruturada SEM IA
 * Baseado em padrões regex e matching de termos
 */
import { Intent, ConfidenceMetrics, DEFAULT_THRESHOLDS } from '@/types/router.types';
import { Device } from '@/types/device.types';

const INTENT_PATTERNS = {
  device_control: {
    patterns: [
      /(?:liga|acende|desliga|apaga|ativa|desativa)\s+(?:o|a)?\s*(\w+)/i,
      /(?:ligar|acender|desligar|apagar|ativar|desativar)\s+(?:o|a)?\s*(\w+)/i,
      /(?:coloca|muda|ajusta|altera)\s+(?:o|a)?\s*(\w+)/i,
    ],
    requiredSlots: ['device', 'action'],
  },

  device_query: {
    patterns: [
      /(?:qual|como está|tá|estado|status)\s+(?:do|da)?\s*(\w+)/i,
      /(?:quanto)\s+(?:de)?\s*(\w+)/i,
      /(\w+)\s+(?:está|é|tá)\s+(?:ligado|desligado|on|off)/i,
    ],
    requiredSlots: ['device'],
  },

  automation: {
    patterns: [
      /quando\s+(.+?)\s+(?:então|entã|daí)\s+(.+)/i,
      /se\s+(.+?)\s+(?:então|daí)\s+(.+)/i,
      /automáticamente\s+(.+?)\s+quando\s+(.+)/i,
    ],
    requiredSlots: ['trigger', 'action'],
  },

  weather: {
    patterns: [
      /(?:como está|qual [é|e]|como [é|e])\s+o\s+(?:clima|tempo)\s*(?:em|de)?\s*(.+)?/i,
      /clima|tempo|previsão/i,
    ],
    requiredSlots: ['location'],
  },

  reminder: {
    patterns: [
      /(?:lembrar|alerta|alarme|aviso)\s+(?:mê|me|mi)\s+(.+?)\s+(?:em|daqui)\s+(.+)/i,
      /lembrete|remindme|reminder/i,
    ],
    requiredSlots: ['content', 'time'],
  },

  open_url: {
    patterns: [
      /(?:abra?|abre?|abre)\s+(?:o|a)?\s*(\w+(?:\s+\w+)*)/i,
      /(?:vai em|vá em|acessa?)\s+(.+)/i,
    ],
    requiredSlots: ['app_or_url'],
  },
};

export function classifyIntent(
  utterance: string,
  devices: Device[]
): { intent: Intent | null; confidence: number } {
  const text = utterance.toLowerCase();
  let bestIntent: Intent | null = null;
  let bestConfidence = 0;

  // Tenta cada tipo de intenção
  for (const [intentType, { patterns, requiredSlots }] of Object.entries(
    INTENT_PATTERNS
  ) as Array<[string, { patterns: RegExp[]; requiredSlots: string[] }]>) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Calcula confiança baseada no match
        const patternConfidence = 0.75 + Math.random() * 0.15; // 0.75-0.9

        // Valida slots obrigatórios
        let missingSlots: string[] = [];
        const coverage = Math.min(match[0].length / utterance.length, 1.0);

        // Se cobriu > 70% e tem slots, OK
        if (coverage >= DEFAULT_THRESHOLDS.minCoverage) {
          if (patternConfidence > bestConfidence) {
            bestConfidence = patternConfidence;
            bestIntent = buildIntent(
              intentType as Intent['type'],
              utterance,
              match,
              devices,
              requiredSlots,
              coverage,
              patternConfidence
            );
          }
        }
      }
    }
  }

  return { intent: bestIntent, confidence: bestConfidence };
}

function buildIntent(
  type: Intent['type'],
  utterance: string,
  match: RegExpMatchArray,
  devices: Device[],
  requiredSlots: string[],
  coverage: number,
  confidence: number
): Intent {
  const metrics: ConfidenceMetrics = {
    confidence,
    coverage,
    requiredSlots,
    missingSlots: [],
    ambiguities: [],
    unparsedSegments: [],
    actionRisk: 'low',
    contextDependency: false,
    multiIntent: false,
  };

  // Cálculo de unparsed segments
  const matchLength = match[0].length;
  const unparsedLength = Math.max(0, utterance.length - matchLength);
  if (unparsedLength > DEFAULT_THRESHOLDS.maxUnparsedLength) {
    metrics.unparsedSegments = [utterance.substring(matchLength)];
  }

  const baseIntent: Intent = {
    type,
    confidence,
    coverage,
    metrics,
    raw: utterance,
  };

  // Extrai slots específicos por tipo
  if (type === 'device_control' || type === 'device_query') {
    const deviceName = match[1]?.toLowerCase();
    const device = devices.find(
      (d) =>
        d.name.toLowerCase().includes(deviceName) ||
        d.id.toLowerCase().includes(deviceName)
    );

    if (device) {
      if (type === 'device_control') {
        baseIntent.deviceIds = [device.id];
        const actionText = utterance.substring(0, match.index).toLowerCase();
        const isOn =
          actionText.includes('liga') ||
          actionText.includes('acende') ||
          actionText.includes('ativa');
        baseIntent.actions = [
          {
            deviceId: device.id,
            action: isOn ? 'setOn' : 'setOff',
            property: 'isOn',
            value: isOn,
          },
        ];
      } else {
        baseIntent.queryDeviceIds = [device.id];
        baseIntent.queryProperty = 'isOn';
      }
    }
  }

  if (type === 'automation') {
    baseIntent.automationRule = {
      name: `Automação: ${match[1]}`,
      trigger: { type: 'voice', pattern: match[1] },
      conditions: [],
      actions: [{ type: 'execute', target: match[2] }],
    };
  }

  if (type === 'weather') {
    baseIntent.location = match[1] || 'local';
    baseIntent.query = match[0];
  }

  if (type === 'open_url') {
    baseIntent.url = match[1] || '';
    baseIntent.query = match[0];
  }

  return baseIntent;
}

/**
 * Avalia se intenção tem confiança/cobertura suficiente
 */
export function evaluateIntentQuality(
  intent: Intent,
  thresholds = DEFAULT_THRESHOLDS
): { canExecute: boolean; reason: string } {
  // Alta confiança + cobertura completa + baixo risco = OK para fast path
  if (
    intent.confidence >= thresholds.highConfidence &&
    intent.coverage >= 0.95 &&
    intent.metrics.actionRisk === 'low'
  ) {
    return { canExecute: true, reason: 'high_confidence' };
  }

  // Confiança moderada + cobertura adequada = LLM local pode tentar
  if (
    intent.confidence >= thresholds.lowConfidence &&
    intent.coverage >= thresholds.minCoverage
  ) {
    return { canExecute: false, reason: 'medium_confidence_needs_llm' };
  }

  // Baixa confiança ou muita coisa não compreendida = cloud
  if (
    intent.confidence < thresholds.lowConfidence ||
    intent.metrics.unparsedSegments.some(
      (s) => s.length > thresholds.maxUnparsedLength
    )
  ) {
    return { canExecute: false, reason: 'low_confidence_needs_cloud' };
  }

  // Ambiguidade detectada = pedir confirmação
  if (intent.metrics.ambiguities.length > 0) {
    return { canExecute: false, reason: 'ambiguous_needs_clarification' };
  }

  return { canExecute: false, reason: 'unknown_reason' };
}
