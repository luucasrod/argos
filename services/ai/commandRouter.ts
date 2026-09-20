/**
 * commandRouter.ts — issue #236, Fase 3 do épico #232 (voz conversacional
 * em tempo real). Implementa a interface `CommandRouter` de
 * `contracts/voiceSession.v1.ts` por cima do fast path que já existe
 * (`matchFastDeviceCommand`, `services/ai/fastIntent.ts`).
 *
 * O router só decide fast path vs. caminho conversacional e devolve o
 * `ParsedIntent` executável. A idempotência real fica no ponto comum de
 * execução (`commandExecutionIdempotency.ts`), porque só ali fast path e LLM
 * enxergam o mesmo `commandId`.
 */
import type { CommandRouter, FastPathResult } from '@/contracts/voiceSession.v1';
import type { Device } from '@/types/device.types';
import { hasClaimedCommandExecution } from './commandExecutionIdempotency';
import { matchFastDeviceCommand } from './fastIntent';

/**
 * `getDevices` é uma função (não a lista direto) porque o router pode viver
 * mais tempo que qualquer snapshot de dispositivos. Cada chamada a `route()`
 * pega a lista atual, igual `hooks/useArgos.ts` já faz hoje.
 */
export function createCommandRouter(getDevices: () => Device[]): CommandRouter {
  return {
    async route(utterance: string, commandId: string): Promise<FastPathResult> {
      if (hasClaimedCommandExecution(commandId)) {
        return { handled: false };
      }

      const intent = matchFastDeviceCommand(utterance, getDevices());
      if (!intent) {
        return { handled: false };
      }

      return { handled: true, commandId, intent };
    },
  };
}
