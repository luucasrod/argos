import { router } from 'expo-router';
import type { Insight } from '@/types/memory.types';

export function handleInsightPress(
  insight: Insight,
  sendMessage: (text: string) => void,
  dismissInsight?: (id: string) => void
): void {
  if (insight.navigateTo) {
    router.push(insight.navigateTo as never);
    dismissInsight?.(insight.id);
    return;
  }
  if (insight.suggestion) {
    sendMessage(insight.suggestion);
  }
}

export function normalizeInsight(insight: Insight): Insight {
  if (insight.id !== 'insight-1') return insight;
  return {
    ...insight,
    id: 'insight-welcome',
    suggestion: 'Ver automações e rotinas',
    navigateTo: '/(tabs)/automations',
  };
}
