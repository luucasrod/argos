import type { Automation } from '@/types/automation.types';
import type { ParsedIntent } from './intentParser';

export function buildAutomationFromIntent(intent: ParsedIntent): Partial<Automation> | null {
  if (intent.type !== 'automation' || !intent.automation) return null;
  return intent.automation as Partial<Automation>;
}
