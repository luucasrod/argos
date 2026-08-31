/** Current wire protocol. Breaking changes must increment this value. */
export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CommandOriginKind = 'app' | 'home' | 'cloud' | 'automation' | 'integration';
export type CommandRoute = 'local' | 'cloud';
export type CommandStatus = 'accepted' | 'rejected' | 'completed' | 'failed';
export type DeviceAvailability = 'online' | 'offline' | 'unknown' | 'error';
export type PresenceConfidence = 'low' | 'medium' | 'high';

/** Identifies where a command was created, without coupling it to a vendor. */
export interface CommandOrigin {
  kind: CommandOriginKind;
  id: string;
}

/** A target can be one device, a room, or the whole home. */
export type CommandTarget =
  | { kind: 'device'; deviceId: string }
  | { kind: 'room'; roomId: string }
  | { kind: 'home'; homeId: string };

export interface CommandRequest {
  protocolVersion: ProtocolVersion;
  /** Stable across retries. Receivers use it as the idempotency key. */
  commandId: string;
  /** ISO-8601 timestamp created by the command origin. */
  timestamp: string;
  origin: CommandOrigin;
  target: CommandTarget;
  /** Vendor-neutral intent, e.g. device.set, routine.run, or query.state. */
  intent: string;
  parameters: Record<string, JsonValue>;
  /** Connects related messages and may span more than one command. */
  correlationId: string;
}

export interface CommandAck {
  protocolVersion: ProtocolVersion;
  commandId: string;
  correlationId: string;
  timestamp: string;
  status: 'accepted' | 'rejected';
  route: CommandRoute;
  error?: ErrorEnvelope;
}

export interface CommandResult {
  protocolVersion: ProtocolVersion;
  commandId: string;
  correlationId: string;
  timestamp: string;
  status: 'completed' | 'failed';
  route: CommandRoute;
  output?: Record<string, JsonValue>;
  error?: ErrorEnvelope;
}

/** Portable device snapshot; vendor-specific details stay inside state. */
export interface DeviceState {
  protocolVersion: ProtocolVersion;
  deviceId: string;
  timestamp: string;
  availability: DeviceAvailability;
  roomId?: string;
  state: Record<string, JsonValue>;
  correlationId?: string;
}

/** A hint is evidence, not an authoritative statement that somebody is present. */
export interface PresenceHint {
  protocolVersion: ProtocolVersion;
  hintId: string;
  timestamp: string;
  origin: CommandOrigin;
  roomId: string;
  present: boolean;
  confidence: PresenceConfidence;
  expiresAt?: string;
  correlationId?: string;
}

export type ErrorCode =
  | 'INCOMPATIBLE_PROTOCOL_VERSION'
  | 'INVALID_ENVELOPE'
  | 'INVALID_COMMAND'
  | 'COMMAND_REJECTED'
  | 'COMMAND_FAILED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

export interface ErrorEnvelope {
  protocolVersion: ProtocolVersion;
  code: ErrorCode;
  message: string;
  timestamp: string;
  correlationId?: string;
  commandId?: string;
  retryable: boolean;
  details?: Record<string, JsonValue>;
}

export class ProtocolError extends Error {
  readonly envelope: ErrorEnvelope;

  constructor(envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = 'ProtocolError';
    this.envelope = envelope;
  }
}

type ObjectValue = Record<string, unknown>;
type Validator<T> = (value: unknown) => value is T;

const isObject = (value: unknown): value is ObjectValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isTimestamp = (value: unknown): value is string =>
  isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
const isStringIn = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.includes(value as T);

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
}

const isJsonRecord = (value: unknown): value is Record<string, JsonValue> =>
  isObject(value) && Object.values(value).every(isJsonValue);
const isProtocolVersion = (value: unknown): value is ProtocolVersion => value === PROTOCOL_VERSION;
const hasBase = (value: ObjectValue): boolean =>
  isProtocolVersion(value.protocolVersion) && isTimestamp(value.timestamp);

const isCommandOrigin = (value: unknown): value is CommandOrigin =>
  isObject(value) &&
  isStringIn(value.kind, ['app', 'home', 'cloud', 'automation', 'integration']) &&
  isNonEmptyString(value.id);

const isCommandTarget = (value: unknown): value is CommandTarget => {
  if (!isObject(value)) return false;
  if (value.kind === 'device') return isNonEmptyString(value.deviceId);
  if (value.kind === 'room') return isNonEmptyString(value.roomId);
  if (value.kind === 'home') return isNonEmptyString(value.homeId);
  return false;
};

export const isErrorEnvelope: Validator<ErrorEnvelope> = (value): value is ErrorEnvelope =>
  isObject(value) &&
  hasBase(value) &&
  isStringIn(value.code, [
    'INCOMPATIBLE_PROTOCOL_VERSION', 'INVALID_ENVELOPE', 'INVALID_COMMAND',
    'COMMAND_REJECTED', 'COMMAND_FAILED', 'NOT_FOUND', 'UNAVAILABLE',
    'TIMEOUT', 'INTERNAL_ERROR',
  ]) &&
  isNonEmptyString(value.message) &&
  typeof value.retryable === 'boolean' &&
  (value.correlationId === undefined || isNonEmptyString(value.correlationId)) &&
  (value.commandId === undefined || isNonEmptyString(value.commandId)) &&
  (value.details === undefined || isJsonRecord(value.details));

