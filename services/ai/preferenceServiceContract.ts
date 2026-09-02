import { InMemoryPreferenceRepository, PreferenceService } from './preferenceService';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Preference service contract: ${message}`);
}

export async function runPreferenceServiceContract() {
  const service = new PreferenceService(new InMemoryPreferenceRepository());
  const now = '2026-09-02T12:00:00.000Z';
  const userA = await service.getNextCards('user-a', {
    integrationIds: ['wiz'],
    routineIds: ['routine-dormir'],
    memories: [],
    now,
  });
  const userB = await service.getNextCards('user-b', {
    integrationIds: ['xiaomi-pet'],
    routineIds: [],
    memories: [],
    now,
  });
  assert(userA[0].card.id === 'evening-light-color', 'contexto de luz prioriza card de luz');
  assert(userB[0].card.id === 'pet-alerts', 'contexto pet prioriza card de pet');

  await service.saveResponse('user-a', {
    cardId: 'evening-light-color',
    kind: 'rejected',
    confidence: 1,
    answeredAt: now,
  });
  const afterRejection = await service.getNextCards('user-a', {
    integrationIds: ['wiz'],
    routineIds: ['routine-dormir'],
    memories: [],
    now: '2026-09-03T12:00:00.000Z',
  });
  assert(
    !afterRejection.some(({ card }) => card.id === 'evening-light-color'),
    'card rejeitado respeita cooldown'
  );
  assert(
    userB.some(({ card }) => card.id === 'pet-alerts'),
    'resposta de um usuário não altera a fila de outro'
  );

  const learned = await service.getNextCards('user-c', {
    integrationIds: ['wiz'],
    routineIds: [],
    now,
    memories: [{
      schemaVersion: 1,
      id: 'learned-light',
      kind: 'preference',
      state: 'confirmed',
      title: 'Iluminação preferida',
      content: 'Prefere luz azul à noite',
      source: { source: 'userExplicit', reason: 'Informado pelo usuário' },
      confidence: 0.95,
      createdAt: now,
      lastUsedAt: null,
      scope: 'account',
      sensitivityClass: 'none',
      retentionPolicy: { kind: 'indefinite' },
      consent: { explicitlyGranted: true, grantedAt: now },
    }],
  });
  assert(
    !learned.some(({ card }) => card.id === 'evening-light-color'),
    'preferência aprendida com alta confidence não volta'
  );

  return ['context-ranking', 'user-isolation', 'rejection-cooldown', 'learned-exclusion'];
}
