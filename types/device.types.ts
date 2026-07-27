export type DeviceCategory =
  | 'lights'
  | 'tv'
  | 'ac'
  | 'fans'
  | 'outlets'
  | 'cameras'
  | 'sensors'
  | 'speakers'
  | 'thermostat'
  | 'other';

export type DeviceStatus = 'online' | 'offline' | 'error';

export interface DeviceCapability {
  type: 'toggle' | 'range' | 'color' | 'select' | 'readonly';
  property: string;
  label: string;
  min?: number;
  max?: number;
  options?: string[];
  unit?: string;
}

export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  icon: string;
  status: DeviceStatus;
  isOn: boolean;
  capabilities: DeviceCapability[];
  state: Record<string, unknown>;
  room: string;
  brand: string;
  lastSeen?: Date;
  source?: 'mock' | 'ewelink' | 'tuya' | 'alexa' | 'wiz' | 'wiz-local' | 'tapo' | 'xiaomi' | 'chrome';
  ewelinkDeviceId?: string;
  tuyaDeviceId?: string;
  alexaEntityId?: string;
  alexaEntityType?: string;
  wizMac?: string;
  wizLocalIp?: string;
  wizBridgeUrl?: string;
  tapoDeviceId?: string;
  tapoAppServerUrl?: string;
  xiaomiDid?: string;
  xiaomiControl?: {
    power?: { siid: number; piid: number };
    speed?: { siid: number; piid: number; min: number; max: number };
    swing?: { siid: number; piid: number };
    angle?: { siid: number; piid: number; options: number[] };
    mode?: { siid: number; piid: number; options: Array<{ value: number; label: string }> };
  };
  chromeDeviceId?: string;
  chromeDeviceType?: string;
  chromeTraits?: string[];
}
