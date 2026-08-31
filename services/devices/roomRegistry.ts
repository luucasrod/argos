export interface Room {
  id: string;
  name: string;
  aliases: string[];
}

export interface Zone {
  id: string;
  name: string;
  aliases: string[];
  roomIds: string[];
}

export interface ResolveRoomOptions {
  currentRoomId?: string | null;
}

const CONTEXTUAL_ROOM_ALIASES = new Set(['aqui', 'neste comodo', 'nesta divisao']);

export function normalizeLocationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueNames(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.reduce<string[]>((result, value) => {
    const trimmed = value.trim();
    const key = normalizeLocationName(trimmed);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
    return result;
  }, []);
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createRoom(room: Room): Room {
  const id = room.id.trim();
  const name = room.name.trim();
  if (!id || !name) throw new Error('Room precisa de id e nome');
  return { id, name, aliases: uniqueNames(room.aliases) };
}

export function createZone(zone: Zone, rooms: readonly Room[]): Zone {
  const id = zone.id.trim();
  const name = zone.name.trim();
  if (!id || !name) throw new Error('Zone precisa de id e nome');

  const knownRoomIds = new Set(rooms.map((room) => room.id));
  const roomIds = uniqueIds(zone.roomIds);
  const unknownRoomId = roomIds.find((roomId) => !knownRoomIds.has(roomId));
  if (unknownRoomId) throw new Error(`Room desconhecido na zona ${id}: ${unknownRoomId}`);

  return { id, name, aliases: uniqueNames(zone.aliases), roomIds };
}

function resolveLocationId<T extends { id: string; name: string; aliases: string[] }>(
  reference: string,
  locations: readonly T[]
): string | null {
  const key = normalizeLocationName(reference);
  if (!key) return null;

  // Ordenar pelo id torna colisões de alias previsíveis, independentemente da
  // ordem em que integrações ou dados persistidos foram carregados.
  const matches = locations
    .filter((location) => [location.id, location.name, ...location.aliases]
      .some((candidate) => normalizeLocationName(candidate) === key))
    .map((location) => location.id)
    .sort((left, right) => left.localeCompare(right));

  return matches[0] ?? null;
}

export function resolveRoomId(
  reference: string,
  rooms: readonly Room[],
  options: ResolveRoomOptions = {}
): string | null {
  const key = normalizeLocationName(reference);
  if (CONTEXTUAL_ROOM_ALIASES.has(key)) {
    return options.currentRoomId && rooms.some((room) => room.id === options.currentRoomId)
      ? options.currentRoomId
      : null;
  }
  return resolveLocationId(reference, rooms);
}

export function resolveZoneId(reference: string, zones: readonly Zone[]): string | null {
  return resolveLocationId(reference, zones);
}

export function roomIdsForZone(zoneId: string, zones: readonly Zone[]): string[] {
  return [...(zones.find((zone) => zone.id === zoneId)?.roomIds ?? [])];
}
