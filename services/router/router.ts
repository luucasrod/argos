/**
 * Router Central — Orquestra o fluxo híbrido
 * Decide qual rota seguir: fast path, intent classifier, LLM local ou cloud
 */
import { Route, RoutingDecision, Intent, DEFAULT_THRESHOLDS } from '@/types/router.types';
import { Device } from '@/types/device.types';
import { analyzeFastPath } from './fastPath';
import { classifyIntent, evaluateIntentQuality } from './intentClassifier';

interface RouteMetrics {
  timestamp: number;
  utterance: string;
  chosenRoute: Route;
  duration: number;
  reasoning: Record<string, unknown>;
}

export class ArgosRouter {
  private metricsLog: RouteMetrics[] = [];
  private devices: Device[];

  constructor(devices: Device[] = []) {
    this.devices = devices;
  }

  updateDevices(devices: Device[]) {
    this.devices = devices;
  }

  /**
   * Análise principal — decide rota
   */
  async routeUttenance(utterance: string): Promise<RoutingDecision> {
    const startTime = performance.now();

    // FASE 1: Fast Path — determinístico, sem latência
    const fastPathResult = analyzeFastPath(utterance, this.devices);
    if (fastPathResult.matched && fastPathResult.intent) {
      const decision: RoutingDecision = {
        route: 'FAST_PATH',
        intent: fastPathResult.intent,
        reason: 'Comando simples detectado determinísticamente',
        latency: { fastPath: performance.now() - startTime },
      };
      this.logMetrics(utterance, 'FAST_PATH', decision, performance.now() - startTime);
      return decision;
    }

    // FASE 2: Intent Classifier — padrões estruturados
    const classifierStart = performance.now();
    const { intent, confidence } = classifyIntent(utterance, this.devices);
    const classifierDuration = performance.now() - classifierStart;

    if (intent) {
      const quality = evaluateIntentQuality(intent, DEFAULT_THRESHOLDS);

      // Alta confiança = executar localmente
      if (quality.canExecute) {
        const decision: RoutingDecision = {
          route: 'INTENT_LOCAL',
          intent,
          reason: `Intent classificado com confiança ${(confidence * 100).toFixed(0)}%`,
          latency: {
            fastPath: performance.now() - startTime,
            classifier: classifierDuration,
          },
          fallbackRoute: 'CLOUD',
        };
        this.logMetrics(utterance, 'INTENT_LOCAL', decision, performance.now() - startTime);
        return decision;
      }

      // Confiança moderada = tenta LLM local se disponível
      if (quality.reason === 'medium_confidence_needs_llm') {
        const decision: RoutingDecision = {
          route: 'LLM_LOCAL',
          intent,
          reason: `Confiança moderada (${(confidence * 100).toFixed(0)}%), tenta LLM local`,
          latency: {
            fastPath: performance.now() - startTime,
            classifier: classifierDuration,
          },
          fallbackRoute: 'CLOUD',
        };
        this.logMetrics(utterance, 'LLM_LOCAL', decision, performance.now() - startTime);
        return decision;
      }
    }

    // FASE 3: Cloud — para tudo que não foi capturado
    const decision: RoutingDecision = {
      route: 'CLOUD',
      intent: intent || {
        type: 'chat',
        confidence: 0,
        coverage: 0,
        metrics: {
          confidence: 0,
          coverage: 0,
          requiredSlots: [],
          missingSlots: [],
          ambiguities: [],
          unparsedSegments: [utterance],
          actionRisk: 'low',
          contextDependency: false,
          multiIntent: false,
        },
        raw: utterance,
      },
      reason: 'Sem confiança local, encaminhando para cloud',
      latency: {
        fastPath: performance.now() - startTime,
        classifier: classifierDuration,
      },
    };

    this.logMetrics(utterance, 'CLOUD', decision, performance.now() - startTime);
    return decision;
  }

  private logMetrics(
    utterance: string,
    route: Route,
    decision: RoutingDecision,
    duration: number
  ) {
    this.metricsLog.push({
      timestamp: Date.now(),
      utterance,
      chosenRoute: route,
      duration,
      reasoning: {
        route: decision.route,
        reason: decision.reason,
        intentType: decision.intent.type,
        confidence: decision.intent.confidence,
        coverage: decision.intent.coverage,
      },
    });

    // Mantém apenas últimas 100 decisões
    if (this.metricsLog.length > 100) {
      this.metricsLog.shift();
    }
  }

  /**
   * Retorna log de roteamento para debug
   */
  getMetrics(): RouteMetrics[] {
    return this.metricsLog;
  }

  /**
   * Retorna resumo agregado de estatísticas
   */
  getAggregatedMetrics() {
    if (this.metricsLog.length === 0) {
      return {
        totalRequests: 0,
        averageLatency: 0,
        routeDistribution: {},
      };
    }

    const routeDistribution: Record<Route, number> = {
      FAST_PATH: 0,
      INTENT_LOCAL: 0,
      LLM_LOCAL: 0,
      CLOUD: 0,
      CLARIFICATION: 0,
    };

    let totalLatency = 0;

    for (const metric of this.metricsLog) {
      routeDistribution[metric.chosenRoute]++;
      totalLatency += metric.duration;
    }

    return {
      totalRequests: this.metricsLog.length,
      averageLatency: totalLatency / this.metricsLog.length,
      routeDistribution,
      percentiles: {
        p50: this.getLatencyPercentile(50),
        p95: this.getLatencyPercentile(95),
        p99: this.getLatencyPercentile(99),
      },
    };
  }

  private getLatencyPercentile(percentile: number): number {
    if (this.metricsLog.length === 0) return 0;

    const sorted = [...this.metricsLog].sort((a, b) => a.duration - b.duration);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)].duration;
  }
}

// Singleton global
let globalRouter: ArgosRouter | null = null;

export function getGlobalRouter(devices?: Device[]): ArgosRouter {
  if (!globalRouter) {
    globalRouter = new ArgosRouter(devices);
  }
  return globalRouter;
}

export function resetRouter() {
  globalRouter = null;
}
