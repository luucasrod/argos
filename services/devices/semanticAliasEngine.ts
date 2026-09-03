import type { Routine } from '@/types/automation.types';
import type { RegisteredDevice } from './deviceRegistry';
import type { Room } from './roomRegistry';

export type SemanticAliasEntityType = 'device' | 'room' | 'routine' | 'person';

export interface SemanticAliasEntity {
  id: string;
  type: SemanticAliasEntityType;
  name: string;
  /** Aliases nesta camada são sempre confirmados pelo usuário ou importados de fonte canônica. */
  aliases: string[];
}

export type SemanticAliasResolution =
  | {
      status: 'resolved';
      entity: SemanticAliasEntity;
      matchedBy: 'id' | 'name' | 'alias';
      matchedValue: string;
    }
  | {
      status: 'ambiguous';
      candidates: SemanticAliasEntity[];
      clarification: string;
    }
  | {
      status: 'not_found';
      reference: string;
    };

export interface ConfirmAliasResult {
  entity: SemanticAliasEntity;
  collisions: SemanticAliasEntity[];
}

export function normalizeSemanticAlias(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueAliases(values: readonly string[], canonicalName: string): string[] {
  const canonical = normalizeSemanticAlias(canonicalName);
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeSemanticAlias(trimmed);
    if (!key || key === canonical || seen.has(key)) continue;
    seen.add(key);
    aliases.push(trimmed);
  }
  return aliases;
}

function cloneEntity(entity: SemanticAliasEntity): SemanticAliasEntity {
  return { ...entity, aliases: [...entity.aliases] };
}

export class SemanticAliasEngine {
  private readonly entities = new Map<string, SemanticAliasEntity>();

  constructor(entities: readonly SemanticAliasEntity[] = []) {
    for (const entity of entities) this.upsert(entity);
  }

  upsert(entity: SemanticAliasEntity): SemanticAliasEntity {
    const id = entity.id.trim();
    const name = entity.name.trim();
    if (!id || !name) throw new Error('Alias entity precisa de id e name');
    const normalized: SemanticAliasEntity = {
      id,
      type: entity.type,
      name,
      aliases: uniqueAliases(entity.aliases, name),
    };
    this.entities.set(this.key(normalized.type, id), normalized);
    return cloneEntity(normalized);
  }

  remove(type: SemanticAliasEntityType, id: string): void {
    this.entities.delete(this.key(type, id));
  }

  confirmAlias(
    type: SemanticAliasEntityType,
    entityId: string,
    alias: string
  ): ConfirmAliasResult {
    const key = this.key(type, entityId);
    const entity = this.entities.get(key);
    if (!entity) throw new Error(`Entidade não encontrada: ${type}:${entityId}`);
    const trimmed = alias.trim();
    if (!normalizeSemanticAlias(trimmed)) throw new Error('Alias não pode ser vazio');
    entity.aliases = uniqueAliases([...entity.aliases, trimmed], entity.name);
    const collisions = this.findMatches(trimmed, type)
      .filter((candidate) => candidate.id !== entity.id)
      .map(cloneEntity);
    return { entity: cloneEntity(entity), collisions };
  }

  resolve(reference: string, type?: SemanticAliasEntityType): SemanticAliasResolution {
    const matches = this.findMatches(reference, type);
    if (matches.length === 0) return { status: 'not_found', reference: reference.trim() };
    if (matches.length > 1) {
      const candidates = matches.map(cloneEntity);
      return {
        status: 'ambiguous',
        candidates,
        clarification: `Encontrei mais de um alvo chamado "${reference.trim()}": ${candidates
          .map((candidate) => candidate.name)
          .join(', ')}. Qual deles você quis dizer?`,
      };
    }
    const entity = matches[0];
    const normalized = normalizeSemanticAlias(reference);
    const matchedBy = normalizeSemanticAlias(entity.id) === normalized
      ? 'id'
      : normalizeSemanticAlias(entity.name) === normalized ? 'name' : 'alias';
    const matchedValue = matchedBy === 'alias'
      ? entity.aliases.find((alias) => normalizeSemanticAlias(alias) === normalized) ?? reference
      : matchedBy === 'id' ? entity.id : entity.name;
    return { status: 'resolved', entity: cloneEntity(entity), matchedBy, matchedValue };
  }

  list(type?: SemanticAliasEntityType): SemanticAliasEntity[] {
    return [...this.entities.values()]
      .filter((entity) => !type || entity.type === type)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneEntity);
  }

  private findMatches(reference: string, type?: SemanticAliasEntityType): SemanticAliasEntity[] {
    const normalized = normalizeSemanticAlias(reference);
    if (!normalized) return [];
    return [...this.entities.values()]
      .filter((entity) => !type || entity.type === type)
      .filter((entity) => [entity.id, entity.name, ...entity.aliases]
        .some((candidate) => normalizeSemanticAlias(candidate) === normalized))
      .sort((left, right) =>
        left.type.localeCompare(right.type) || left.id.localeCompare(right.id)
      );
  }

  private key(type: SemanticAliasEntityType, id: string): string {
    return `${type}\u0000${id}`;
  }
}

export function deviceAliasEntity(device: RegisteredDevice): SemanticAliasEntity {
  return { id: device.id, type: 'device', name: device.name, aliases: [...device.aliases] };
}

export function roomAliasEntity(room: Room): SemanticAliasEntity {
  return { id: room.id, type: 'room', name: room.name, aliases: [...room.aliases] };
}

export function routineAliasEntity(routine: Routine, aliases: string[] = []): SemanticAliasEntity {
  return { id: routine.id, type: 'routine', name: routine.name, aliases: [...aliases] };
}

export function personAliasEntity(
  id: string,
  name: string,
  aliases: string[] = []
): SemanticAliasEntity {
  return { id, type: 'person', name, aliases: [...aliases] };
}
