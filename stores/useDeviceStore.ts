import { create } from 'zustand';
import { Device } from '@/types/device.types';
import { MOCK_DEVICES } from '@/constants/devices';
import { controlEwelinkDevice, fetchEwelinkDevices } from '@/services/devices/ewelinkService';

interface DeviceStore {
  devices: Device[];
  ewelinkConnected: boolean;
  updateDevice: (id: string, partial: Partial<Device>) => void;
  toggleDevice: (id: string) => void;
  updateDeviceState: (id: string, stateKey: string, value: unknown) => void;
  syncEwelinkDevices: () => Promise<void>;
}

export const useDeviceStore = create<DeviceStore>()((set, get) => ({
  devices: MOCK_DEVICES,
  ewelinkConnected: false,

  updateDevice: (id, partial) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, ...partial } : d)),
    })),

  toggleDevice: (id) => {
    const device = get().devices.find((d) => d.id === id);
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, isOn: !d.isOn } : d)),
    }));
    if (device?.source === 'ewelink' && device.ewelinkDeviceId) {
      controlEwelinkDevice(device.ewelinkDeviceId, { switch: device.isOn ? 'off' : 'on' }).catch((err) => {
        if (__DEV__) console.error('[eWeLink] Falha ao controlar dispositivo:', err);
      });
    }
  },

  updateDeviceState: (id, stateKey, value) => {
    const device = get().devices.find((d) => d.id === id);
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, state: { ...d.state, [stateKey]: value } } : d
      ),
    }));
    if (device?.source === 'ewelink' && device.ewelinkDeviceId) {
      if (stateKey === 'isOn') {
        controlEwelinkDevice(device.ewelinkDeviceId, { switch: value ? 'on' : 'off' }).catch((err) => {
          if (__DEV__) console.error('[eWeLink] Falha ao controlar dispositivo:', err);
        });
      }
    }
  },

  syncEwelinkDevices: async () => {
    try {
      const { connected, devices } = await fetchEwelinkDevices();
      set((state) => {
        const mapped: Device[] = devices.map((ed) => ({
          id: `ewelink:${ed.deviceid}`,
          name: ed.name,
          category: 'outlets',
          icon: '🔌',
          status: ed.online ? 'online' : 'offline',
          isOn: ed.isOn,
          capabilities: [{ type: 'toggle', property: 'isOn', label: 'Ligado' }],
          state: { isOn: ed.isOn },
          room: 'Casa',
          brand: 'eWeLink',
          source: 'ewelink',
          ewelinkDeviceId: ed.deviceid,
        }));

        // Categorias com pelo menos um dispositivo real conectado: os mocks
        // dessas categorias somem para não haver dois cards "iguais" na tela
        // (ex.: tomada mock vs. tomada real) e o usuário nunca controlar o card errado.
        const realCategories = new Set(mapped.map((d) => d.category));
        const remainingMocks = state.devices.filter(
          (d) => d.source !== 'ewelink' && !realCategories.has(d.category)
        );

        return { devices: [...remainingMocks, ...mapped], ewelinkConnected: connected };
      });
    } catch {
      // Falha silenciosa — mantém estado anterior
    }
  },
}));
