import { strict as assert } from 'node:assert';
import { evaluateActionPermission } from './actionPermissions.v1.ts';

const base = {
  schemaVersion: 1,
  origin: 'local',
  localPresence: true,
  actionConfirmed: false,
  recentlyReauthenticated: false,
  userPermission: 'granted',
};

assert.equal(evaluateActionPermission({ ...base, capability: 'onOff' }).decision, 'allow');
assert.equal(evaluateActionPermission({ ...base, capability: 'temperature' }).decision, 'requireConfirmation');
assert.equal(
  evaluateActionPermission({ ...base, capability: 'lock', actionConfirmed: true }).decision,
  'requireReauthentication'
);
assert.equal(
  evaluateActionPermission({ ...base, capability: 'lock', origin: 'remote', actionConfirmed: true, recentlyReauthenticated: true }).decision,
  'block'
);
assert.equal(
  evaluateActionPermission({ ...base, capability: 'purchase', actionConfirmed: true, recentlyReauthenticated: true }).decision,
  'allow'
);
assert.equal(evaluateActionPermission({ ...base, capability: 'futureCapability' }).risk, 'high');

console.log('action permissions: trivial, confirmation, reauth, remote block and unknown default passed');
