/**
 * commandRouter.ts — issue #236, Fase 3 do épico #232 (voz conversacional
 * em tempo real). Implementa a interface `CommandRouter` de
 * `contracts/voiceSession.v1.ts` por cima do fast path que já existe
 * (`matchFastDeviceCommand`, `services/ai/fastIntent.ts`) — não reescreve a
 * lógica de reconhecimento de intent, só adiciona idempotência por
 * `commandId`.
 *
 * Por quê existe separado do fast path direto que `hooks/useArgos.ts` já
 * chama hoje: auditoria #233 (seção 5) confirmou que HOJE não existe
 * duplicação possível porque fast path e IA são mutuamente exclusivos
 * (if/else síncrono) — mas isso deixa de valer assim que streaming (#237)
 * permitir os dois rodarem em paralelo de verdade. Este router fica pronto
 * pra esse momento; não substitui o caminho atual em `hooks/useArgos.ts`
 * (que continua chamando `matchFastDeviceCommand` direto, sem mudança) —
 * quem for ligar a arquitetura v2 completa troca pra este router, sempre
 * atrás do flag `isVoiceSessionV2Enabled`.
 */
import type { CommandRouter, FastPathResult } from '@/contracts/voiceSession.v1';
import type { Device } from '@/types/device.types';
import { matchFastDeviceCommand } from './fastIntent';

const MAX_TRACKED_COMMANDS = 200;

/**
 * `commandId` → timestamp de quando foi visto. `Map` preserva ordem de
 * inserção, então o mais antigo é sempre o primeiro a sair quando o cache
 * enche — um LRU aproximado, suficiente pro volume de comandos de voz de
 * um único usuário (não precisa de estrutura de dados sofisticada aqui).
 */
const seenCommandIds = new Map<string, number>();

function rememberCommandId(commandId: string): void {
  seenCommandIds.set(commandId, Date.now());
  if (seenCommandIds.size > MAX_TRACKED_COMMANDS) {
    const oldest = seenCommandIds.keys().next().value;
    if (oldest !== undefined) seenCommandIds.delete(oldest);
  }
}

function isDuplicate(commandId: string): boolean {
  return seenCommandIds.has(commandId);
}

/** Só para teste — não é exportado no barrel de produção. */
export function __resetCommandRouterStateForTest(): void {
  seenCommandIds.clear();
}

/**
 * `getDevices` é uma função (não a lista direto) porque o router pode
 * viver mais tempo que qualquer snapshot de dispositivos — cada chamada a
 * `route()` pega a lista atual no momento em que é chamada, igual o
 * `hooks/useArgos.ts` já faz hoje ao chamar `matchFastDeviceCommand`.
 */
export function createCommandRouter(getDevices: () => Device[]): CommandRouter {
  return {
    async route(utterance: string, commandId: string): Promise<FastPathResult> {
      if (isDuplicate(commandId)) {
        // Mesma intenção já processada (ex.: fast path e LLM chegaram na
        // mesma conclusão em paralelo) — não executa de novo.
        return { handled: false };
      }

      const intent = matchFastDeviceCommand(utterance, getDevices());
      if (!intent) {
        return { handled: false };
      }

      rememberCommandId(commandId);
      return { handled: true, commandId };
    },
  };
}
