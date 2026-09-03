export const CONTEXT_SCHEMA_VERSION = 1 as const;

export type ContextSource =
  | 'explicitCommand'
  | 'conversation'
  | 'trustedLocal'
  | 'confirmedPreference'
  | 'inference';

export type NetworkPresence = 'home' | 'away' | 'unknown';
export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night';
export type ContextField = 'homeId' | 'roomId' | 'activeDeviceId';

export interface ContextEvidence {
  id: string;
  field: ContextField;
  value: string;
  source: ContextSource;
  confidence: number;
  observedAt: string;
  expiresAt?: string;
  reason: string;
}

export interface ContextSnapshotV1 {
  schemaVersion: typeof CONTEXT_SCHEMA_VERSION;
  capturedAt: string;
  homeId: string | null;
  roomHint: {
    roomId: string;
    confidence: number;
    source: ContextSource;
  } | null;
  networkPresence: NetworkPresence;
  timeContext: {
    instant: string;
    timeZone: string;
    dayPeriod: DayPeriod;
  };
  activeDevice: {
    deviceId: string;
    roomId?: string;
    confidence: number;
  } | null;
  userPreferenceRefs: string[];
  evidence: ContextEvidence[];
}

export interface ContextResolutionOptions {
  minimumConfidence?: number;
  clarificationQuestion?: string;
  allowInference?: boolean;
}

export type ContextResolution =
  | {
      status: 'resolved';
      field: ContextField;
      value: string;
      source: ContextSource;
      confidence: number;
      evidenceIds: string[];
    }
  | {
      status: 'clarification';
      field: ContextField;
      question: string;
      candidateValues: string[];
      reason: 'missing' | 'lowConfidence' | 'conflict';
    };

const SOURCE_PRIORITY: Readonly<Record<ContextSource, number>> = {
  explicitCommand: 5,
  conversation: 4,
  trustedLocal: 3,
  confirmedPreference: 2,
  inference: 1,
};

const DEFAULT_MINIMUM_CONFIDENCE = 0.7;

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function defaultQuestion(field: ContextField): string {
  if (field === 'roomId') return 'Em qual cômodo?';
  if (field === 'activeDeviceId') return 'Qual aparelho você quer usar?';
  return 'Em qual casa?';
}

export function validateContextSnapshot(snapshot: ContextSnapshotV1): string[] {
  const errors: string[] = [];
  if (snapshot.schemaVersion !== CONTEXT_SCHEMA_VERSION) errors.push('schemaVersion nao suportada');
  if (!isIsoDate(snapshot.capturedAt)) errors.push('capturedAt deve ser ISO-8601');
  if (!isIsoDate(snapshot.timeContext.instant)) errors.push('timeContext.instant deve ser ISO-8601');
  if (!snapshot.timeContext.timeZone.trim()) errors.push('timeContext.timeZone obrigatorio');
  if (snapshot.roomHint && !validConfidence(snapshot.roomHint.confidence)) {
    errors.push('roomHint.confidence deve estar entre 0 e 1');
  }
  if (snapshot.activeDevice && !validConfidence(snapshot.activeDevice.confidence)) {
    errors.push('activeDevice.confidence deve estar entre 0 e 1');
  }
  if (new Set(snapshot.userPreferenceRefs).size !== snapshot.userPreferenceRefs.length) {
    errors.push('userPreferenceRefs nao pode conter duplicatas');
  }
  for (const item of snapshot.evidence) {
    if (!item.id.trim() || !item.value.trim() || !item.reason.trim()) {
      errors.push('evidence exige id, value e reason');
    }
    if (!validConfidence(item.confidence)) errors.push(`confidence invalida: ${item.id}`);
    if (!isIsoDate(item.observedAt)) errors.push(`observedAt invalido: ${item.id}`);
    if (item.expiresAt !== undefined && !isIsoDate(item.expiresAt)) {
      errors.push(`expiresAt invalido: ${item.id}`);
    }
  }
  return errors;
}

/** Resolve um campo sem permitir que evidencia fraca ultrapasse fonte mais autoritativa. */
export function resolveContext(
  snapshot: ContextSnapshotV1,
  field: ContextField,
  options: ContextResolutionOptions = {}
): ContextResolution {
  const validationErrors = validateContextSnapshot(snapshot);
  if (validationErrors.length > 0) throw new Error(validationErrors.join('; '));

  const question = options.clarificationQuestion?.trim() || defaultQuestion(field);
  const minimumConfidence = options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
  if (!validConfidence(minimumConfidence)) throw new Error('minimumConfidence deve estar entre 0 e 1');
  const now = Date.parse(snapshot.capturedAt);
  const candidates = snapshot.evidence
    .filter((item) => item.field === field)
    .filter((item) => options.allowInference !== false || item.source !== 'inference')
    .filter((item) => item.expiresAt === undefined || Date.parse(item.expiresAt) > now)
    .sort((left, right) =>
      SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source] ||
      right.confidence - left.confidence ||
      left.value.localeCompare(right.value) ||
      left.id.localeCompare(right.id)
    );

  if (candidates.length === 0) {
    return { status: 'clarification', field, question, candidateValues: [], reason: 'missing' };
  }

  const topPriority = SOURCE_PRIORITY[candidates[0].source];
  const top = candidates.filter((item) => SOURCE_PRIORITY[item.source] === topPriority);
  const values = [...new Set(top.map((item) => item.value))].sort();
  if (values.length > 1) {
    return { status: 'clarification', field, question, candidateValues: values, reason: 'conflict' };
  }

  const winner = top[0];
  if (winner.confidence < minimumConfidence) {
    return {
      status: 'clarification',
      field,
      question,
      candidateValues: [winner.value],
      reason: 'lowConfidence',
    };
  }

  return {
    status: 'resolved',
    field,
    value: winner.value,
    source: winner.source,
    confidence: winner.confidence,
    evidenceIds: top.filter((item) => item.value === winner.value).map((item) => item.id).sort(),
  };
}
