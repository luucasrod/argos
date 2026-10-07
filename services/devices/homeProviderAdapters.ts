/**
 * Adapters concretos que registram cada integração no homeProvider registry.
 * Importar uma vez na inicialização do app para que os providers fiquem
 * disponíveis via resolveProvider() / executeHomeCommand().
 *
 * Cada adapter delega para o serviço nativo correspondente (ewelinkService,
 * tuyaService, wizService) sem duplicar lógica.
 */
import { controlEwelinkDevice } from '@/services/devices/ewelinkService';
import { controlTuyaDevice } from '@/services/devices/tuyaService';
import { controlWizDevice } from '@/services/devices/wizService';
import { registerProvider } from './homeProvider';
import type { Device } from '@/types/device.types';

function hasEwelink(device: Device): boolean {
  return !!(device as Device & { ewelinkDeviceId?: string }).ewelinkDeviceId;
}

function hasTuya(device: Device): boolean {
  return !!(device as Device & { tuyaDeviceId?: string }).tuyaDeviceId;
}

function hasWiz(device: Device): boolean {
  return !!(device as Device & { wizMac?: string }).wizMac;
}

registerProvider({
  id: 'ewelink',
  label: 'eWeLink',
  handles: hasEwelink,
  transport: async (device, property, value) => {
    const d = device as Device & { ewelinkDeviceId: string };
    const params =
      property === 'isOn'
        ? { switch: value ? 'on' : 'off' }
        : { [property]: value };
    await controlEwelinkDevice(d.ewelinkDeviceId, params);
  },
});

registerProvider({
  id: 'tuya',
  label: 'Tuya',
  handles: hasTuya,
  transport: async (device, property, value) => {
    const d = device as Device & { tuyaDeviceId: string; state?: Record<string, unknown> };
    const currentColor = typeof d.state?.color === 'string' ? d.state.color : undefined;
    await controlTuyaDevice(d.tuyaDeviceId, property, value, currentColor);
  },
});

registerProvider({
  id: 'wiz',
  label: 'WiZ',
  handles: hasWiz,
  transport: async (device, property, value) => {
    const d = device as Device & { wizMac: string };
    await controlWizDevice(d.wizMac, property, value);
  },
});
