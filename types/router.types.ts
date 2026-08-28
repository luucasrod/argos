// Tipos para a arquitetura de roteamento híbrido

export type Route = 'FAST_PATH' | 'INTENT_LOCAL' | 'LLM_LOCAL' | 'CLOUD' | 'CLARIFICATION';

export interface ConfidenceMetrics {
  confidence: number; // 0-1, quão confiante na intenção
  coverage: number; // 0-1, quanto da frase foi coberta
  requiredSlots: string[]; // slots obrigatórios
  missingSlots: string[]; // slots obrigatórios que faltam
  ambiguities: string[]; // interpretações alternativas
  unparsedSegments: string[]; // partes não compreendidas
  actionRisk: 'low' | 'medium' | 'high'; // impacto potencial da ação
  contextDependency: boolean; // depende de conversa anterior?
  multiIntent: boolean; // várias ações na mesma frase?
}

export interface Intent {
  type:
    | 'device_control'
    | 'device_query'
    | 'automation'
    | 'routine'
    | 'chat'
    | 'open_url'
    | 'weather'
    | 'reminder'
    | 'memory'
    | 'unknown';

  confidence: number;
  coverage: number;
  metrics: ConfidenceMetrics;

  // para device_control
  deviceIds?: string[];
  actions?: Array<{
    deviceId: string;
    action: 'toggle' | 'setOn' | 'setOff' | 'setValue';
    property: string;
    value: unknown;
  }>;

  // para device_query
  queryDeviceIds?: string[];
  queryProperty?: string;

  // para automation
  automationRule?: {
    name: string;
    trigger: unknown;
    conditions: unknown[];
    actions: unknown[];
  };

  // para chat/open_url/weather/etc
  url?: string;
  query?: string;
  location?: string;

  raw: string; // transcrição original
  rawResponse?: unknown; // resposta bruta do modelo, se virou JSON
}

export interface RoutingDecision {
  route: Route;
  intent: Intent;
  reason: string; // por que essa rota foi escolhida
  latency?: Record<string, number>; // latências de cada etapa
  fallbackRoute?: Route; // rota alternativa se essa falhar
}

export interface ExecutorResult {
  success: boolean;
  message: string; // mensagem para o usuário
  speech: string; // resposta falada (curta)
  data?: unknown; // dados retornados
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  toolCalls?: Array<{
    tool: string;
    args: unknown;
    result: unknown;
    duration: number;
  }>;
}

export interface IntentClassifierThresholds {
  highConfidence: number; // >= este valor, pode ir direto
  lowConfidence: number; // < este valor, desconfiado
  minCoverage: number; // < este valor, parcial
  maxUnparsedLength: number; // máximo de caracteres não compreendidos
}

export const DEFAULT_THRESHOLDS: IntentClassifierThresholds = {
  highConfidence: 0.85,
  lowConfidence: 0.5,
  minCoverage: 0.7,
  maxUnparsedLength: 50, // 50 caracteres = ~10 palavras
};
