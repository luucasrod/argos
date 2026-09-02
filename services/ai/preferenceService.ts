import type { MemoryRecordV1 } from '../../contracts/memory.v1';

export type PreferenceCardCategory =
  | 'home'
  | 'routine'
  | 'media'
  | 'notifications'
  | 'personalization';

export interface PreferenceCard {
  id: string;
  category: PreferenceCardCategory;
  question: string;
  preferenceKey: string;
  options: Array<{ id: string; label: string; value: string | boolean | number }>;
  relevantIntegrations: string[];
  relevantRoutines: string[];
  memoryTerms: string[];
  basePriority: number;
}

export type PreferenceResponseKind = 'accepted' | 'rejected' | 'skipped';

export interface PreferenceResponse {
  userId: string;
  cardId: string;
  kind: PreferenceResponseKind;
  value?: string | boolean | number;
  confidence: number;
  answeredAt: string;
}

export interface PreferenceRepository {
  listResponses: (userId: string) => Promise<PreferenceResponse[]>;
  saveResponse: (response: PreferenceResponse) => Promise<void>;
}

export interface PreferenceRankingContext {
  integrationIds: string[];
  routineIds: string[];
  memories: readonly MemoryRecordV1[];
  excludedCardIds?: string[];
  excludedCategories?: PreferenceCardCategory[];
  limit?: number;
  now?: string;
}

export interface RankedPreferenceCard {
  card: PreferenceCard;
  score: number;
  reasons: string[];
}

