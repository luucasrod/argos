import type { Device, DeviceCapability } from '@/types/device.types';

export type SemanticCapability =
  | 'onOff'
  | 'brightness'
  | 'color'
  | 'temperature'
  | 'lock'
  | 'mediaPlay'
  | 'volume'
  | 'sensorRead';

export interface CapabilityCommand {
  capability: SemanticCapability;
  value?: unknown;
}

export interface SemanticCapabilityState {
  capability: SemanticCapability;
  property: string;
  label: string;
  value: unknown;
  writable: boolean;
  min?: number;
  max?: number;
  options?: string[];
  unit?: string;
}

export type CapabilityTransport = (
  device: Device,
  property: string,
  value: unknown
) => Promise<void>;

const PROPERTY_BY_CAPABILITY: Record<SemanticCapability, readonly string[]> = {
  onOff: ['isOn', 'onOff', 'power'],
  brightness: ['brightness'],
  color: ['color'],
  temperature: ['temperature', 'colorTemperature'],
  lock: ['locked', 'lock'],
  mediaPlay: ['mediaPlay', 'playback'],
  volume: ['volume'],
  sensorRead: ['sensorRead'],
};

export class UnsupportedCapabilityError extends Error {
  readonly code = 'UNSUPPORTED_CAPABILITY';

  constructor(deviceId: string, capability: SemanticCapability) {
    super(`Device ${deviceId} nao suporta a capability ${capability}`);
    this.name = 'UnsupportedCapabilityError';
  }
}

export class InvalidCapabilityValueError extends Error {
  readonly code = 'INVALID_CAPABILITY_VALUE';

  constructor(capability: SemanticCapability, detail: string) {
    super(`Valor invalido para ${capability}: ${detail}`);
    this.name = 'InvalidCapabilityValueError';
  }
}

function declaredCapability(
  device: Device,
  semantic: SemanticCapability
): DeviceCapability | null {
  const properties = PROPERTY_BY_CAPABILITY[semantic];
  return device.capabilities.find((capability) => properties.includes(capability.property)) ?? null;
}

function validateValue(
  semantic: SemanticCapability,
  capability: DeviceCapability,
  value: unknown
): void {
  if (capability.type === 'readonly') {
    throw new InvalidCapabilityValueError(semantic, 'capability somente leitura');
  }
  if (capability.type === 'toggle' && typeof value !== 'boolean') {
    throw new InvalidCapabilityValueError(semantic, 'esperado boolean');
  }
  if (capability.type === 'range') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new InvalidCapabilityValueError(semantic, 'esperado numero finito');
    }
    if (capability.min !== undefined && value < capability.min) {
      throw new InvalidCapabilityValueError(semantic, `minimo ${capability.min}`);
    }
    if (capability.max !== undefined && value > capability.max) {
      throw new InvalidCapabilityValueError(semantic, `maximo ${capability.max}`);
    }
  }
  if (capability.type === 'select' && (
    typeof value !== 'string' || !capability.options?.includes(value)
  )) {
    throw new InvalidCapabilityValueError(
      semantic,
      `opcoes: ${(capability.options ?? []).join(', ')}`
    );
  }
  if (capability.type === 'color' && typeof value !== 'string') {
    throw new InvalidCapabilityValueError(semantic, 'esperado cor em texto');
  }
}

export function capabilityState(
  device: Device,
  semantic: SemanticCapability
): SemanticCapabilityState | null {
  const capability = declaredCapability(device, semantic);
  if (!capability) return null;
  return {
    capability: semantic,
    property: capability.property,
    label: capability.label,
    value: device.state[capability.property],
    writable: capability.type !== 'readonly',
    min: capability.min,
    max: capability.max,
    options: capability.options ? [...capability.options] : undefined,
    unit: capability.unit,
  };
}

export async function executeCapability(
  device: Device,
  command: CapabilityCommand,
  transport: CapabilityTransport
): Promise<void> {
  const capability = declaredCapability(device, command.capability);
  if (!capability) throw new UnsupportedCapabilityError(device.id, command.capability);
  validateValue(command.capability, capability, command.value);
  await transport(device, capability.property, command.value);
}
