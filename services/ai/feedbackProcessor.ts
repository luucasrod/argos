export type FeedbackKind =
  | 'correction'
  | 'cardAccepted'
  | 'cardRejected'
  | 'confirmation'
  | 'observedChoice';

export interface FeedbackContext {
  timeBucket?: 'morning' | 'afternoon' | 'evening' | 'night';
  roomId?: string;
  deviceId?: string;
  actionType?: string;
}

export interface PreferenceFeedback {
  evidenceId: string;
  preferenceKey: string;
  value: string | number | boolean;
  kind: FeedbackKind;
  context: FeedbackContext;
  occurredAt: string;
  reason: string;
}

export interface PreferenceEvidence {
  evidenceId: string;
  kind: FeedbackKind;
  value: PreferenceFeedback['value'];
  weight: number;
  occurredAt: string;
  reason: string;
}

export interface PreferenceCandidate {
  value: PreferenceFeedback['value'];
  confidence: number;
  evidence: PreferenceEvidence[];
}

export interface PreferenceLearningState {
  preferenceKey: string;
  context: FeedbackContext;
  candidates: PreferenceCandidate[];
  processedEvidenceIds: string[];
}

export interface PreferenceSuggestion {
  preferenceKey: string;
  value: PreferenceFeedback['value'];
  context: FeedbackContext;
  confidence: number;
  evidenceIds: string[];
  explanation: string;
}

export interface FeedbackProcessingResult {
  state: PreferenceLearningState;
  suggestion: PreferenceSuggestion | null;
  changed: boolean;
}

const FEEDBACK_WEIGHT: Readonly<Record<FeedbackKind, number>> = {
  correction: 0.35,
  cardAccepted: 0.45,
  cardRejected: -0.4,
  confirmation: 0.3,
  observedChoice: 0.15,
};

export const PREFERENCE_SUGGESTION_THRESHOLD = 0.75;
export const PREFERENCE_MIN_EVIDENCE = 3;
export const PREFERENCE_MIN_MARGIN = 0.2;

function assertText(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} obrigatorio`);
}

function assertIso(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error('occurredAt deve ser ISO-8601');
}

function sameValue(left: PreferenceFeedback['value'], right: PreferenceFeedback['value']): boolean {
  return typeof left === typeof right && left === right;
}

function sameContext(left: FeedbackContext, right: FeedbackContext): boolean {
  return left.timeBucket === right.timeBucket &&
    left.roomId === right.roomId &&
    left.deviceId === right.deviceId &&
    left.actionType === right.actionType;
}

function cloneContext(context: FeedbackContext): FeedbackContext {
  return { ...context };
}

function cloneCandidate(candidate: PreferenceCandidate): PreferenceCandidate {
  return { ...candidate, evidence: candidate.evidence.map((item) => ({ ...item })) };
}

function applyWeight(confidence: number, weight: number): number {
  if (weight >= 0) return confidence + (1 - confidence) * weight;
  return confidence * (1 + weight);
}

function rounded(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

export function createPreferenceLearningState(
  preferenceKey: string,
  context: FeedbackContext
): PreferenceLearningState {
  assertText(preferenceKey, 'preferenceKey');
  return { preferenceKey, context: cloneContext(context), candidates: [], processedEvidenceIds: [] };
}

export function processPreferenceFeedback(
  current: PreferenceLearningState,
  feedback: PreferenceFeedback
): FeedbackProcessingResult {
  assertText(feedback.evidenceId, 'evidenceId');
  assertText(feedback.preferenceKey, 'preferenceKey');
  assertText(feedback.reason, 'reason');
  assertIso(feedback.occurredAt);
  if (feedback.preferenceKey !== current.preferenceKey) {
    throw new Error('feedback pertence a outra preferenceKey');
  }
  if (!sameContext(feedback.context, current.context)) {
    throw new Error('feedback pertence a outro contexto');
  }

  const candidates = current.candidates.map(cloneCandidate);
  const processedEvidenceIds = [...current.processedEvidenceIds];
  if (processedEvidenceIds.includes(feedback.evidenceId)) {
    return {
      state: { ...current, context: cloneContext(current.context), candidates, processedEvidenceIds },
      suggestion: buildSuggestion(current),
      changed: false,
    };
  }

  const weight = FEEDBACK_WEIGHT[feedback.kind];
  let candidate = candidates.find((item) => sameValue(item.value, feedback.value));
  if (!candidate) {
    candidate = { value: feedback.value, confidence: 0, evidence: [] };
    candidates.push(candidate);
  }
  candidate.confidence = rounded(applyWeight(candidate.confidence, weight));
  candidate.evidence.push({
    evidenceId: feedback.evidenceId,
    kind: feedback.kind,
    value: feedback.value,
    weight,
    occurredAt: feedback.occurredAt,
    reason: feedback.reason,
  });
  processedEvidenceIds.push(feedback.evidenceId);

  const state: PreferenceLearningState = {
    preferenceKey: current.preferenceKey,
    context: cloneContext(current.context),
    candidates: candidates.sort((left, right) =>
      right.confidence - left.confidence || String(left.value).localeCompare(String(right.value))
    ),
    processedEvidenceIds: processedEvidenceIds.sort(),
  };
  return { state, suggestion: buildSuggestion(state), changed: true };
}

export function buildSuggestion(state: PreferenceLearningState): PreferenceSuggestion | null {
  const [winner, runnerUp] = [...state.candidates].sort((left, right) =>
    right.confidence - left.confidence || String(left.value).localeCompare(String(right.value))
  );
  if (!winner) return null;
  const supporting = winner.evidence.filter((item) => item.weight > 0);
  const margin = winner.confidence - (runnerUp?.confidence ?? 0);
  if (
    supporting.length < PREFERENCE_MIN_EVIDENCE ||
    winner.confidence < PREFERENCE_SUGGESTION_THRESHOLD ||
    margin < PREFERENCE_MIN_MARGIN
  ) return null;

  const kinds = [...new Set(supporting.map((item) => item.kind))].sort();
  return {
    preferenceKey: state.preferenceKey,
    value: winner.value,
    context: cloneContext(state.context),
    confidence: winner.confidence,
    evidenceIds: supporting.map((item) => item.evidenceId).sort(),
    explanation:
      `${supporting.length} evidências consistentes (${kinds.join(', ')}) ` +
      `neste contexto elevaram a confiança para ${winner.confidence.toFixed(2)}.`,
  };
}
