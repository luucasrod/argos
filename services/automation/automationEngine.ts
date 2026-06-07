import type { Automation, AutomationAction } from '@/types/automation.types';
import { useDeviceStore } from '@/stores/useDeviceStore';

export async function executeAutomationAction(action: AutomationAction): Promise<void> {
  if (action.type === 'device_control') {
    const config = action.config as {
      deviceId?: string;
      action?: string;
      property?: string;
      value?: unknown;
    };
    const { toggleDevice, updateDeviceState } = useDeviceStore.getState();

    if (!config.deviceId) return;

    if (config.action === 'toggle') {
      toggleDevice(config.deviceId);
    } else if (config.action === 'setOn') {
      updateDeviceState(config.deviceId, 'isOn', true);
    } else if (config.action === 'setOff') {
      updateDeviceState(config.deviceId, 'isOn', false);
    } else if (config.action === 'setValue' && config.property) {
      updateDeviceState(config.deviceId, config.property, config.value);
    }
  }

  if (action.delayMs) {
    await new Promise((r) => setTimeout(r, action.delayMs));
  }
}

export async function runAutomation(automation: Automation): Promise<void> {
  for (const action of automation.actions) {
    await executeAutomationAction(action);
  }
}
