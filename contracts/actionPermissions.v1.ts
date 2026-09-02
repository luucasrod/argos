export const ACTION_PERMISSION_SCHEMA_VERSION = 1 as const;

export type ActionRiskLevel = 'trivial' | 'elevated' | 'high' | 'critical';
export type ActionOrigin = 'local' | 'remote';
export type PermissionDecision = 'allow' | 'requireConfirmation' | 'requireReauthentication' | 'block';

export interface CapabilityRiskRule {
  capability: string;
  risk: ActionRiskLevel;
  requiresLocalPresence: boolean;
  remoteAllowed: boolean;
  reason: string;
}

export interface ActionPermissionRequest {
  schemaVersion: typeof ACTION_PERMISSION_SCHEMA_VERSION;
  capability: string;
  origin: ActionOrigin;
  localPresence: boolean;
  /** Confirmação específica para esta ação; nunca é herdada de outra capability. */
  actionConfirmed: boolean;
  /** Reautenticação recente e vinculada ao usuário que pediu esta ação. */
  recentlyReauthenticated: boolean;
  userPermission: 'granted' | 'denied' | 'unknown';
}

export interface ActionPermissionResult {
  decision: PermissionDecision;
  risk: ActionRiskLevel;
  capability: string;
  requirements: Array<'localPresence' | 'confirmation' | 'reauthentication' | 'permission'>;
  reason: string;
}

export const DEFAULT_CAPABILITY_RISK_RULES: readonly CapabilityRiskRule[] = [
  { capability: 'onOff', risk: 'trivial', requiresLocalPresence: false, remoteAllowed: true, reason: 'Liga ou desliga aparelho comum.' },
  { capability: 'brightness', risk: 'trivial', requiresLocalPresence: false, remoteAllowed: true, reason: 'Ajuste reversível de iluminação.' },
  { capability: 'mediaPlay', risk: 'trivial', requiresLocalPresence: false, remoteAllowed: true, reason: 'Controle reversível de mídia.' },
  { capability: 'volume', risk: 'elevated', requiresLocalPresence: false, remoteAllowed: true, reason: 'Pode causar incômodo no ambiente.' },
  { capability: 'temperature', risk: 'elevated', requiresLocalPresence: false, remoteAllowed: true, reason: 'Altera conforto e consumo.' },
  { capability: 'sensorRead', risk: 'elevated', requiresLocalPresence: false, remoteAllowed: true, reason: 'Pode revelar estado privado da casa.' },
  { capability: 'lock', risk: 'high', requiresLocalPresence: true, remoteAllowed: false, reason: 'Altera acesso físico ao imóvel.' },
  { capability: 'doorOpen', risk: 'critical', requiresLocalPresence: true, remoteAllowed: false, reason: 'Abre acesso físico imediatamente.' },
  { capability: 'securityDisarm', risk: 'critical', requiresLocalPresence: true, remoteAllowed: false, reason: 'Desativa proteção do imóvel.' },
  { capability: 'purchase', risk: 'critical', requiresLocalPresence: true, remoteAllowed: false, reason: 'Gera compromisso financeiro.' },
] as const;

const UNKNOWN_RULE: CapabilityRiskRule = {
  capability: 'unknown',
  risk: 'high',
  requiresLocalPresence: true,
  remoteAllowed: false,
  reason: 'Capability desconhecida usa política conservadora.',
};

function ruleFor(capability: string, rules: readonly CapabilityRiskRule[]): CapabilityRiskRule {
  return rules.find((rule) => rule.capability === capability) ?? { ...UNKNOWN_RULE, capability };
}

/** Avalia somente autorização e risco; tom/personality não participa desta decisão. */
export function evaluateActionPermission(
  request: ActionPermissionRequest,
  rules: readonly CapabilityRiskRule[] = DEFAULT_CAPABILITY_RISK_RULES
): ActionPermissionResult {
  if (request.schemaVersion !== ACTION_PERMISSION_SCHEMA_VERSION) {
    throw new Error('schemaVersion de permissão não suportada');
  }
  if (!request.capability.trim()) throw new Error('capability obrigatoria');
  const rule = ruleFor(request.capability, rules);

  if (request.userPermission === 'denied') {
    return { decision: 'block', risk: rule.risk, capability: request.capability, requirements: ['permission'], reason: 'Usuário negou permissão para esta capability.' };
  }
  if (!rule.remoteAllowed && request.origin === 'remote') {
    return { decision: 'block', risk: rule.risk, capability: request.capability, requirements: ['localPresence'], reason: 'Esta ação não é permitida remotamente.' };
  }
  if (rule.requiresLocalPresence && !request.localPresence) {
    return { decision: 'block', risk: rule.risk, capability: request.capability, requirements: ['localPresence'], reason: 'Presença local confiável é obrigatória.' };
  }
  if (request.userPermission === 'unknown' && rule.risk !== 'trivial') {
    return { decision: 'requireConfirmation', risk: rule.risk, capability: request.capability, requirements: ['permission', 'confirmation'], reason: 'Permissão explícita ainda não foi concedida.' };
  }
  if ((rule.risk === 'high' || rule.risk === 'critical') && !request.recentlyReauthenticated) {
    return { decision: 'requireReauthentication', risk: rule.risk, capability: request.capability, requirements: ['reauthentication', 'confirmation'], reason: 'Ação sensível exige reautenticação recente.' };
  }
  if (rule.risk !== 'trivial' && !request.actionConfirmed) {
    return { decision: 'requireConfirmation', risk: rule.risk, capability: request.capability, requirements: ['confirmation'], reason: 'Ação exige confirmação específica.' };
  }

  return { decision: 'allow', risk: rule.risk, capability: request.capability, requirements: [], reason: 'Requisitos de risco e permissão satisfeitos.' };
}
