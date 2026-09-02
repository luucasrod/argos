import { SemanticAliasEngine } from './semanticAliasEngine';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Semantic alias contract: ${message}`);
}

export async function runSemanticAliasEngineContract() {
  const engine = new SemanticAliasEngine([
    {
      id: 'device:bedside-lamp',
      type: 'device',
      name: 'Lâmpada do quarto',
      aliases: ['abajur', 'luz da cama'],
    },
    {
      id: 'device:desk-lamp',
      type: 'device',
      name: 'Lâmpada da mesa',
      aliases: [],
    },
    { id: 'bedroom', type: 'room', name: 'Quarto', aliases: ['meu quarto'] },
    { id: 'sleep', type: 'routine', name: 'Dormir', aliases: ['boa noite'] },
    { id: 'person:ana', type: 'person', name: 'Ana', aliases: ['minha irmã'] },
  ]);

  for (const reference of ['abajur', 'luz da cama', 'Lâmpada do quarto']) {
    const resolved = engine.resolve(reference, 'device');
    assert(
      resolved.status === 'resolved' && resolved.entity.id === 'device:bedside-lamp',
      `${reference} resolve o mesmo device`
    );
  }
  assert(engine.resolve('meu quarto', 'room').status === 'resolved', 'resolve room');
  assert(engine.resolve('boa noite', 'routine').status === 'resolved', 'resolve rotina');
  assert(engine.resolve('minha irmã', 'person').status === 'resolved', 'resolve pessoa');

  const confirmation = engine.confirmAlias('device', 'device:desk-lamp', 'abajur');
  assert(confirmation.collisions.length === 1, 'confirmar alias detecta colisão');
  const ambiguous = engine.resolve('abajur', 'device');
  assert(ambiguous.status === 'ambiguous', 'colisão pede clarificação');
  assert(
    ambiguous.status === 'ambiguous' && ambiguous.candidates.length === 2,
    'clarificação lista candidatos'
  );

  return ['device-variants', 'room', 'routine', 'person', 'collision', 'clarification'];
}
