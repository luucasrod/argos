import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Device } from '@/types/device.types';
import { MOCK_DEVICES } from '@/constants/devices';
import { controlEwelinkDevice, fetchEwelinkDevices } from '@/services/devices/ewelinkService';
import { controlTuyaDevice, fetchTuyaDevices } from '@/services/devices/tuyaService';
import { controlAlexaDevice, fetchAlexaDevices } from '@/services/devices/amazonService';
import { controlWizDevice, fetchWizDevices } from '@/services/devices/wizService';
import { controlWizLocal, scanWizLocal } from '@/services/devices/wizLocalBridgeService';
import { controlTapoDevice, fetchTapoDevices } from '@/services/devices/tapoService';
import { controlXiaomiDevice, fetchXiaomiDevices } from '@/services/devices/xiaomiService';
import { controlChromeDevice, fetchChromeDevices } from '@/services/devices/chromeService';
import { controlXiaomiPetDevice, fetchXiaomiPetDevices } from '@/services/devices/xiaomiPetService';

export interface WizLocalSavedDevice {
  ip: string;
  mac: string;
  name: string;
}

interface DeviceStore {
  devices: Device[];
  ewelinkConnected: boolean;
  tuyaConnected: boolean;
  alexaConnected: boolean;
  wizConnected: boolean;
  tapoConnected: boolean;
  xiaomiConnected: boolean;
  xiaomiPetConnected: boolean;
  chromeConnected: boolean;
  wizLocalConnected: boolean;
  wizLocalBridgeUrl: string;
  wizLocalSavedDevices: WizLocalSavedDevice[];
  customNames: Record<string, string>;
  customOrder: Record<string, number>;
  setDeviceOrder: (orderedIds: string[]) => void;
  renameDevice: (id: string, name: string) => void;
  updateDevice: (id: string, partial: Partial<Device>) => void;
  toggleDevice: (id: string) => void;
  updateDeviceState: (id: string, stateKey: string, value: unknown) => void;
  syncEwelinkDevices: () => Promise<void>;
  syncTuyaDevices: () => Promise<{ count: number }>;
  syncAlexaDevices: () => Promise<{ count: number }>;
  syncWizDevices: () => Promise<{ count: number }>;
  syncTapoDevices: () => Promise<{ count: number }>;
  syncXiaomiDevices: () => Promise<{ count: number }>;
  syncXiaomiPetDevices: () => Promise<{ count: number }>;
  syncChromeDevices: () => Promise<{ count: number }>;
  setWizLocalBridgeUrl: (url: string) => void;
  syncWizLocalDevices: () => Promise<{ count: number }>;
  clearWizLocalDevices: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Remove mocks nas categorias que já têm dispositivos reais de qualquer fonte. Preserva cômodos definidos pelo usuário. */
function rebuildDeviceList(
  current: Device[],
  newFromSource: Device[],
  source: NonNullable<Device['source']>
): Device[] {
  const existingRooms = new Map(current.map((d) => [d.id, d.room]));
  const withoutSource = current.filter((d) => d.source !== source);
  const merged = [
    ...withoutSource,
    ...newFromSource.map((d) => ({
      ...d,
      room: existingRooms.get(d.id) ?? d.room,
    })),
  ];
  const realCats = new Set(merged.filter((d) => d.source !== 'mock').map((d) => d.category));
  return merged.filter((d) => d.source !== 'mock' || !realCats.has(d.category));
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set, get) => ({
  devices: MOCK_DEVICES,
  customNames: {},
  customOrder: {},
  ewelinkConnected: false,
  tuyaConnected: false,
  alexaConnected: false,
  wizConnected: false,
  tapoConnected: false,
  xiaomiConnected: false,
  xiaomiPetConnected: false,
  chromeConnected: false,
  wizLocalConnected: false,
  wizLocalBridgeUrl: '',
  wizLocalSavedDevices: [],

  renameDevice: (id, name) =>
    set((state) => ({
      customNames: { ...state.customNames, [id]: name.trim() },
    })),

  // Recebe a ordem final (arrastar-soltar) de UM grupo (online ou offline) e
  // grava só os índices desses ids — não mexe na ordem do outro grupo.
  setDeviceOrder: (orderedIds) =>
    set((state) => {
      const nextOrder = { ...state.customOrder };
      orderedIds.forEach((id, index) => {
        nextOrder[id] = index;
      });
      return { customOrder: nextOrder };
    }),

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
      controlEwelinkDevice(device.ewelinkDeviceId, { switch: device.isOn ? 'off' : 'on' })
        .catch((err) => {
          if (__DEV__) console.error('[eWeLink] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1200).then(() => get().syncEwelinkDevices()));
    }
    if (device?.source === 'tuya' && device.tuyaDeviceId) {
      controlTuyaDevice(device.tuyaDeviceId, 'isOn', !device.isOn)
        .catch((err) => {
          if (__DEV__) console.error('[Tuya] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1200).then(() => get().syncTuyaDevices()));
    }
    if (device?.source === 'alexa' && device.alexaEntityId && device.alexaEntityType) {
      controlAlexaDevice(device.alexaEntityId, device.alexaEntityType, 'isOn', !device.isOn)
        .catch((err) => {
          if (__DEV__) console.error('[Alexa] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1500).then(() => get().syncAlexaDevices()));
    }
    if (device?.source === 'wiz' && device.wizMac) {
      controlWizDevice(device.wizMac, 'isOn', !device.isOn)
        .catch((err) => {
          if (__DEV__) console.error('[WiZ] Falha ao controlar lâmpada:', err);
        })
        .finally(() => delay(1200).then(() => get().syncWizDevices()));
    }
    if (device?.source === 'tapo' && device.tapoDeviceId && device.tapoAppServerUrl) {
      controlTapoDevice(device.tapoDeviceId, device.tapoAppServerUrl, 'isOn', !device.isOn)
        .catch((err) => {
          if (__DEV__) console.error('[Tapo] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1200).then(() => get().syncTapoDevices()));
    }
    if (device?.source === 'wiz-local' && device.wizLocalIp && device.wizBridgeUrl) {
      controlWizLocal(device.wizBridgeUrl, device.wizLocalIp, { state: !device.isOn })
        .catch((err) => {
          if (__DEV__) console.error('[WiZ Local] Falha ao controlar lâmpada:', err);
        });
    }
    if (device?.source === 'xiaomi' && device.xiaomiDid && device.xiaomiControl?.power) {
      const { siid, piid } = device.xiaomiControl.power;
      controlXiaomiDevice(device.xiaomiDid, siid, piid, !device.isOn)
        .catch((err) => {
          if (__DEV__) console.error('[Xiaomi] Falha ao controlar ventilador:', err);
        })
        .finally(() => delay(1500).then(() => get().syncXiaomiDevices()));
    }
    if (device?.source === 'chrome' && device.chromeDeviceId) {
      controlChromeDevice(device.chromeDeviceId, 'OnOff', { on: !device.isOn })
        .catch((err) => {
          if (__DEV__) console.error('[Chrome] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1500).then(() => get().syncChromeDevices()));
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
        controlEwelinkDevice(device.ewelinkDeviceId, { switch: value ? 'on' : 'off' })
          .catch((err) => {
            if (__DEV__) console.error('[eWeLink] Falha ao controlar dispositivo:', err);
          })
          .finally(() => delay(1200).then(() => get().syncEwelinkDevices()));
      }
    }
    if (device?.source === 'tuya' && device.tuyaDeviceId) {
      const currentColor = stateKey === 'brightness' && typeof device.state?.color === 'string'
        ? device.state.color
        : undefined;
      controlTuyaDevice(device.tuyaDeviceId, stateKey, value, currentColor)
        .catch((err) => {
          if (__DEV__) console.error('[Tuya] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1200).then(() => get().syncTuyaDevices()));
    }
    if (device?.source === 'alexa' && device.alexaEntityId && device.alexaEntityType) {
      controlAlexaDevice(device.alexaEntityId, device.alexaEntityType, stateKey, value)
        .catch((err) => {
          if (__DEV__) console.error('[Alexa] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1500).then(() => get().syncAlexaDevices()));
    }
    if (device?.source === 'wiz' && device.wizMac) {
      controlWizDevice(device.wizMac, stateKey, value)
        .catch((err) => {
          if (__DEV__) console.error('[WiZ] Falha ao controlar lâmpada:', err);
        })
        .finally(() => delay(1200).then(() => get().syncWizDevices()));
    }
    if (device?.source === 'tapo' && device.tapoDeviceId && device.tapoAppServerUrl) {
      controlTapoDevice(device.tapoDeviceId, device.tapoAppServerUrl, stateKey, value)
        .catch((err) => {
          if (__DEV__) console.error('[Tapo] Falha ao controlar dispositivo:', err);
        })
        .finally(() => delay(1200).then(() => get().syncTapoDevices()));
    }
    if (device?.source === 'wiz-local' && device.wizLocalIp && device.wizBridgeUrl) {
      let params: Record<string, unknown> = {};
      if (stateKey === 'isOn') {
        params = { state: Boolean(value) };
      } else if (stateKey === 'brightness' && typeof value === 'number') {
        params = { dimming: Math.max(10, Math.min(100, value)) };
      } else if (stateKey === 'colorTemperature' && typeof value === 'string') {
        params = { temp: value === 'warm' ? 2700 : value === 'neutral' ? 4000 : 6500 };
      } else if (stateKey === 'color' && typeof value === 'string') {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
        if (m) params = { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), dimming: 100 };
      }
      if (Object.keys(params).length > 0) {
        controlWizLocal(device.wizBridgeUrl, device.wizLocalIp, params)
          .catch((err) => {
            if (__DEV__) console.error('[WiZ Local] Falha ao controlar lâmpada:', err);
          });
      }
    }
    if (device?.source === 'xiaomi' && device.xiaomiDid && device.xiaomiControl) {
      const ctrl = device.xiaomiControl;
      if (stateKey === 'isOn' && ctrl.power) {
        controlXiaomiDevice(device.xiaomiDid, ctrl.power.siid, ctrl.power.piid, Boolean(value))
          .catch((err) => {
            if (__DEV__) console.error('[Xiaomi] Falha ao controlar ventilador:', err);
          })
          .finally(() => delay(1500).then(() => get().syncXiaomiDevices()));
      } else if (stateKey === 'speed' && ctrl.speed && typeof value === 'number') {
        const clamped = Math.max(ctrl.speed.min, Math.min(ctrl.speed.max, Math.round(value)));
        controlXiaomiDevice(device.xiaomiDid, ctrl.speed.siid, ctrl.speed.piid, clamped)
          .catch((err) => {
            if (__DEV__) console.error('[Xiaomi] Falha ao ajustar velocidade:', err);
          })
          .finally(() => delay(1500).then(() => get().syncXiaomiDevices()));
      } else if (stateKey === 'swing' && ctrl.swing) {
        controlXiaomiDevice(device.xiaomiDid, ctrl.swing.siid, ctrl.swing.piid, Boolean(value))
          .catch((err) => {
            if (__DEV__) console.error('[Xiaomi] Falha ao ajustar oscilação:', err);
          })
          .finally(() => delay(1500).then(() => get().syncXiaomiDevices()));
      } else if (stateKey === 'angle' && ctrl.angle) {
        const deg = typeof value === 'number' ? value : parseInt(String(value), 10);
        if (!Number.isNaN(deg)) {
          controlXiaomiDevice(device.xiaomiDid, ctrl.angle.siid, ctrl.angle.piid, deg)
            .catch((err) => {
              if (__DEV__) console.error('[Xiaomi] Falha ao ajustar ângulo:', err);
            })
            .finally(() => delay(1500).then(() => get().syncXiaomiDevices()));
        }
      } else if (stateKey === 'mode' && ctrl.mode) {
        const opt = ctrl.mode.options.find((o) => o.label === value);
        if (opt) {
          controlXiaomiDevice(device.xiaomiDid, ctrl.mode.siid, ctrl.mode.piid, opt.value)
            .catch((err) => {
              if (__DEV__) console.error('[Xiaomi] Falha ao ajustar modo:', err);
            })
            .finally(() => delay(1500).then(() => get().syncXiaomiDevices()));
        }
      }
    }
    if (device?.source === 'chrome' && device.chromeDeviceId) {
      if (stateKey === 'isOn') {
        controlChromeDevice(device.chromeDeviceId, 'OnOff', { on: Boolean(value) })
          .catch((err) => {
            if (__DEV__) console.error('[Chrome] Falha ao controlar dispositivo:', err);
          })
          .finally(() => delay(1500).then(() => get().syncChromeDevices()));
      } else if (stateKey === 'brightness' && typeof value === 'number') {
        controlChromeDevice(device.chromeDeviceId, 'BrightnessAbsolute', { brightness: Math.max(0, Math.min(100, value)) })
          .catch((err) => {
            if (__DEV__) console.error('[Chrome] Falha ao ajustar brilho:', err);
          })
          .finally(() => delay(1500).then(() => get().syncChromeDevices()));
      } else if (stateKey === 'colorTemperature' && typeof value === 'string') {
        const tempK = value === 'warm' ? 2700 : value === 'neutral' ? 4000 : 6500;
        controlChromeDevice(device.chromeDeviceId, 'ColorAbsolute', { temperatureK: tempK })
          .catch((err) => {
            if (__DEV__) console.error('[Chrome] Falha ao ajustar temperatura:', err);
          })
          .finally(() => delay(1500).then(() => get().syncChromeDevices()));
      } else if (stateKey === 'temperature' && typeof value === 'number') {
        controlChromeDevice(device.chromeDeviceId, 'ThermostatTemperatureSetpoint', { temperature: Math.max(15, Math.min(30, value)) })
          .catch((err) => {
            if (__DEV__) console.error('[Chrome] Falha ao ajustar temperatura do termostato:', err);
          })
          .finally(() => delay(1500).then(() => get().syncChromeDevices()));
      } else if (stateKey === 'thermostatMode' && typeof value === 'string') {
        controlChromeDevice(device.chromeDeviceId, 'ThermostatSetMode', { mode: value })
          .catch((err) => {
            if (__DEV__) console.error('[Chrome] Falha ao ajustar modo do termostato:', err);
          })
          .finally(() => delay(1500).then(() => get().syncChromeDevices()));
      }
    }
  },

  syncEwelinkDevices: async () => {
    try {
      const { connected, devices } = await fetchEwelinkDevices();
      if (!connected) {
        // Falha/timeout transitório — não mexe na lista (evita ela "piscar"
        // a cada ciclo de 5s só porque essa chamada específica falhou).
        set({ ewelinkConnected: false });
        return;
      }
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
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'ewelink'),
        ewelinkConnected: connected,
      }));
    } catch {
      // Falha silenciosa — mantém estado anterior
    }
  },

  syncTuyaDevices: async () => {
    try {
      const { connected, devices } = await fetchTuyaDevices();
      if (!connected) {
        set({ tuyaConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices.map((d) => ({
        id: `tuya:${d.id}`,
        name: d.name,
        category: 'lights',
        icon: '💡',
        status: (d.online ? 'online' : 'offline') as 'online' | 'offline',
        isOn: d.isOn,
        capabilities: [
          { type: 'toggle' as const, property: 'isOn', label: 'Ligado' },
          ...(d.supportsBrightness
            ? [{ type: 'range' as const, property: 'brightness', label: 'Brilho', min: 1, max: 100, unit: '%' }]
            : []),
          ...(d.supportsColor
            ? [{ type: 'color' as const, property: 'color', label: 'Cor' }]
            : []),
          ...(d.supportsColorTemp
            ? [{ type: 'select' as const, property: 'colorTemperature', label: 'Temperatura', options: ['warm', 'neutral', 'cool'] }]
            : []),
        ],
        state: {
          isOn: d.isOn,
          ...(d.brightness != null ? { brightness: d.brightness } : {}),
          ...(d.color ? { color: d.color } : {}),
          ...(d.colorTemp != null ? { colorTemperature: d.colorTemp } : {}),
        },
        room: 'Casa',
        brand: 'Smart Life',
        source: 'tuya' as const,
        tuyaDeviceId: d.id,
      }));
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'tuya'),
        tuyaConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  syncWizDevices: async () => {
    try {
      const { connected, devices } = await fetchWizDevices();
      if (!connected) {
        set({ wizConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices.map((d) => {
        const typeUp = d.type.toUpperCase();
        const supportsColor = typeUp.includes('COLOR') || typeUp.includes('RGB');
        const supportsBrightness = d.brightness != null || typeUp.includes('DIMMABLE') || supportsColor || typeUp.includes('TW');
        const supportsColorTemp = d.colorTemp != null || typeUp.includes('TW') || typeUp.includes('WHITE');

        return {
          id: `wiz:${d.mac}`,
          name: d.name,
          category: 'lights' as const,
          icon: '💡',
          status: 'online' as const,
          isOn: d.isOn,
          capabilities: [
            { type: 'toggle' as const, property: 'isOn', label: 'Ligado' },
            ...(supportsBrightness
              ? [{ type: 'range' as const, property: 'brightness', label: 'Brilho', min: 10, max: 100, unit: '%' }]
              : []),
            ...(supportsColorTemp
              ? [{ type: 'select' as const, property: 'colorTemperature', label: 'Temperatura', options: ['warm', 'neutral', 'cool'] }]
              : []),
            ...(supportsColor
              ? [{ type: 'color' as const, property: 'color', label: 'Cor' }]
              : []),
          ],
          state: {
            isOn: d.isOn,
            ...(d.brightness != null ? { brightness: d.brightness } : {}),
            ...(d.colorTemp != null ? { colorTemperature: d.colorTemp > 5000 ? 'cool' : d.colorTemp > 3500 ? 'neutral' : 'warm' } : {}),
            ...(d.color ? { color: d.color } : {}),
          },
          room: 'Casa',
          brand: 'Philips WiZ',
          source: 'wiz' as const,
          wizMac: d.mac,
        };
      });
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'wiz'),
        wizConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  syncTapoDevices: async () => {
    try {
      const { connected, devices } = await fetchTapoDevices();
      if (!connected) {
        set({ tapoConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices.map((d) => ({
        id: `tapo:${d.deviceId}`,
        name: d.alias,
        category: 'lights' as const,
        icon: '💡',
        status: (d.status === 1 ? 'online' : 'offline') as 'online' | 'offline',
        isOn: d.isOn,
        capabilities: [
          { type: 'toggle' as const, property: 'isOn', label: 'Ligado' },
          ...(d.supportsBrightness
            ? [{ type: 'range' as const, property: 'brightness', label: 'Brilho', min: 1, max: 100, unit: '%' }]
            : []),
          ...(d.supportsColorTemp
            ? [{ type: 'select' as const, property: 'colorTemperature', label: 'Temperatura', options: ['warm', 'neutral', 'cool'] }]
            : []),
          ...(d.supportsColor
            ? [{ type: 'color' as const, property: 'color', label: 'Cor' }]
            : []),
        ],
        state: {
          isOn: d.isOn,
          ...(d.brightness != null ? { brightness: d.brightness } : {}),
          ...(d.colorTemp != null ? { colorTemperature: d.colorTemp > 5000 ? 'cool' : d.colorTemp > 3500 ? 'neutral' : 'warm' } : {}),
          ...(d.color ? { color: d.color } : {}),
        },
        room: 'Casa',
        brand: 'TP-Link Tapo',
        source: 'tapo' as const,
        tapoDeviceId: d.deviceId,
        tapoAppServerUrl: d.appServerUrl,
      }));
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'tapo'),
        tapoConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  syncXiaomiDevices: async () => {
    try {
      const { connected, devices } = await fetchXiaomiDevices();
      if (!connected) {
        set({ xiaomiConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices.map((d) => ({
        id: `xiaomi:${d.did}`,
        name: d.name,
        category: 'fans' as const,
        icon: '🌀',
        status: (d.isOnline ? 'online' : 'offline') as 'online' | 'offline',
        isOn: d.isOn,
        capabilities: [
          ...(d.power ? [{ type: 'toggle' as const, property: 'isOn', label: 'Ligado' }] : []),
          ...(d.speed
            ? [{ type: 'range' as const, property: 'speed', label: 'Força', min: d.speed.min, max: d.speed.max, unit: '%' }]
            : []),
          ...(d.swing ? [{ type: 'toggle' as const, property: 'swing', label: 'Oscilar' }] : []),
          ...(d.angle
            ? [{ type: 'select' as const, property: 'angle', label: 'Ângulo', options: d.angle.options.map((o) => `${o}°`) }]
            : []),
          ...(d.mode
            ? [{ type: 'select' as const, property: 'mode', label: 'Modo', options: d.mode.options.map((o) => o.label) }]
            : []),
        ],
        state: {
          isOn: d.isOn,
          ...(d.speedValue != null ? { speed: d.speedValue } : {}),
          ...(d.swingValue != null ? { swing: d.swingValue } : {}),
          ...(d.angleValue != null ? { angle: d.angleValue } : {}),
          ...(d.modeValue != null && d.mode
            ? { mode: d.mode.options.find((o) => o.value === d.modeValue)?.label }
            : {}),
        },
        room: 'Casa',
        brand: 'Xiaomi',
        source: 'xiaomi' as const,
        xiaomiDid: d.did,
        xiaomiControl: { power: d.power, speed: d.speed, swing: d.swing, angle: d.angle, mode: d.mode },
      }));
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'xiaomi'),
        xiaomiConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  syncXiaomiPetDevices: async () => {
    try {
      const { connected, devices } = await fetchXiaomiPetDevices();
      if (!connected) {
        set({ xiaomiPetConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices.map((d) => {
        const petIcons: Record<string, string> = {
          'feeder': '🐕',
          'litter-box': '🚽',
          'water-feeder': '💧',
          'other-pet': '🐾',
        };
        const petLabels: Record<string, string> = {
          'feeder': 'Alimentador',
          'litter-box': 'Caixa de Areia',
          'water-feeder': 'Bebedouro',
          'other-pet': 'Acessório Pet',
        };

        const capabilities: Device['capabilities'] = [];
        if (d.power) {
          capabilities.push({ type: 'toggle' as const, property: 'isOn', label: 'Ligado' });
        }
        if (d.feedAmount) {
          capabilities.push({
            type: 'range' as const,
            property: 'feedAmount',
            label: 'Quantidade Ração',
            min: d.feedAmount.min,
            max: d.feedAmount.max,
            unit: 'g',
          });
        }
        if (d.waterLevel) {
          capabilities.push({
            type: 'readonly' as const,
            property: 'waterLevel',
            label: 'Nível de Água',
          });
        }
        if (d.wasteLevel) {
          capabilities.push({
            type: 'readonly' as const,
            property: 'wasteLevel',
            label: 'Nível de Resíduos',
          });
        }
        if (d.cleaningMode) {
          capabilities.push({
            type: 'select' as const,
            property: 'cleaningMode',
            label: 'Modo Limpeza',
            options: d.cleaningMode.options.map((o) => o.label),
          });
        }
        if (d.lightControl) {
          capabilities.push({ type: 'toggle' as const, property: 'lightControl', label: 'Luz' });
        }
        if (d.temperature) {
          capabilities.push({
            type: 'readonly' as const,
            property: 'temperature',
            label: 'Temperatura',
          });
        }

        const state: Record<string, unknown> = { isOn: d.isOn };
        if (d.feedAmountValue != null) state.feedAmount = d.feedAmountValue;
        if (d.waterLevelValue != null) state.waterLevel = d.waterLevelValue;
        if (d.wasteLevelValue != null) state.wasteLevel = d.wasteLevelValue;
        if (d.cleaningModeValue != null && d.cleaningMode) {
          state.cleaningMode = d.cleaningMode.options.find((o) => o.value === d.cleaningModeValue)?.label;
        }
        if (d.lightControlValue != null) state.lightControl = d.lightControlValue;
        if (d.temperatureValue != null) state.temperature = d.temperatureValue;

        return {
          id: `xiaomi-pet:${d.did}`,
          name: d.name,
          category: 'other' as const,
          icon: petIcons[d.deviceType] || '🐾',
          status: (d.isOnline ? 'online' : 'offline') as 'online' | 'offline',
          isOn: d.isOn,
          capabilities,
          state,
          room: 'Casa',
          brand: 'Xiaomi Pet',
          source: 'xiaomi-pet' as const,
          xiaomiPetDid: d.did,
          xiaomiPetType: d.deviceType,
          xiaomiPetControl: {
            power: d.power,
            feedAmount: d.feedAmount,
            feedingSchedule: d.feedingSchedule,
            waterLevel: d.waterLevel,
            wasteLevel: d.wasteLevel,
            cleaningMode: d.cleaningMode,
            lightControl: d.lightControl,
            temperature: d.temperature,
          },
        };
      });
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'xiaomi-pet'),
        xiaomiPetConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  syncAlexaDevices: async () => {
    try {
      const { connected, devices } = await fetchAlexaDevices();
      if (!connected) {
        set({ alexaConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices
        .filter((d) => d.isEnabled)
        .map((d) => {
          const caps = d.capabilities.map((c) => c.toLowerCase());
          const supportsBrightness = caps.some((c) => c.includes('brightness') || c.includes('percentage'));
          const supportsColorTemp = caps.some((c) => c.includes('colortemperature'));
          const supportsColor = caps.some((c) => c.includes('setcolor') || c.includes('color'));
          const isLight =
            supportsColor || supportsBrightness || supportsColorTemp ||
            d.entityType.toLowerCase().includes('light');

          return {
            id: `alexa:${d.entityId}`,
            name: d.friendlyName,
            category: (isLight ? 'lights' : 'outlets') as 'lights' | 'outlets',
            icon: isLight ? '💡' : '🔌',
            status: 'online' as const,
            isOn: false,
            capabilities: [
              { type: 'toggle' as const, property: 'isOn', label: 'Ligado' },
              ...(supportsBrightness
                ? [{ type: 'range' as const, property: 'brightness', label: 'Brilho', min: 1, max: 100, unit: '%' }]
                : []),
              ...(supportsColorTemp
                ? [{ type: 'select' as const, property: 'colorTemperature', label: 'Temperatura', options: ['warm', 'neutral', 'cool'] }]
                : []),
              ...(supportsColor
                ? [{ type: 'color' as const, property: 'color', label: 'Cor' }]
                : []),
            ],
            state: { isOn: false },
            room: 'Casa',
            brand: 'Amazon Alexa',
            source: 'alexa' as const,
            alexaEntityId: d.entityId,
            alexaEntityType: d.entityType,
          };
        });
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'alexa'),
        alexaConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  syncChromeDevices: async () => {
    try {
      const { connected, devices } = await fetchChromeDevices();
      if (!connected) {
        set({ chromeConnected: false });
        return { count: 0 };
      }
      const mapped: Device[] = devices.map((d) => {
        const caps = d.traits ?? [];
        const supportsOnOff = caps.includes('action.devices.traits.OnOff');
        const supportsBrightness = caps.includes('action.devices.traits.Brightness');
        const supportsColorTemp = caps.includes('action.devices.traits.ColorTemperature');
        const supportsThermostat = caps.includes('action.devices.traits.TemperatureSetting');

        const isLight =
          d.type.toLowerCase().includes('light') ||
          supportsBrightness ||
          supportsColorTemp;

        const capabilities: Device['capabilities'] = [];
        if (supportsOnOff) {
          capabilities.push({ type: 'toggle' as const, property: 'isOn', label: 'Ligado' });
        }
        if (supportsBrightness && d.brightness != null) {
          capabilities.push({ type: 'range' as const, property: 'brightness', label: 'Brilho', min: 0, max: 100, unit: '%' });
        }
        if (supportsColorTemp && d.colorTemperature != null) {
          capabilities.push({ type: 'select' as const, property: 'colorTemperature', label: 'Temperatura', options: ['warm', 'neutral', 'cool'] });
        }
        if (supportsThermostat) {
          capabilities.push({ type: 'range' as const, property: 'temperature', label: 'Temperatura', min: 15, max: 30, unit: '°C' });
          capabilities.push({ type: 'select' as const, property: 'thermostatMode', label: 'Modo', options: ['HEAT', 'COOL', 'AUTO', 'OFF'] });
        }

        const state: Record<string, unknown> = { isOn: d.isOn ?? false };
        if (supportsBrightness && d.brightness != null) {
          state.brightness = d.brightness;
        }
        if (supportsColorTemp && d.colorTemperature != null) {
          state.colorTemperature = d.colorTemperature > 5000 ? 'cool' : d.colorTemperature > 3500 ? 'neutral' : 'warm';
        }
        if (supportsThermostat) {
          if (d.thermostatTemperatureSetpoint != null) {
            state.temperature = d.thermostatTemperatureSetpoint;
          }
          if (d.thermostatMode) {
            state.thermostatMode = d.thermostatMode;
          }
        }

        return {
          id: `chrome:${d.id}`,
          name: d.name,
          category: (isLight ? 'lights' : 'outlets') as 'lights' | 'outlets',
          icon: isLight ? '💡' : supportsThermostat ? '🌡️' : '🔌',
          status: (d.isOnline ? 'online' : 'offline') as 'online' | 'offline',
          isOn: d.isOn ?? false,
          capabilities,
          state,
          room: d.roomHint || 'Casa',
          brand: 'Google Home',
          source: 'chrome' as const,
          chromeDeviceId: d.id,
          chromeDeviceType: d.type,
          chromeTraits: d.traits,
        };
      });
      set((state) => ({
        devices: rebuildDeviceList(state.devices, mapped, 'chrome'),
        chromeConnected: true,
      }));
      return { count: mapped.length };
    } catch {
      return { count: 0 };
    }
  },

  setWizLocalBridgeUrl: (url) => {
    set({ wizLocalBridgeUrl: url });
  },

  syncWizLocalDevices: async () => {
    const { wizLocalBridgeUrl, wizLocalSavedDevices } = get();

    let deviceInfos: WizLocalSavedDevice[] = wizLocalSavedDevices;

    if (wizLocalBridgeUrl) {
      try {
        const found = await scanWizLocal(wizLocalBridgeUrl);
        if (found.length > 0) {
          deviceInfos = found.map((f) => {
            const existing = wizLocalSavedDevices.find(
              (s) => s.mac === f.mac || s.ip === f.ip
            );
            return {
              ip: f.ip,
              mac: f.mac,
              name: existing?.name ?? `WiZ ${f.ip.split('.').pop() ?? f.ip}`,
            };
          });
          set({ wizLocalSavedDevices: deviceInfos });
        }
      } catch {
        // bridge não disponível — usa dados guardados
      }
    }

    if (deviceInfos.length === 0) {
      set({ wizLocalConnected: false });
      return { count: 0 };
    }

    const bridgeUrl = wizLocalBridgeUrl;
    const mapped: Device[] = deviceInfos.map((d) => ({
      id: `wiz-local:${d.mac || d.ip}`,
      name: d.name,
      category: 'lights' as const,
      icon: '💡',
      status: 'online' as const,
      isOn: false,
      capabilities: [
        { type: 'toggle' as const, property: 'isOn', label: 'Ligado' },
        { type: 'range' as const, property: 'brightness', label: 'Brilho', min: 10, max: 100, unit: '%' },
        { type: 'color' as const, property: 'color', label: 'Cor' },
        {
          type: 'select' as const,
          property: 'colorTemperature',
          label: 'Temperatura',
          options: ['warm', 'neutral', 'cool'],
        },
      ],
      state: { isOn: false, brightness: 100 },
      room: 'Casa',
      brand: 'WiZ Local',
      source: 'wiz-local' as const,
      wizLocalIp: d.ip,
      wizBridgeUrl: bridgeUrl,
    }));

    set((state) => ({
      devices: rebuildDeviceList(state.devices, mapped, 'wiz-local'),
      wizLocalConnected: true,
    }));

    return { count: mapped.length };
  },

  clearWizLocalDevices: () => {
    set((state) => ({
      devices: state.devices.filter((d) => d.source !== 'wiz-local'),
      wizLocalConnected: false,
      wizLocalSavedDevices: [],
    }));
  },
}),
    {
      name: 'argos-connections',
      // No React Native não existe `localStorage`: o fallback antigo era um `{}`
      // sem setItem/getItem, então o persist do zustand lançava TypeError DEPOIS
      // de aplicar o estado — abortando toggleDevice/updateDeviceState antes de
      // chegar na chamada de controle do dispositivo, congelando o status em
      // 'executing' e derrubando o app com exceção fatal. AsyncStorage já é
      // dependência linkada e é o que as outras stores usam.
      // No web o AsyncStorage é implementado sobre window.localStorage com a
      // mesma chave, então um caminho único serve para as duas plataformas.
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        devices: state.devices,
        ewelinkConnected: state.ewelinkConnected,
        tuyaConnected: state.tuyaConnected,
        alexaConnected: state.alexaConnected,
        wizConnected: state.wizConnected,
        tapoConnected: state.tapoConnected,
        xiaomiConnected: state.xiaomiConnected,
        xiaomiPetConnected: state.xiaomiPetConnected,
        chromeConnected: state.chromeConnected,
        wizLocalConnected: state.wizLocalConnected,
        wizLocalBridgeUrl: state.wizLocalBridgeUrl,
        wizLocalSavedDevices: state.wizLocalSavedDevices,
        customNames: state.customNames,
        customOrder: state.customOrder,
      }),
    }
  )
);
