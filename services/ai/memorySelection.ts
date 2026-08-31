import type { Memory } from '@/types/memory.types';

export const MAX_PROMPT_MEMORIES = 12;
export const MAX_MEMORY_CONTEXT_CHARS = 2400;

type PromptMemory = Pick<Memory, 'content'> & Partial<Omit<Memory, 'content'>>;

export interface MemorySelectionResult {
  text: string;
  selectedCount: number;
  activeCount: number;
  beforeChars: number;
  afterChars: number;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function queryTerms(query: string): string[] {
  return [...new Set(normalize(query).split(' ').filter((term) => term.length >= 3))];
}

function timestamp(value: Date | string | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatMemory(memory: PromptMemory): string {
  const category = memory.category ? `[${memory.category}] ` : '';
  const title = memory.title ? `${memory.title}: ` : '';
  return `- ${category}${title}${memory.content}`;
}

export function selectMemoryContext(
  memories: PromptMemory[],
  currentMessage: string,
  maxChars = MAX_MEMORY_CONTEXT_CHARS
): MemorySelectionResult {
  const active = memories.filter((memory) => memory.isActive !== false && memory.status !== 'rejected');
  const terms = queryTerms(currentMessage);
  const beforeChars = active.map(formatMemory).join('\n').length;

  const ranked = active
    .map((memory, index) => {
      const searchable = normalize([
        memory.title,
        memory.content,
        memory.category,
        ...(memory.tags ?? []),
      ].filter(Boolean).join(' '));
      const relevance = terms.reduce(
        (score, term) => score + (searchable.includes(term) ? 100 : 0),
        0
      );
      const confirmed = memory.status === 'confirmed' ? 30 : 0;
      const explicit = memory.source === 'user_explicit' ? 15 : 0;
      const confidence = Math.round((memory.confidence ?? 0) * 10);
      const recency = Math.max(timestamp(memory.lastConfirmed), timestamp(memory.createdAt));
      return { memory, index, score: relevance + confirmed + explicit + confidence, recency };
    })
    .sort((a, b) => b.score - a.score || b.recency - a.recency || b.index - a.index)
    .slice(0, MAX_PROMPT_MEMORIES);

  const lines: string[] = [];
  for (const { memory } of ranked) {
    const line = formatMemory(memory);
    const separator = lines.length > 0 ? 1 : 0;
    const remaining = maxChars - lines.join('\n').length - separator;
    if (remaining <= 3) break;
    lines.push(line.length <= remaining ? line : `${line.slice(0, remaining - 1).trimEnd()}…`);
    if (line.length > remaining) break;
  }

  const text = lines.join('\n');
  return {
    text,
    selectedCount: lines.length,
    activeCount: active.length,
    beforeChars,
    afterChars: text.length,
  };
}
