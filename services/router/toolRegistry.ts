/**
 * Tool Registry — Registro centralizado de todas as ferramentas disponíveis
 * LLM/Intent pode solicitar essas ferramentas, mas precisa de validação
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  outputSchema?: {
    type: 'object';
    properties: Record<string, unknown>;
  };
  riskLevel: 'low' | 'medium' | 'high';
  permissions: string[];
  timeout: number; // ms
  idempotent: boolean;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(filters?: { riskLevel?: string; permissions?: string[] }): ToolDefinition[] {
    const allTools = Array.from(this.tools.values());

    if (!filters) return allTools;

    return allTools.filter((tool) => {
      if (filters.riskLevel && tool.riskLevel !== filters.riskLevel) return false;
      if (filters.permissions) {
        const hasAllPermissions = filters.permissions.every((perm) =>
          tool.permissions.includes(perm)
        );
        if (!hasAllPermissions) return false;
      }
      return true;
    });
  }

  validateToolCall(
    toolName: string,
    args: Record<string, unknown>,
    userPermissions: string[]
  ): { valid: boolean; error?: string } {
    const tool = this.getTool(toolName);
    if (!tool) {
      return { valid: false, error: `Tool ${toolName} not found` };
    }

    // Valida permissões
    for (const requiredPerm of tool.permissions) {
      if (!userPermissions.includes(requiredPerm)) {
        return { valid: false, error: `Missing permission: ${requiredPerm}` };
      }
    }

    // Valida schema (básico)
    for (const required of tool.inputSchema.required) {
      if (!(required in args)) {
        return { valid: false, error: `Missing required argument: ${required}` };
      }
    }

    return { valid: true };
  }
}

// Factory para criar registry padrão
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Device control tools
  registry.registerTool({
    name: 'turnLightOn',
    description: 'Liga uma luz específica',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'ID do dispositivo' },
      },
      required: ['deviceId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
    riskLevel: 'low',
    permissions: ['device:control', 'device:light'],
    timeout: 3000,
    idempotent: true,
  });

  registry.registerTool({
    name: 'turnLightOff',
    description: 'Desliga uma luz específica',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'ID do dispositivo' },
      },
      required: ['deviceId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
    riskLevel: 'low',
    permissions: ['device:control', 'device:light'],
    timeout: 3000,
    idempotent: true,
  });

  registry.registerTool({
    name: 'getDeviceState',
    description: 'Consulta o estado de um dispositivo',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'ID do dispositivo' },
      },
      required: ['deviceId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        isOn: { type: 'boolean' },
        brightness: { type: 'number' },
        temperature: { type: 'number' },
      },
    },
    riskLevel: 'low',
    permissions: ['device:query'],
    timeout: 2000,
    idempotent: true,
  });

  registry.registerTool({
    name: 'createAutomation',
    description: 'Cria uma automação',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        trigger: { type: 'object' },
        conditions: { type: 'array' },
        actions: { type: 'array' },
      },
      required: ['name', 'trigger', 'actions'],
    },
    riskLevel: 'high',
    permissions: ['automation:create', 'automation:manage'],
    timeout: 5000,
    idempotent: false,
  });

  registry.registerTool({
    name: 'getWeather',
    description: 'Obtém informações de clima',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Localização' },
      },
      required: ['location'],
    },
    riskLevel: 'low',
    permissions: ['external:weather'],
    timeout: 5000,
    idempotent: true,
  });

  registry.registerTool({
    name: 'saveMemory',
    description: 'Salva uma memória/contexto do usuário',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
      },
      required: ['title', 'content', 'category'],
    },
    riskLevel: 'low',
    permissions: ['memory:write'],
    timeout: 2000,
    idempotent: false,
  });

  return registry;
}

// Singleton global
let globalRegistry: ToolRegistry | null = null;

export function getGlobalToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = createDefaultToolRegistry();
  }
  return globalRegistry;
}
