import {
  MEMORY_SCHEMA_VERSION,
  correctMemory as correctMemoryRecord,
  shouldRetainMemory,
  validateMemoryV1,
  type MemoryKind,
  type MemoryRecordV1,
  type MemoryScope,
} from '../../contracts/memory.v1';

export type MemoryAuditAction =
  | 'created'
  | 'updated'
  | 'confirmed'
  | 'corrected'
  | 'deleted';

export interface MemoryAuditEvent {
  action: MemoryAuditAction;
  at: string;
  actor: string;
  reason: string;
}

export interface StoredMemory {
  userId: string;
  memory: MemoryRecordV1;
  auditTrail: MemoryAuditEvent[];
}

export interface MemoryRepository {
  get: (userId: string, memoryId: string) => Promise<StoredMemory | null>;
  list: (userId: string) => Promise<StoredMemory[]>;
  save: (record: StoredMemory) => Promise<void>;
  delete: (userId: string, memoryId: string) => Promise<void>;
}

export interface MemoryQuery {
  kinds?: MemoryKind[];
  scopes?: MemoryScope[];
  context?: string[];
  createdSince?: string;
  includeRejected?: boolean;
  limit?: number;
  now?: string;
}

export interface MemoryExplanation {
  source: MemoryRecordV1['source']['source'];
  reason: string;
  confidence: number;
  matchedBy: Array<'kind' | 'scope' | 'context' | 'recency'>;
}

export interface MemoryServiceResult {
  memory: MemoryRecordV1;
  explanation: MemoryExplanation;
  auditTrail: MemoryAuditEvent[];
}

export interface MemoryMutationContext {
  actor: string;
  reason: string;
  at?: string;
}

function cloneMemory(memory: MemoryRecordV1): MemoryRecordV1 {
  return {
    ...memory,
    source: { ...memory.source },
    consent: { ...memory.consent },
    retentionPolicy: { ...memory.retentionPolicy },
  };
}

function cloneStored(record: StoredMemory): StoredMemory {
  return {
    userId: record.userId,
    memory: cloneMemory(record.memory),
    auditTrail: record.auditTrail.map((event) => ({ ...event })),
  };
}

