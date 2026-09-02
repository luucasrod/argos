import type { MemoryRecordV1 } from '../../contracts/memory.v1';
import {
  InMemoryMemoryRepository,
  PersonalMemoryService,
  createMemoryRecord,
} from './personalMemoryService';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Memory service contract: ${message}`);
}

function fixture(id: string, content: string): MemoryRecordV1 {
  return createMemoryRecord({
    id,
    kind: 'preference',
    state: 'suggested',
    title: 'Preferência de luz',
    content,
    source: { source: 'userExplicit', reason: 'Usuário informou no chat' },
    confidence: 0.7,
    createdAt: '2026-09-02T10:00:00.000Z',
    lastUsedAt: null,
    scope: 'account',
    sensitivityClass: 'none',
    retentionPolicy: { kind: 'untilRejected' },
    consent: { explicitlyGranted: true, grantedAt: '2026-09-02T10:00:00.000Z' },
  });
}

export async function runPersonalMemoryServiceContract() {
  const service = new PersonalMemoryService(new InMemoryMemoryRepository());
  const mutation = { actor: 'contract', reason: 'teste de contrato', at: '2026-09-02T10:01:00.000Z' };
  await service.create('user-a', fixture('shared-id', 'Prefere luz azul à noite'), mutation);
  await service.create('user-b', fixture('shared-id', 'Prefere luz quente pela manhã'), mutation);

  const userA = await service.query('user-a', { context: ['azul'] });
  const userB = await service.query('user-b', { context: ['quente'] });
  assert(userA.length === 1 && userA[0].memory.content.includes('azul'), 'isola usuário A');
  assert(userB.length === 1 && userB[0].memory.content.includes('quente'), 'isola usuário B');
  assert(userA[0].explanation.reason.length > 0, 'consulta explica origem');

  const confirmed = await service.confirm('user-a', 'shared-id', mutation);
  assert(confirmed.memory.state === 'confirmed', 'confirma memória');
  assert(confirmed.memory.confidence > 0.7, 'confirmação aumenta confidence');

  const corrected = await service.correct('user-a', 'shared-id', {
    id: 'correction-a',
    state: 'confirmed',
    title: 'Preferência corrigida',
    content: 'Prefere luz roxa à noite',
    confidence: 0.95,
    createdAt: '2026-09-02T10:02:00.000Z',
    lastUsedAt: null,
    scope: 'account',
    sensitivityClass: 'none',
    retentionPolicy: { kind: 'untilRejected' },
    consent: { explicitlyGranted: true, grantedAt: '2026-09-02T10:00:00.000Z' },
  }, mutation);
  assert(corrected.rejected.memory.state === 'rejected', 'correção rejeita original');
  assert(corrected.correction.memory.correctedFromId === 'shared-id', 'correção referencia origem');

  await service.delete('user-a', 'correction-a', mutation);
  assert(await service.get('user-a', 'correction-a') === null, 'apaga memória');

  return ['user-isolation', 'query-explainability', 'confirmation', 'correction', 'deletion'];
}