export const isCommandRequest: Validator<CommandRequest> = (value): value is CommandRequest =>
  isObject(value) &&
  hasBase(value) &&
  isNonEmptyString(value.commandId) &&
  isCommandOrigin(value.origin) &&
  isCommandTarget(value.target) &&
  isNonEmptyString(value.intent) &&
  isJsonRecord(value.parameters) &&
  isNonEmptyString(value.correlationId);

export const isCommandAck: Validator<CommandAck> = (value): value is CommandAck =>
  isObject(value) &&
  hasBase(value) &&
  isNonEmptyString(value.commandId) &&
  isNonEmptyString(value.correlationId) &&
  isStringIn(value.status, ['accepted', 'rejected']) &&
  isStringIn(value.route, ['local', 'cloud']) &&
  (value.error === undefined || isErrorEnvelope(value.error)) &&
  (value.status !== 'rejected' || isErrorEnvelope(value.error));

export const isCommandResult: Validator<CommandResult> = (value): value is CommandResult =>
  isObject(value) &&
  hasBase(value) &&
  isNonEmptyString(value.commandId) &&
  isNonEmptyString(value.correlationId) &&
  isStringIn(value.status, ['completed', 'failed']) &&
  isStringIn(value.route, ['local', 'cloud']) &&
  (value.output === undefined || isJsonRecord(value.output)) &&
  (value.error === undefined || isErrorEnvelope(value.error)) &&
  (value.status !== 'failed' || isErrorEnvelope(value.error));

export const isDeviceState: Validator<DeviceState> = (value): value is DeviceState =>
  isObject(value) &&
  hasBase(value) &&
  isNonEmptyString(value.deviceId) &&
  isStringIn(value.availability, ['online', 'offline', 'unknown', 'error']) &&
  (value.roomId === undefined || isNonEmptyString(value.roomId)) &&
  isJsonRecord(value.state) &&
  (value.correlationId === undefined || isNonEmptyString(value.correlationId));

export const isPresenceHint: Validator<PresenceHint> = (value): value is PresenceHint =>
  isObject(value) &&
  hasBase(value) &&
  isNonEmptyString(value.hintId) &&
  isCommandOrigin(value.origin) &&
  isNonEmptyString(value.roomId) &&
  typeof value.present === 'boolean' &&
  isStringIn(value.confidence, ['low', 'medium', 'high']) &&
  (value.expiresAt === undefined || isTimestamp(value.expiresAt)) &&
  (value.correlationId === undefined || isNonEmptyString(value.correlationId));

function protocolError(
  code: ErrorCode,
  message: string,
  value?: ObjectValue,
): ProtocolError {
  return new ProtocolError({
    protocolVersion: PROTOCOL_VERSION,
    code,
    message,
    timestamp: new Date().toISOString(),
    retryable: false,
    ...(isNonEmptyString(value?.correlationId) ? { correlationId: value.correlationId } : {}),
    ...(isNonEmptyString(value?.commandId) ? { commandId: value.commandId } : {}),
  });
}

/** Parses a wire payload and fails explicitly on unsupported versions or invalid shapes. */
export function deserialize<T>(json: string, validator: Validator<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw protocolError('INVALID_ENVELOPE', 'Payload is not valid JSON.');
  }

  if (!isObject(value)) {
    throw protocolError('INVALID_ENVELOPE', 'Payload must be a JSON object.');
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    throw protocolError(
      'INCOMPATIBLE_PROTOCOL_VERSION',
      `Unsupported protocolVersion ${String(value.protocolVersion)}; expected ${PROTOCOL_VERSION}.`,
      value,
    );
  }
  if (!validator(value)) {
    throw protocolError('INVALID_ENVELOPE', 'Payload does not match the selected schema.', value);
  }
  return value;
}

export function serialize<T>(value: T, validator: Validator<T>): string {
  if (!validator(value)) {
    const objectValue = isObject(value) ? value : undefined;
    throw protocolError('INVALID_ENVELOPE', 'Value does not match the selected schema.', objectValue);
  }
  return JSON.stringify(value);
}

export const commandRequestSchema = {
  version: PROTOCOL_VERSION,
  is: isCommandRequest,
  serialize: (value: CommandRequest) => serialize(value, isCommandRequest),
  deserialize: (json: string) => deserialize(json, isCommandRequest),
} as const;

export const commandAckSchema = {
  version: PROTOCOL_VERSION,
  is: isCommandAck,
  serialize: (value: CommandAck) => serialize(value, isCommandAck),
  deserialize: (json: string) => deserialize(json, isCommandAck),
} as const;

export const commandResultSchema = {
  version: PROTOCOL_VERSION,
  is: isCommandResult,
  serialize: (value: CommandResult) => serialize(value, isCommandResult),
  deserialize: (json: string) => deserialize(json, isCommandResult),
} as const;

export const deviceStateSchema = {
  version: PROTOCOL_VERSION,
  is: isDeviceState,
  serialize: (value: DeviceState) => serialize(value, isDeviceState),
  deserialize: (json: string) => deserialize(json, isDeviceState),
} as const;

export const presenceHintSchema = {
  version: PROTOCOL_VERSION,
  is: isPresenceHint,
  serialize: (value: PresenceHint) => serialize(value, isPresenceHint),
  deserialize: (json: string) => deserialize(json, isPresenceHint),
} as const;

export const errorEnvelopeSchema = {
  version: PROTOCOL_VERSION,
  is: isErrorEnvelope,
  serialize: (value: ErrorEnvelope) => serialize(value, isErrorEnvelope),
  deserialize: (json: string) => deserialize(json, isErrorEnvelope),
} as const;
