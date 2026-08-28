/**
 * useRouter — Hook que integra o sistema híbrido na aplicação
 */
import { useCallback, useEffect, useRef } from 'react';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { getGlobalRouter } from '@/services/router/router';
import { getGlobalToolRegistry } from '@/services/router/toolRegistry';
import { createExecutor } from '@/services/router/executor';
import { RoutingDecision, ExecutorResult } from '@/types/router.types';

export function useRouter() {
  const devices = useDeviceStore((state) => state.devices);
  const routerRef = useRef(getGlobalRouter(devices));

  // Atualiza dispositivos no router
  useEffect(() => {
    routerRef.current.updateDevices(devices);
  }, [devices]);

  /**
   * Processa um comando/transcrição completo
   * Retorna a decisão de roteamento e o resultado da execução
   */
  const processUtterance = useCallback(
    async (
      utterance: string,
      options?: { dryRun?: boolean; verbose?: boolean }
    ): Promise<{
      decision: RoutingDecision;
      executionResult?: ExecutorResult;
      metrics: Record<string, unknown>;
    }> => {
      const router = routerRef.current;

      // Passo 1: Decidir rota
      const decision = await router.routeUttenance(utterance);

      const metrics = {
        route: decision.route,
        reason: decision.reason,
        intentType: decision.intent.type,
        confidence: decision.intent.confidence,
        coverage: decision.intent.coverage,
        latency: decision.latency,
      };

      if (options?.verbose) {
        console.log('[Router] Decision:', {
          route: decision.route,
          intent: decision.intent,
          metrics,
        });
      }

      // Passo 2: Se for FAST_PATH ou INTENT_LOCAL, executar
      if (decision.route === 'FAST_PATH' || decision.route === 'INTENT_LOCAL') {
        if (!options?.dryRun) {
          const executor = createExecutor({
            userId: 'local', // TODO: pegar do auth
            devices,
            permissions: ['device:control', 'device:query', 'device:light'],
            executeDeviceAction: async (deviceId, action) => {
              // TODO: implementar execução real
              console.log('[Executor] Device action:', { deviceId, action });
              return true;
            },
            getDeviceState: async (deviceId) => {
              const device = devices.find((d) => d.id === deviceId);
              return device ? { isOn: device.isOn } : null;
            },
          });

          const executionResult = await executor.execute(decision.intent);
          return { decision, executionResult, metrics };
        }
      }

      // Passo 3: Se for LLM_LOCAL ou CLOUD, retorna decisão para processamento seguinte
      // (será capturado por outro handler que vai chamar LLM local ou cloud)
      return { decision, metrics };
    },
    [devices]
  );

  /**
   * Obtém estatísticas de roteamento
   */
  const getMetrics = useCallback(() => {
    const router = routerRef.current;
    return {
      recent: router.getMetrics(),
      aggregated: router.getAggregatedMetrics(),
    };
  }, []);

  /**
   * Reseta o log de métricas
   */
  const resetMetrics = useCallback(() => {
    routerRef.current = getGlobalRouter(devices);
  }, [devices]);

  return {
    processUtterance,
    getMetrics,
    resetMetrics,
  };
}

/**
 * Hook para tool calling — valida e executa tool calls solicitados por LLM
 */
export function useToolCalling() {
  const registry = useRef(getGlobalToolRegistry());

  const validateToolCall = useCallback(
    (
      toolName: string,
      args: Record<string, unknown>,
      userPermissions: string[]
    ): { valid: boolean; error?: string } => {
      return registry.current.validateToolCall(toolName, args, userPermissions);
    },
    []
  );

  const listAvailableTools = useCallback((userPermissions?: string[]) => {
    return registry.current.listTools(userPermissions ? { permissions: userPermissions } : undefined);
  }, []);

  const getToolSchema = useCallback((toolName: string) => {
    return registry.current.getTool(toolName);
  }, []);

  return {
    validateToolCall,
    listAvailableTools,
    getToolSchema,
  };
}