export interface SavePreferenceResponseInput {
  cardId: string;
  kind: PreferenceResponseKind;
  value?: string | boolean | number;
  confidence: number;
  answeredAt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REJECTED_COOLDOWN_MS = 30 * DAY_MS;
const SKIPPED_COOLDOWN_MS = 7 * DAY_MS;
const LEARNED_CONFIDENCE = 0.85;

export const DEFAULT_PREFERENCE_CARDS: readonly PreferenceCard[] = [
  {
    id: 'evening-light-color',
    category: 'home',
    question: 'Qual iluminação você prefere à noite?',
    preferenceKey: 'lighting.evening.color',
    options: [
      { id: 'warm', label: 'Quente e aconchegante', value: 'warm' },
      { id: 'cool', label: 'Branca e fria', value: 'cool' },
      { id: 'blue', label: 'Azul', value: 'blue' },
    ],
    relevantIntegrations: ['tuya', 'ewelink', 'wiz', 'tapo', 'xiaomi'],
    relevantRoutines: ['routine-dormir'],
    memoryTerms: ['luz', 'iluminação', 'cor à noite', 'lighting.evening.color'],
    basePriority: 60,
  },
  {
    id: 'morning-routine-time',
    category: 'routine',
    question: 'Em que horário sua rotina da manhã deve começar?',
    preferenceKey: 'routine.morning.time',
    options: [
      { id: 'six', label: '06:00', value: '06:00' },
      { id: 'seven', label: '07:00', value: '07:00' },
      { id: 'eight', label: '08:00', value: '08:00' },
    ],
    relevantIntegrations: [],
    relevantRoutines: ['routine-manha'],
    memoryTerms: ['rotina da manhã', 'acordar', 'routine.morning.time'],
    basePriority: 50,
  },
  {
    id: 'pet-alerts',
    category: 'notifications',
    question: 'Quer receber alertas dos dispositivos dos seus pets?',
    preferenceKey: 'notifications.petDevices',
    options: [
      { id: 'yes', label: 'Sim', value: true },
      { id: 'no', label: 'Não', value: false },
    ],
    relevantIntegrations: ['xiaomi-pet'],
    relevantRoutines: [],
    memoryTerms: ['alerta dos pets', 'notificação dos pets', 'notifications.petDevices'],
    basePriority: 35,
  },
  {
    id: 'music-focus-style',
    category: 'media',
    question: 'Que tipo de música combina com seu momento de foco?',
    preferenceKey: 'media.focus.genre',
    options: [
      { id: 'instrumental', label: 'Instrumental', value: 'instrumental' },
      { id: 'classical', label: 'Clássica', value: 'classical' },
      { id: 'silence', label: 'Prefiro silêncio', value: 'silence' },
    ],
    relevantIntegrations: ['spotify', 'youtube-music'],
    relevantRoutines: ['focus', 'trabalho'],
    memoryTerms: ['música para foco', 'música clássica', 'media.focus.genre'],
    basePriority: 30,
  },
];

function assertUserId(userId: string): void {
  if (!userId.trim()) throw new Error('userId obrigatório');
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error('answeredAt/now deve ser ISO-8601');
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function intersects(left: readonly string[], right: readonly string[]): string[] {
  const normalized = new Set(right.map(normalize));
  return left.filter((item) => normalized.has(normalize(item)));
}

function isLearned(card: PreferenceCard, memories: readonly MemoryRecordV1[]): boolean {
  const terms = card.memoryTerms.map(normalize);
  return memories.some((memory) => {
    if (memory.state === 'rejected' || memory.confidence < LEARNED_CONFIDENCE) return false;
    const searchable = normalize([
      memory.title,
      memory.content,
      memory.source.reason,
      memory.source.evidenceRef ?? '',
    ].join(' '));
    return terms.some((term) => searchable.includes(term));
  });
}

function inCooldown(response: PreferenceResponse, now: number): boolean {
  const age = now - Date.parse(response.answeredAt);
  if (response.kind === 'rejected') return age < REJECTED_COOLDOWN_MS;
  if (response.kind === 'skipped') return age < SKIPPED_COOLDOWN_MS;
  return response.confidence >= LEARNED_CONFIDENCE;
}

export class PreferenceService {
  private readonly cardsById: Map<string, PreferenceCard>;

  constructor(
    private readonly repository: PreferenceRepository,
    cards: readonly PreferenceCard[] = DEFAULT_PREFERENCE_CARDS
  ) {
    this.cardsById = new Map(cards.map((card) => [card.id, card]));
    if (this.cardsById.size !== cards.length) throw new Error('Preference card id duplicado');
  }

  async getNextCards(
    userId: string,
    context: PreferenceRankingContext
  ): Promise<RankedPreferenceCard[]> {
    assertUserId(userId);
    const now = context.now ?? new Date().toISOString();
    assertTimestamp(now);
    const nowMs = Date.parse(now);
    const responses = await this.repository.listResponses(userId);
    const latestByCard = new Map<string, PreferenceResponse>();
    for (const response of responses) {
      const previous = latestByCard.get(response.cardId);
      if (!previous || Date.parse(response.answeredAt) > Date.parse(previous.answeredAt)) {
        latestByCard.set(response.cardId, response);
      }
    }

    const excludedIds = new Set(context.excludedCardIds ?? []);
    const excludedCategories = new Set(context.excludedCategories ?? []);
    return [...this.cardsById.values()]
      .filter((card) => !excludedIds.has(card.id) && !excludedCategories.has(card.category))
      .filter((card) => !isLearned(card, context.memories))
      .filter((card) => {
        const response = latestByCard.get(card.id);
        return !response || !inCooldown(response, nowMs);
      })
      .map((card) => {
        const integrationMatches = intersects(card.relevantIntegrations, context.integrationIds);
        const routineMatches = intersects(card.relevantRoutines, context.routineIds);
        const previous = latestByCard.get(card.id);
        const reasons = [`prioridade-base:${card.basePriority}`];
        if (integrationMatches.length) reasons.push(`integrações:${integrationMatches.join(',')}`);
        if (routineMatches.length) reasons.push(`rotinas:${routineMatches.join(',')}`);
        if (previous) reasons.push(`resposta-anterior:${previous.kind}`);
        return {
          card,
          score:
            card.basePriority +
            integrationMatches.length * 40 +
            routineMatches.length * 30 -
            (previous ? 20 : 0),
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
      .slice(0, Math.max(0, context.limit ?? 10));
  }

  async saveResponse(userId: string, input: SavePreferenceResponseInput): Promise<PreferenceResponse> {
    assertUserId(userId);
    if (!this.cardsById.has(input.cardId)) throw new Error(`Card desconhecido: ${input.cardId}`);
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
      throw new Error('confidence deve estar entre 0 e 1');
    }
    const answeredAt = input.answeredAt ?? new Date().toISOString();
    assertTimestamp(answeredAt);
    const response: PreferenceResponse = {
      userId,
      cardId: input.cardId,
      kind: input.kind,
      ...(input.value !== undefined ? { value: input.value } : {}),
      confidence: input.confidence,
      answeredAt,
    };
    await this.repository.saveResponse(response);
    return { ...response };
  }
}

export class InMemoryPreferenceRepository implements PreferenceRepository {
  private readonly responses: PreferenceResponse[] = [];

  async listResponses(userId: string): Promise<PreferenceResponse[]> {
    return this.responses.filter((response) => response.userId === userId)
      .map((response) => ({ ...response }));
  }

  async saveResponse(response: PreferenceResponse): Promise<void> {
    assertUserId(response.userId);
    this.responses.push({ ...response });
  }
}

export interface PreferenceKeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export class JsonPreferenceRepository implements PreferenceRepository {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: PreferenceKeyValueStorage,
    private readonly namespace = 'argos-preference-responses-v1'
  ) {}

  async listResponses(userId: string): Promise<PreferenceResponse[]> {
    assertUserId(userId);
    await this.pending.get(userId);
    return this.read(userId);
  }

  async saveResponse(response: PreferenceResponse): Promise<void> {
    await this.enqueue(response.userId, async () => {
      const responses = await this.read(response.userId);
      responses.push({ ...response });
      await this.storage.setItem(this.key(response.userId), JSON.stringify(responses));
    });
  }

  private async read(userId: string): Promise<PreferenceResponse[]> {
    const raw = await this.storage.getItem(this.key(userId));
    if (!raw) return [];
    return (JSON.parse(raw) as PreferenceResponse[])
      .filter((response) => response.userId === userId)
      .map((response) => ({ ...response }));
  }

  private key(userId: string): string {
    return `${this.namespace}:${encodeURIComponent(userId)}`;
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
