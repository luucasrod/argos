import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Automation, Routine } from '@/types/automation.types';
import { PRESET_AUTOMATIONS, PRESET_ROUTINES } from '@/constants/presets';
import { runAutomation } from '@/services/automation/automationEngine';
import { getForegroundLocation } from '@/services/automation/foregroundLocation';
import { AutomationTriggerScheduler } from '@/services/automation/triggerScheduler';

interface AutomationStore {
  automations: Automation[];
  addAutomation: (automation: Automation) => void;
  updateAutomation: (id: string, partial: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  toggleAutomation: (id: string) => void;
  routines: Routine[];
  addRoutine: (routine: Routine) => void;
  toggleRoutine: (id: string) => void;
  runningAutomationId: string | null;
  setRunningAutomation: (id: string | null) => void;
}

export const useAutomationStore = create<AutomationStore>()(
  persist(
    (set) => ({
      automations: PRESET_AUTOMATIONS,
      addAutomation: (automation) =>
        set((state) => ({ automations: [...state.automations, automation] })),
      updateAutomation: (id, partial) =>
        set((state) => ({
          automations: state.automations.map((a) => (a.id === id ? { ...a, ...partial } : a)),
        })),
      deleteAutomation: (id) =>
        set((state) => ({ automations: state.automations.filter((a) => a.id !== id) })),
      toggleAutomation: (id) =>
        set((state) => ({
          automations: state.automations.map((a) =>
            a.id === id ? { ...a, isActive: !a.isActive } : a
          ),
        })),
      routines: PRESET_ROUTINES,
      addRoutine: (routine) => set((state) => ({ routines: [...state.routines, routine] })),
      toggleRoutine: (id) =>
        set((state) => ({
          routines: state.routines.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r)),
        })),
      runningAutomationId: null,
      setRunningAutomation: (id) => set({ runningAutomationId: id }),
    }),
    {
      name: 'argos-automations',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

const scheduler = new AutomationTriggerScheduler({
  getAutomations: () => useAutomationStore.getState().automations,
  getLocation: getForegroundLocation,
  runAutomation: async (automation) => {
    const store = useAutomationStore.getState();
    store.setRunningAutomation(automation.id);
    try {
      await runAutomation(automation);
    } finally {
      useAutomationStore.getState().setRunningAutomation(null);
    }
  },
  onTriggered: (automation, triggeredAt) => {
    useAutomationStore.getState().updateAutomation(automation.id, {
      lastTriggered: triggeredAt,
      runCount: automation.runCount + 1,
    });
  },
});

const schedulerKey = '__argosAutomationTriggerScheduler';
const schedulerGlobal = globalThis as typeof globalThis & {
  [schedulerKey]?: AutomationTriggerScheduler;
};

if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  schedulerGlobal[schedulerKey]?.stop();
  schedulerGlobal[schedulerKey] = scheduler;
  scheduler.start();
}
