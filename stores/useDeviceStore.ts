import { create } from 'zustand';
import { Device } from '@/types/device.types';
import { MOCK_DEVICES } from '@/constants/devices';

interface DeviceStore {
  devices: Device[];
  updateDevice: (id: string, partial: Partial<Device>) => void;
  toggleDevice: (id: string) => void;
  updateDeviceState: (id: string, stateKey: string, value: unknown) => void;
}

export const useDeviceStore = create<DeviceStore>()((set) => ({
  devices: MOCK_DEVICES,
  updateDevice: (id, partial) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, ...partial } : d)),
    })),
  toggleDevice: (id) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, isOn: !d.isOn } : d)),
    })),
  updateDeviceState: (id, stateKey, value) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === id ? { ...d, state: { ...d.state, [stateKey]: value } } : d
      ),
    })),
}));
