import type { Device } from '@/types/device.types';

/** Identificador estável do adapter; não é limitado à lista legada de marcas. */
export type DeviceProvider = string;

export interface RegisteredDevice extends Device {
  provider: DeviceProvider;
  nativeId: string;
  roomId: string | null;
  aliases: string[];
  online: boolean;
  metadata: Record<string, unknown>;
}

export type DiscoveredDevice = Device & Partial<Pick<
  RegisteredDevice,
  'provider' | 'nativeId' | 'roomId' | 'aliases' | 'online' | 'metadata'
>>;

export interface DeviceAdapter<TDiscovered> {
  provider: DeviceProvider;
  discover: () => Promise<readonly TDiscovered[]>;
  importDevice: (device: TDiscovered) => DiscoveredDevice;
}

export interface CloudDeviceSnapshot {
  id: string;
  provider: DeviceProvider;
  nativeId: string;
  name: string;
  roomId: string | null;
  aliases: string[];
  capabilities: Device['capabilities'];
  online: boolean;
}

function uniqueNames(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase('pt-BR');
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function deviceRegistryId(provider: DeviceProvider, nativeId: string): string {
  return `${provider}:${nativeId}`;
}

function nativeIdFromStableId(id: string, provider: DeviceProvider): string {
  const prefix = `${provider}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

export function registerDevice(device: DiscoveredDevice): RegisteredDevice {
  const provider = device.provider ?? device.source ?? 'mock';
  const nativeId = device.nativeId ?? nativeIdFromStableId(device.id, provider);
  if (!nativeId.trim()) throw new Error(`Device ${device.id} não tem nativeId válido`);

  return {
    ...device,
    id: device.id,
    provider,
    nativeId,
    roomId: device.roomId ?? device.room ?? null,
    aliases: uniqueNames(device.aliases ?? []),
    online: device.online ?? device.status === 'online',
    metadata: { ...(device.metadata ?? {}) },
  };
}

/** Importa discovery sem conhecer payloads ou regras de nenhuma marca. */
export async function discoverFromAdapter<TDiscovered>(
  adapter: DeviceAdapter<TDiscovered>
): Promise<RegisteredDevice[]> {
  const discovered = await adapter.discover();
  return discovered.map((item) => registerDevice({
    ...adapter.importDevice(item),
    provider: adapter.provider,
  }));
}

/** Substitui a visão de um provider e preserva dados definidos pelo usuário. */
export function replaceProviderDevices(
  current: readonly RegisteredDevice[],
  discovered: readonly DiscoveredDevice[],
  provider: DeviceProvider
): RegisteredDevice[] {
  const fresh = discovered.map((device) => registerDevice({ ...device, provider }));
  const freshById = new Map(fresh.map((device) => [device.id, device]));
  const merged: RegisteredDevice[] = [];
  const placed = new Set<string>();

  for (const existing of current) {
    if (existing.provider !== provider) {
      merged.push(existing);
      continue;
    }
    const next = freshById.get(existing.id);
    if (!next) continue;
    merged.push({
      ...next,
      name: existing.name,
      room: existing.room,
      roomId: existing.roomId,
      aliases: uniqueNames([...existing.aliases, ...next.aliases]),
      metadata: { ...existing.metadata, ...next.metadata },
      nativeId: existing.nativeId,
      id: existing.id,
    });
    placed.add(existing.id);
  }

  for (const device of fresh) {
    if (!placed.has(device.id)) merged.push(device);
  }

  const realCategories = new Set(
    merged.filter((device) => device.provider !== 'mock').map((device) => device.category)
  );
  return merged.filter(
    (device) => device.provider !== 'mock' || !realCategories.has(device.category)
  );
}

/** Exclui state e metadata, que podem conter valores voláteis ou credenciais. */
export function toCloudDeviceSnapshot(device: RegisteredDevice): CloudDeviceSnapshot {
  return {
    id: device.id,
    provider: device.provider,
    nativeId: device.nativeId,
    name: device.name,
    roomId: device.roomId,
    aliases: [...device.aliases],
    capabilities: device.capabilities.map((capability) => ({
      ...capability,
      options: capability.options ? [...capability.options] : undefined,
    })),
    online: device.online,
  };
}
