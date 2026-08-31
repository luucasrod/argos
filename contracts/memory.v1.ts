export const MEMORY_SCHEMA_VERSION = 1 as const;

export type MemoryKind =
  | 'preference'
  | 'fact'
  | 'routinePattern'
  | 'correction'
  | 'temporaryContext';

export type MemoryState = 'suggested' | 'confirmed' | 'inferred' | 'rejected';
export type MemorySource = 'userExplicit' | 'userCorrection' | 'observedBehavior' | 'imported';
export type MemoryScope = 'conversation' | 'device' | 'home' | 'account';
export type SensitivityClass = 'none' | 'personal' | 'sensitive' | 'highlySensitive';

export type RetentionPolicy =
  | { kind: 'session' }
  | { kind: 'expiresAt'; expiresAt: string }
  | { kind: 'untilRejected' }
  | { kind: 'indefinite' };

export interface MemoryProvenance {
  source: MemorySource;
  reason: string;
  evidenceRef?: string;
}

export interface MemoryRecordV1 {
  schemaVersion: typeof MEMORY_SCHEMA_VERSION;
  id: string;
  kind: MemoryKind;
  state: MemoryState;
  title: string;
  content: string;
  source: MemoryProvenance;
  confidence: number;
  createdAt: string;
  lastUsedAt: string | null;
  scope: MemoryScope;
  sensitivityClass: SensitivityClass;
  retentionPolicy: RetentionPolicy;
  consent: {
    explicitlyGranted: boolean;
    grantedAt: string | null;
  };
  correctedFromId?: string;
  rejectedAt?: string;
}

export interface MemoryExportV1 {
  exportedAt: string;
  schemaVersion: typeof MEMORY_SCHEMA_VERSION;
  memories: MemoryRecordV1[];
}

const INFERENCE_ALLOWED = new Set<SensitivityClass>(['none', 'personal']);

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function canInferMemory(
  sensitivityClass: SensitivityClass,
  explicitlyGranted = false
): boolean {
  return INFERENCE_ALLOWED.has(sensitivityClass) || explicitlyGranted;
}

export function validateMemoryV1(memory: MemoryRecordV1): string[] {
  const errors: string[] = [];
  if (memory.schemaVersion !== MEMORY_SCHEMA_VERSION) errors.push('schemaVersion nao suportada');
  if (!memory.id.trim()) errors.push('id obrigatorio');
  if (!memory.title.trim()) errors.push('title obrigatorio');
  if (!memory.content.trim()) errors.push('content obrigatorio');
  if (!memory.source.reason.trim()) errors.push('source.reason obrigatorio');
  if (memory.confidence < 0 || memory.confidence > 1) errors.push('confidence deve estar entre 0 e 1');
  if (!isIsoDate(memory.createdAt)) errors.push('createdAt deve ser ISO-8601');
  if (memory.lastUsedAt !== null && !isIsoDate(memory.lastUsedAt)) {
    errors.push('lastUsedAt deve ser ISO-8601 ou null');
  }
  if (memory.state === 'inferred' && !canInferMemory(
    memory.sensitivityClass,
    memory.consent.explicitlyGranted
  )) {
    errors.push('memoria sensivel nao pode ser inferida sem consentimento explicito');
  }
  if (memory.consent.explicitlyGranted && (
    memory.consent.grantedAt === null || !isIsoDate(memory.consent.grantedAt)
  )) {
    errors.push('consent.grantedAt obrigatorio quando consentimento foi concedido');
  }
  if (memory.kind === 'temporaryContext' && memory.retentionPolicy.kind === 'indefinite') {
    errors.push('temporaryContext nao pode ter retencao indefinida');
  }
  if (memory.retentionPolicy.kind === 'expiresAt' && !isIsoDate(memory.retentionPolicy.expiresAt)) {
    errors.push('retentionPolicy.expiresAt deve ser ISO-8601');
  }
  return errors;
}

export function rejectMemory(memory: MemoryRecordV1, rejectedAt: string): MemoryRecordV1 {
  if (!isIsoDate(rejectedAt)) throw new Error('rejectedAt deve ser ISO-8601');
  return { ...memory, state: 'rejected', rejectedAt };
}

export function correctMemory(
  original: MemoryRecordV1,
  replacement: Omit<MemoryRecordV1, 'schemaVersion' | 'kind' | 'source' | 'correctedFromId'>
): { rejected: MemoryRecordV1; correction: MemoryRecordV1 } {
  const correctedAt = replacement.createdAt;
  const correction: MemoryRecordV1 = {
    ...replacement,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    kind: 'correction',
    state: 'confirmed',
    source: {
      source: 'userCorrection',
      reason: `Correcao da memoria ${original.id}`,
    },
    correctedFromId: original.id,
  };
  const errors = validateMemoryV1(correction);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return { rejected: rejectMemory(original, correctedAt), correction };
}

export function shouldRetainMemory(memory: MemoryRecordV1, now: string): boolean {
  if (memory.state === 'rejected') return false;
  if (memory.retentionPolicy.kind === 'session') return false;
  if (memory.retentionPolicy.kind === 'expiresAt') {
    return Date.parse(memory.retentionPolicy.expiresAt) > Date.parse(now);
  }
  return true;
}

export function exportMemoriesV1(
  memories: readonly MemoryRecordV1[],
  exportedAt: string
): MemoryExportV1 {
  if (!isIsoDate(exportedAt)) throw new Error('exportedAt deve ser ISO-8601');
  const invalid = memories.flatMap((memory) => validateMemoryV1(memory));
  if (invalid.length > 0) throw new Error(`Exportacao contem memoria invalida: ${invalid.join('; ')}`);
  return {
    exportedAt,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    memories: memories.map((memory) => ({
      ...memory,
      source: { ...memory.source },
      consent: { ...memory.consent },
      retentionPolicy: { ...memory.retentionPolicy },
    })),
  };
}
