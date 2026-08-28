/**
 * Executor — Executa as ações definidas pela Intent
 * Valida permissões, executa tool calls, e retorna resultado
 */
import { Intent, ExecutorResult } from '@/types/router.types';
import { Device } from '@/types/device.types';

export interface ExecutorContext {
  userId: string;
  devices: Device[];
  permissions: string[];
  executeDeviceAction: (deviceId: string, action: unknown) => Promise<boolean>;
  getDeviceState: (deviceId: string) => Promise<unknown>;
}

export class IntentExecutor {
  private context: ExecutorContext;

  constructor(context: ExecutorContext) {
    this.context = context;
  }

  /**
   * Executa uma intenção e retorna resultado
   */
  async execute(intent: Intent): Promise<ExecutorResult> {
    const startTime = performance.now();
    const toolCalls: Array<{
      tool: string;
      args: unknown;
      result: unknown;
      duration: number;
    }> = [];

    try {
      switch (intent.type) {
        case 'device_control':
          return await this.executeDeviceControl(intent, toolCalls);

        case 'device_query':
          return await this.executeDeviceQuery(intent, toolCalls);

        case 'automation':
          return await this.executeAutomation(intent, toolCalls);

        case 'chat':
        case 'unknown':
        default:
          // Esses tipos precisam de LLM ou cloud
          return {
            success: false,
            message: 'Não posso executar localmente, enviando para IA',
            speech: 'Um momento...',
            error: {
              code: 'NOT_EXECUTABLE_LOCALLY',
              message: 'Intent requer processamento em cloud',
              recoverable: true,
            },
            toolCalls,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Erro ao executar: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speech: 'Erro na execução.',
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown',
          recoverable: true,
        },
        toolCalls,
      };
    }
  }

  private async executeDeviceControl(
    intent: Intent,
    toolCalls: Array<{ tool: string; args: unknown; result: unknown; duration: number }>
  ): Promise<ExecutorResult> {
    if (!intent.deviceIds || !intent.actions) {
      return {
        success: false,
        message: 'Intent de controle de dispositivo sem ações',
        speech: 'Erro na configuração.',
        error: {
          code: 'INVALID_INTENT',
          message: 'Missing deviceIds or actions',
          recoverable: false,
        },
        toolCalls,
      };
    }

    // Valida permissões
    for (const deviceId of intent.deviceIds) {
      if (!this.context.permissions.includes(`device:${deviceId}`)) {
        return {
          success: false,
          message: `Sem permissão para controlar ${deviceId}`,
          speech: 'Sem permissão.',
          error: {
            code: 'PERMISSION_DENIED',
            message: `No permission for device ${deviceId}`,
            recoverable: false,
          },
          toolCalls,
        };
      }
    }

    // Executa cada ação
    let allSucceeded = true;
    let successCount = 0;

    for (const action of intent.actions) {
      const callStart = performance.now();
      const device = this.context.devices.find((d) => d.id === action.deviceId);

      if (!device) {
        allSucceeded = false;
        continue;
      }

      try {
        const result = await this.context.executeDeviceAction(action.deviceId, action);
        const duration = performance.now() - callStart;

        toolCalls.push({
          tool: `device:${action.action}`,
          args: action,
          result,
          duration,
        });

        if (result) {
          successCount++;
        } else {
          allSucceeded = false;
        }
      } catch (error) {
        allSucceeded = false;
        toolCalls.push({
          tool: `device:${action.action}`,
          args: action,
          result: { error: error instanceof Error ? error.message : 'Unknown' },
          duration: performance.now() - callStart,
        });
      }
    }

    const devices = intent.deviceIds
      .map((id) => this.context.devices.find((d) => d.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    if (allSucceeded) {
      return {
        success: true,
        message: `Ação executada em ${devices}`,
        speech: 'Pronto.',
        data: { devicesAffected: intent.deviceIds, successCount },
        toolCalls,
      };
    } else if (successCount > 0) {
      return {
        success: true,
        message: `Ação parcialmente executada em ${devices}`,
        speech: 'Parcialmente executado.',
        data: { devicesAffected: intent.deviceIds, successCount },
        toolCalls,
      };
    } else {
      return {
        success: false,
        message: `Falha ao executar ação em ${devices}`,
        speech: 'Falha na execução.',
        error: {
          code: 'EXECUTION_FAILED',
          message: 'All device actions failed',
          recoverable: true,
        },
        toolCalls,
      };
    }
  }

  private async executeDeviceQuery(
    intent: Intent,
    toolCalls: Array<{ tool: string; args: unknown; result: unknown; duration: number }>
  ): Promise<ExecutorResult> {
    if (!intent.queryDeviceIds) {
      return {
        success: false,
        message: 'Intent de query sem dispositivo',
        speech: 'Erro.',
        error: {
          code: 'INVALID_INTENT',
          message: 'Missing queryDeviceIds',
          recoverable: false,
        },
        toolCalls,
      };
    }

    const deviceId = intent.queryDeviceIds[0];
    const device = this.context.devices.find((d) => d.id === deviceId);

    if (!device) {
      return {
        success: false,
        message: `Dispositivo ${deviceId} não encontrado`,
        speech: 'Dispositivo não encontrado.',
        error: {
          code: 'DEVICE_NOT_FOUND',
          message: `Device ${deviceId} not found`,
          recoverable: false,
        },
        toolCalls,
      };
    }

    const callStart = performance.now();
    try {
      const state = await this.context.getDeviceState(deviceId);
      const duration = performance.now() - callStart;

      toolCalls.push({
        tool: 'device:query',
        args: { deviceId, property: intent.queryProperty },
        result: state,
        duration,
      });

      const statusText = state && typeof state === 'object' && 'isOn' in state
        ? (state as { isOn: boolean }).isOn
          ? 'ligado'
          : 'desligado'
        : 'desconhecido';

      return {
        success: true,
        message: `${device.name} está ${statusText}`,
        speech: statusText,
        data: { device: deviceId, state },
        toolCalls,
      };
    } catch (error) {
      return {
        success: false,
        message: `Não consegui verificar o estado de ${device.name}`,
        speech: 'Erro ao consultar.',
        error: {
          code: 'QUERY_FAILED',
          message: error instanceof Error ? error.message : 'Unknown',
          recoverable: true,
        },
        toolCalls,
      };
    }
  }

  private async executeAutomation(
    intent: Intent,
    toolCalls: Array<{ tool: string; args: unknown; result: unknown; duration: number }>
  ): Promise<ExecutorResult> {
    // Automações requerem validação extra e histórico
    // Por enquanto, retorna que precisa de LLM local/cloud pra criar
    return {
      success: false,
      message: 'Automação requer processamento adicional',
      speech: 'Um momento...',
      error: {
        code: 'NEEDS_LLM',
        message: 'Automation creation requires LLM processing',
        recoverable: true,
      },
      toolCalls,
    };
  }
}

export function createExecutor(context: ExecutorContext): IntentExecutor {
  return new IntentExecutor(context);
}
