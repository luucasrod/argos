import type { Memory } from '@/types/memory.types';
import type { RouteEntry } from '@/services/telemetry/routeMetrics';

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

const MIN_PATTERN_REPETITIONS = 3;

/**
 * Detecta comandos repetidos e sugere automações.
 * FASE 19 do Prompt Master: sugestões proativas baseadas em padrão de uso.
 *
 * Agrupa entradas de telemetria por comando normalizado + bucket de hora do dia
 * (manhã/tarde/noite). Se um comando aparece ≥3× no mesmo período, sugere automação.
 */
export function buildPatternSuggestions(entries: RouteEntry[]): MemorySuggestion[] {
  const recent = entries.filter((e) => {
    const age = Date.now() - e.ts;
    return e.command && e.success && age < 14 * 24 * 60 * 60 * 1000; // últimas 2 semanas
  });

  // Agrupa por comando + período do dia
  const groups = new Map<string, { count: number; command: string; period: string }>();
  for (const entry of recent) {
    if (!entry.command) continue;
    const hour = new Date(entry.ts).getHours();
    const period = hour < 12 ? 'manhã' : hour < 18 ? 'tarde' : 'noite';
    const key = `${entry.command}__${period}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, { count: 1, command: entry.command, period });
    }
  }

  const suggestions: MemorySuggestion[] = [];
  for (const [key, { count, command, period }] of groups) {
    if (count < MIN_PATTERN_REPETITIONS) continue;
    suggestions.push({
      id: `pattern-suggestion-${key.replace(/\s+/g, '-')}`,
      memoryId: '',
      text: `Você costuma dizer "${command}" à ${period}. Quer criar uma automação para isso?`,
      action: {
        type: 'create_automation' as const,
        route: '/(modals)/create-automation' as const,
        prompt: `Crie uma automação que execute "${command}" automaticamente toda ${period}.`,
      },
    });
  }

  return suggestions;
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