function assertIso(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} deve ser ISO-8601`);
}

function assertUserId(userId: string): void {
  if (!userId.trim()) throw new Error('userId obrigatório');
}

function validate(memory: MemoryRecordV1): void {
  const errors = validateMemoryV1(memory);
  if (errors.length > 0) throw new Error(`Memória inválida: ${errors.join('; ')}`);
}

function event(action: MemoryAuditAction, context: MemoryMutationContext): MemoryAuditEvent {
  const at = context.at ?? new Date().toISOString();
  assertIso(at, 'audit.at');
  if (!context.actor.trim()) throw new Error('audit.actor obrigatório');
  if (!context.reason.trim()) throw new Error('audit.reason obrigatório');
  return { action, at, actor: context.actor, reason: context.reason };
}

function explanation(
  memory: MemoryRecordV1,
  matchedBy: MemoryExplanation['matchedBy']
): MemoryExplanation {
  return {
    source: memory.source.source,
    reason: memory.source.reason,
    confidence: memory.confidence,
    matchedBy,
  };
}

export class PersonalMemoryService {
  constructor(private readonly repository: MemoryRepository) {}

  async create(
    userId: string,
    memory: MemoryRecordV1,
    context: MemoryMutationContext
  ): Promise<MemoryServiceResult> {
    assertUserId(userId);
    validate(memory);
    if (await this.repository.get(userId, memory.id)) {
      throw new Error(`Memória já existe: ${memory.id}`);
    }
    const stored: StoredMemory = {
      userId,
      memory: cloneMemory(memory),
      auditTrail: [event('created', context)],
    };
    await this.repository.save(stored);
    return this.toResult(stored, []);
  }

  async get(userId: string, memoryId: string): Promise<MemoryServiceResult | null> {
    assertUserId(userId);
    const stored = await this.repository.get(userId, memoryId);
    return stored ? this.toResult(stored, []) : null;
  }

  async query(userId: string, query: MemoryQuery = {}): Promise<MemoryServiceResult[]> {
    assertUserId(userId);
    const now = query.now ?? new Date().toISOString();
    assertIso(now, 'query.now');
    if (query.createdSince) assertIso(query.createdSince, 'query.createdSince');
    const terms = (query.context ?? []).map((term) => term.trim().toLocaleLowerCase('pt-BR'))
      .filter(Boolean);

    return (await this.repository.list(userId))
      .filter(({ memory }) =>
        memory.state === 'rejected' ? Boolean(query.includeRejected) : shouldRetainMemory(memory, now)
      )
      .filter(({ memory }) => !query.kinds || query.kinds.includes(memory.kind))
      .filter(({ memory }) => !query.scopes || query.scopes.includes(memory.scope))
      .filter(({ memory }) =>
        !query.createdSince || Date.parse(memory.createdAt) >= Date.parse(query.createdSince)
      )
      .map((stored) => {
        const searchable = [
          stored.memory.title,
          stored.memory.content,
          stored.memory.source.reason,
        ].join(' ').toLocaleLowerCase('pt-BR');
        const contextMatches = terms.filter((term) => searchable.includes(term)).length;
        return { stored, contextMatches };
      })
      .filter(({ contextMatches }) => terms.length === 0 || contextMatches > 0)
      .sort((a, b) => {
        if (b.contextMatches !== a.contextMatches) return b.contextMatches - a.contextMatches;
        const aDate = a.stored.memory.lastUsedAt ?? a.stored.memory.createdAt;
        const bDate = b.stored.memory.lastUsedAt ?? b.stored.memory.createdAt;
        return Date.parse(bDate) - Date.parse(aDate);
      })
      .slice(0, Math.max(0, query.limit ?? 50))
      .map(({ stored, contextMatches }) => this.toResult(stored, [
        ...(query.kinds ? ['kind' as const] : []),
        ...(query.scopes ? ['scope' as const] : []),
        ...(contextMatches > 0 ? ['context' as const] : []),
        ...(query.createdSince ? ['recency' as const] : []),
      ]));
  }

  async update(
    userId: string,
    memoryId: string,
    changes: Partial<Pick<MemoryRecordV1, 'title' | 'content' | 'scope' | 'retentionPolicy'>>,
    context: MemoryMutationContext
  ): Promise<MemoryServiceResult> {
    const stored = await this.requireOwned(userId, memoryId);
    const next = { ...stored.memory, ...changes };
    validate(next);
    stored.memory = next;
    stored.auditTrail.push(event('updated', context));
    await this.repository.save(stored);
    return this.toResult(stored, []);
  }

  async confirm(
    userId: string,
    memoryId: string,
    context: MemoryMutationContext
  ): Promise<MemoryServiceResult> {
    const stored = await this.requireOwned(userId, memoryId);
    stored.memory = {
      ...stored.memory,
      state: 'confirmed',
      confidence: Math.min(1, stored.memory.confidence + 0.15),
    };
    validate(stored.memory);
    stored.auditTrail.push(event('confirmed', context));
    await this.repository.save(stored);
    return this.toResult(stored, []);
  }

  async correct(
    userId: string,
    memoryId: string,
    replacement: Parameters<typeof correctMemoryRecord>[1],
    context: MemoryMutationContext
  ): Promise<{ rejected: MemoryServiceResult; correction: MemoryServiceResult }> {
    const original = await this.requireOwned(userId, memoryId);
    const corrected = correctMemoryRecord(original.memory, replacement);
    const correctionStored: StoredMemory = {
      userId,
      memory: corrected.correction,
      auditTrail: [...original.auditTrail, event('corrected', context)],
    };
    original.memory = corrected.rejected;
    original.auditTrail.push(event('corrected', context));
    await this.repository.save(original);
    await this.repository.save(correctionStored);
    return {
      rejected: this.toResult(original, []),
      correction: this.toResult(correctionStored, []),
    };
  }

  async delete(
    userId: string,
    memoryId: string,
    context: MemoryMutationContext
  ): Promise<MemoryAuditEvent> {
    await this.requireOwned(userId, memoryId);
    const auditEvent = event('deleted', context);
    await this.repository.delete(userId, memoryId);
    return auditEvent;
  }

  private async requireOwned(userId: string, memoryId: string): Promise<StoredMemory> {
    assertUserId(userId);
    const stored = await this.repository.get(userId, memoryId);
    if (!stored || stored.userId !== userId) throw new Error('Memória não encontrada');
    return stored;
  }

  private toResult(
    stored: StoredMemory,
    matchedBy: MemoryExplanation['matchedBy']
  ): MemoryServiceResult {
    return {
      memory: cloneMemory(stored.memory),
      explanation: explanation(stored.memory, matchedBy),
      auditTrail: stored.auditTrail.map((item) => ({ ...item })),
    };
  }
}

/** Repositório de referência para testes; produção injeta armazenamento durável. */
export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly records = new Map<string, StoredMemory>();

  private key(userId: string, memoryId: string): string {
    return `${userId}\u0000${memoryId}`;
  }

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    const record = this.records.get(this.key(userId, memoryId));
    return record ? cloneStored(record) : null;
  }

  async list(userId: string): Promise<StoredMemory[]> {
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .map(cloneStored);
  }

  async save(record: StoredMemory): Promise<void> {
    assertUserId(record.userId);
    validate(record.memory);
    this.records.set(this.key(record.userId, record.memory.id), cloneStored(record));
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    this.records.delete(this.key(userId, memoryId));
  }
}

export interface MemoryKeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

/** Persistência JSON segregada por usuário; aceita AsyncStorage ou backend equivalente. */
export class JsonMemoryRepository implements MemoryRepository {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: MemoryKeyValueStorage,
    private readonly namespace = 'argos-personal-memory-v1'
  ) {}

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    return (await this.list(userId)).find((record) => record.memory.id === memoryId) ?? null;
  }

  async list(userId: string): Promise<StoredMemory[]> {
    assertUserId(userId);
    await this.pending.get(userId);
    return this.read(userId);
  }

  async save(record: StoredMemory): Promise<void> {
    await this.enqueue(record.userId, async () => {
      const records = await this.read(record.userId);
      const index = records.findIndex((item) => item.memory.id === record.memory.id);
      if (index >= 0) records[index] = cloneStored(record);
      else records.push(cloneStored(record));
      await this.storage.setItem(this.key(record.userId), JSON.stringify(records));
    });
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    await this.enqueue(userId, async () => {
      const records = await this.read(userId);
      await this.storage.setItem(
        this.key(userId),
        JSON.stringify(records.filter((record) => record.memory.id !== memoryId))
      );
    });
  }

  private key(userId: string): string {
    return `${this.namespace}:${encodeURIComponent(userId)}`;
  }

  private async read(userId: string): Promise<StoredMemory[]> {
    const raw = await this.storage.getItem(this.key(userId));
    if (!raw) return [];
    const records = JSON.parse(raw) as StoredMemory[];
    return records
      .filter((record) => record.userId === userId)
      .map((record) => {
        validate(record.memory);
        return cloneStored(record);
      });
  }

  private async enqueue(userId: string, operation: () => Promise<void>): Promise<void> {
    assertUserId(userId);
    const previous = this.pending.get(userId) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.pending.set(userId, next);
    try {
      await next;
    } finally {
      if (this.pending.get(userId) === next) this.pending.delete(userId);
    }
  }
}

export function createMemoryRecord(
  input: Omit<MemoryRecordV1, 'schemaVersion'>
): MemoryRecordV1 {
  const memory = { ...input, schemaVersion: MEMORY_SCHEMA_VERSION } as MemoryRecordV1;
  validate(memory);
  return memory;
}
