import {
  PROTOCOL_VERSION,
  ProtocolError,
  commandRequestSchema,
} from './protocol.ts';

const input = {
  protocolVersion: PROTOCOL_VERSION,
  commandId: 'cmd-001',
  correlationId: 'trace-001',
  timestamp: '2026-08-31T12:00:00.000Z',
  origin: { kind: 'app', id: 'phone-001' },
  target: { kind: 'room', roomId: 'escritorio' },
  intent: 'device.set',
  parameters: { property: 'isOn', value: true },
};

const output = commandRequestSchema.deserialize(commandRequestSchema.serialize(input));
if (JSON.stringify(output) !== JSON.stringify(input)) {
  throw new Error('CommandRequest lost data during serialization round-trip.');
}

const incompatible = JSON.stringify({ ...input, protocolVersion: 999 });
try {
  commandRequestSchema.deserialize(incompatible);
  throw new Error('An incompatible protocolVersion was accepted.');
} catch (error) {
  if (!(error instanceof ProtocolError)) throw error;
  if (error.envelope.code !== 'INCOMPATIBLE_PROTOCOL_VERSION') throw error;
}

console.log('Contract self-test passed.');
