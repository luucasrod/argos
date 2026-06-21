export type DeviceCategory =
  | 'lights'
  | 'tv'
  | 'ac'
  | 'outlets'
  | 'cameras'
  | 'sensors'
  | 'speakers'
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
  source?: 'mock' | 'ewelink';
  ewelinkDeviceId?: string;
}
