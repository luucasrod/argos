/**
 * hooks/useJarvisBridge.ts
 * Hook para detectar e despachar comandos Jarvis automaticamente
 */

import { useCallback } from 'react';
import { useAIStore } from '@/stores/useAIStore';

interface JarvisDispatchResult {
  isJarvisCommand: boolean;
  project?: string;
  action?: string;
  message?: string;
  dispatchStatus?: string;
}

const JARVIS_KEYWORDS = ['jarvis', 'jarvis,', 'jarvis:', 'hey jarvis', 'ó jarvis'];

export function useJarvisBridge() {
  const { addMessage } = useAIStore();

  /**
   * Detecta se a mensagem é para Jarvis
   */
  const isJarvisMessage = useCallback((text: string): boolean => {
    const lower = text.toLowerCase();
    return JARVIS_KEYWORDS.some((kw) => lower.includes(kw));
  }, []);

  /**
   * Despacha comando pra o bridge do Jarvis
   */
  const dispatchToJarvis = useCallback(
    async (userInput: string): Promise<JarvisDispatchResult> => {
      if (!isJarvisMessage(userInput)) {
        return { isJarvisCommand: false };
      }

      try {
        // Chama o endpoint do bridge (precisa estar rodando no Vercel/localhost)
        const response = await fetch('/api/jarvis-bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userInput }),
        });

        if (!response.ok) {
          console.error('[Jarvis Bridge] Erro na requisição:', response.status);
          return {
            isJarvisCommand: true,
            message: 'Erro ao conectar com Jarvis',
            dispatchStatus: 'error',
          };
        }

        const result = await response.json();

        // Adiciona mensagem visual pro usuário mostrando que foi pro Jarvis
        const dispatchMessage = result.dispatch_status?.includes('DISPATCHED')
          ? `✓ Enviado pro Jarvis: ${result.project} - ${result.action}`
          : result.dispatch_status?.includes('ERROR')
            ? `✗ Erro ao despachar: ${result.dispatch_status}`
            : 'Jarvis recebeu seu comando';

        addMessage({
          id: `msg-${Date.now()}-jarvis-dispatch`,
          role: 'system',
          content: dispatchMessage,
          timestamp: new Date(),
          type: 'info',
        });

        return {
          isJarvisCommand: true,
          project: result.project,
          action: result.action,
          message: dispatchMessage,
          dispatchStatus: result.dispatch_status,
        };
      } catch (error) {
        console.error('[Jarvis Bridge] Falha:', error);

        addMessage({
          id: `msg-${Date.now()}-jarvis-error`,
          role: 'system',
          content: '✗ Não consegui conectar com Jarvis. Tente de novo.',
          timestamp: new Date(),
          type: 'error',
        });

        return {
          isJarvisCommand: true,
          message: 'Erro ao conectar com Jarvis',
          dispatchStatus: 'error',
        };
      }
    },
    [isJarvisMessage, addMessage]
  );

  return {
    isJarvisMessage,
    dispatchToJarvis,
  };
}
