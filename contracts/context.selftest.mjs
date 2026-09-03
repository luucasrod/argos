import { strict as assert } from 'node:assert';
import { resolveContext, validateContextSnapshot } from './context.v1.ts';

const snapshot = {
  schemaVersion: 1,
  capturedAt: '2026-09-02T20:00:00.000Z',
  homeId: 'home-1',
  roomHint: { roomId: 'office', confidence: 0.9, source: 'trustedLocal' },
  networkPresence: 'home',
  timeContext: { instant: '2026-09-02T20:00:00.000Z', timeZone: 'Europe/Lisbon', dayPeriod: 'night' },
  activeDevice: null,
  userPreferenceRefs: ['pref-room'],
  evidence: [
    { id: 'inferred', field: 'roomId', value: 'office', source: 'inference', confidence: 0.99, observedAt: '2026-09-02T19:59:00.000Z', reason: 'historico' },
    { id: 'explicit', field: 'roomId', value: 'bedroom', source: 'explicitCommand', confidence: 1, observedAt: '2026-09-02T20:00:00.000Z', reason: 'usuario disse quarto' },
  ],
};

assert.deepEqual(validateContextSnapshot(snapshot), []);
assert.equal(resolveContext(snapshot, 'roomId').value, 'bedroom');
assert.deepEqual(resolveContext(snapshot, 'roomId'), resolveContext(snapshot, 'roomId'));

const conflict = {
  ...snapshot,
  evidence: [
    { id: 'a', field: 'activeDeviceId', value: 'tv-1', source: 'conversation', confidence: 0.9, observedAt: snapshot.capturedAt, reason: 'mencionado' },
    { id: 'b', field: 'activeDeviceId', value: 'speaker-1', source: 'conversation', confidence: 0.9, observedAt: snapshot.capturedAt, reason: 'mencionado' },
  ],
};
assert.equal(resolveContext(conflict, 'activeDeviceId').status, 'clarification');

const lowConfidence = {
  ...snapshot,
  evidence: [
    { id: 'low', field: 'homeId', value: 'home-2', source: 'inference', confidence: 0.4, observedAt: snapshot.capturedAt, reason: 'estimativa' },
  ],
};
assert.equal(resolveContext(lowConfidence, 'homeId').reason, 'lowConfidence');

console.log('context contract: precedence, determinism, conflict and confidence passed');
