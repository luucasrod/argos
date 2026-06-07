import { useCallback } from 'react';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { runAutomation } from '@/services/automation/automationEngine';
import type { Automation } from '@/types/automation.types';

export function useAutomation() {
  const { automations, toggleAutomation, setRunningAutomation } = useAutomationStore();

  const executeAutomation = useCallback(
    async (automation: Automation) => {
      setRunningAutomation(automation.id);
      await runAutomation(automation);
      setRunningAutomation(null);
    },
    [setRunningAutomation]
  );

  return { automations, toggleAutomation, executeAutomation };
}
