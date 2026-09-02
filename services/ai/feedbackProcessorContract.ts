import {
  createPreferenceLearningState,
  processPreferenceFeedback,
  type FeedbackContext,
  type FeedbackKind,
  type PreferenceFeedback,
} from './feedbackProcessor';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Feedback processor contract: ${message}`);
}

const context: FeedbackContext = { timeBucket: 'night', roomId: 'office', actionType: 'setColor' };

function evidence(id: string, kind: FeedbackKind, value = 'warm'): PreferenceFeedback {
  return {
    evidenceId: id,
    preferenceKey: 'lighting.color',
    value,
    kind,
    context,
    occurredAt: `2026-09-0${id.length}T20:00:00.000Z`,
    reason: `evidencia ${id}`,
  };
}

export function runFeedbackProcessorContract(): string[] {
  let state = createPreferenceLearningState('lighting.color', context);
  let result = processPreferenceFeedback(state, evidence('a', 'correction'));
  assert(result.suggestion === null, 'uma correcao isolada nao pode gerar sugestao');
  state = result.state;

  result = processPreferenceFeedback(state, evidence('bb', 'confirmation'));
  assert(result.suggestion === null, 'duas evidencias ainda nao atingem o minimo');
  state = result.state;

  result = processPreferenceFeedback(state, evidence('ccc', 'cardAccepted'));
  assert(result.suggestion !== null, 'padrao repetido deve gerar sugestao');
  assert(result.suggestion.evidenceIds.length === 3, 'sugestao explica as evidencias');
  state = result.state;

  const duplicate = processPreferenceFeedback(state, evidence('ccc', 'cardAccepted'));
  assert(!duplicate.changed, 'evidenceId repetido deve ser idempotente');
  assert(duplicate.state.candidates[0].confidence === state.candidates[0].confidence, 'duplicata nao aumenta confidence');

  const otherContext = { ...context, roomId: 'bedroom' };
  let rejectedContext = false;
  try {
    processPreferenceFeedback(state, { ...evidence('dddd', 'confirmation'), context: otherContext });
  } catch {
    rejectedContext = true;
  }
  assert(rejectedContext, 'evidencia de outro contexto nao pode ser combinada');

  return ['isolated-correction', 'repeated-pattern', 'idempotency', 'context-isolation'];
}
