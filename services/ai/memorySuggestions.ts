import type { Memory } from '@/types/memory.types';

export interface MemorySuggestionAction {
  type: 'create_automation';
  route: '/(modals)/create-automation';
  prompt: string;
}

export interface MemorySuggestion {
  id: string;
  text: string;
  memoryId: string;
  action: MemorySuggestionAction;
}

const AUTOMATABLE_CATEGORIES = new Set<Memory['category']>([
  'preference',
  'routine',
  'habit',
]);

function stripTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, '');
}

/**
 * Produz sugestões somente a partir de fatos que o usuário já confirmou.
 * O resultado é derivado das memórias, portanto não precisa de persistência própria.
 */
export function buildMemorySuggestions(memories: Memory[]): MemorySuggestion[] {
  return memories
    .filter(
      (memory) =>
        memory.isActive &&
        memory.status === 'confirmed' &&
        AUTOMATABLE_CATEGORIES.has(memory.category) &&
        memory.content.trim().length > 0
    )
    .map((memory) => {
      const fact = stripTrailingPunctuation(memory.content);

      return {
        id: `memory-suggestion-${memory.id}`,
        memoryId: memory.id,
        text: `Você me contou que ${fact}. Quer transformar isso em uma automação?`,
        action: {
          type: 'create_automation' as const,
          route: '/(modals)/create-automation' as const,
          prompt: `Crie uma automação considerando esta preferência ou padrão confirmado: ${fact}.`,
        },
      };
    });
}
