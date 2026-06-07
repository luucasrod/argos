import type { Automation, AutomationTrigger } from '@/types/automation.types';

export function evaluateTrigger(trigger: AutomationTrigger, context: Record<string, unknown> = {}): boolean {
  switch (trigger.type) {
    case 'voice':
      return (
        typeof context.phrase === 'string' &&
        typeof trigger.config.phrase === 'string' &&
        context.phrase.toLowerCase().includes(String(trigger.config.phrase).toLowerCase())
      );
    case 'manual':
      return context.manual === true;
    case 'time':
      return true;
    default:
      return false;
  }
}

export function findMatchingAutomation(
  automations: Automation[],
  context: Record<string, unknown>
): Automation | undefined {
  return automations.find((a) => a.isActive && evaluateTrigger(a.trigger, context));
}
