/**
 * intentContext.ts — contexto do último intent executado.
 * Permite follow-up contextual: "e a do quarto também" referencia o
 * último comando sem precisar repetir o dispositivo ou ação.
 * FASE 22 do Prompt Master.
 */
import { ParsedIntent } from '@/services/ai/intentParser';

type IntentContext = {
  intent: ParsedIntent;
  ts: number;
  /** Normalização dos nomes de dispositivos já mencionados */
  deviceNames: string[];
  /** Ação predominante do último intent (setOn / setOff / setValue ...) */
  action: string | null;
};

const CONTEXT_TTL_MS = 60_000; // contexto válido por 1 min

let _last: IntentContext | null = null;

export function setLastIntentContext(intent: ParsedIntent): void {
  const deviceNames = (intent.actions ?? []).map((a) => a.label ?? '');
  const action = intent.actions?.[0]?.action ?? null;
  _last = { intent, ts: Date.now(), deviceNames, action };
}

export function getLastIntentContext(): IntentContext | null {
  if (!_last) return null;
  if (Date.now() - _last.ts > CONTEXT_TTL_MS) {
    _last = null;
    return null;
  }
  return _last;
}

export function clearIntentContext(): void {
  _last = null;
}
