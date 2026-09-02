import type {
  MediaAction,
  MediaPreferences,
  MediaProvider,
  MediaResolutionRequest,
  MediaTarget,
  ResolvedMediaRoute,
} from './types';

export class MediaProviderError extends Error {
  constructor(
    readonly code: 'provider_not_found' | 'target_not_found' | 'offline' | 'unsupported',
    message: string
  ) {
    super(message);
    this.name = 'MediaProviderError';
  }
}

export class MediaRegistry {
  private readonly providers = new Map<string, MediaProvider>();
  private readonly targets = new Map<string, MediaTarget>();

  registerProvider(provider: MediaProvider): void {
    if (!provider.id.trim()) throw new Error('MediaProvider.id obrigatório');
    if (this.providers.has(provider.id)) throw new Error(`Provider duplicado: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  registerTarget(target: MediaTarget): void {
    if (!target.id.trim() || !target.endpointId.trim()) {
      throw new Error('MediaTarget id/endpointId obrigatórios');
    }
    if (!this.providers.has(target.providerId)) {
      throw new MediaProviderError(
        'provider_not_found',
        `Provider do target não registrado: ${target.providerId}`
      );
    }
    this.targets.set(target.id, { ...target });
  }

  resolve(
    request: MediaResolutionRequest,
    preferences: MediaPreferences = {}
  ): ResolvedMediaRoute {
    const reasons: string[] = [];
    const preferredRoomTarget = request.roomId
      ? preferences.targetByRoomId?.[request.roomId]
      : undefined;
    const targetId = request.targetId ?? preferredRoomTarget ?? preferences.defaultTargetId;
    let target = targetId ? this.targets.get(targetId) : undefined;

    const requestedProviderId = request.providerId ?? preferences.defaultProviderId;
    if (!target && request.roomId) {
      target = [...this.targets.values()].find((candidate) =>
        candidate.roomId === request.roomId &&
        (!requestedProviderId || candidate.providerId === requestedProviderId) &&
        candidate.online
      );
      if (target) reasons.push('target-online-no-cômodo');
    }
    if (!target && requestedProviderId) {
      target = [...this.targets.values()].find((candidate) =>
        candidate.providerId === requestedProviderId && candidate.online
      );
      if (target) reasons.push('primeiro-target-online-do-provider');
    }
    if (!target) {
      target = [...this.targets.values()].find((candidate) => candidate.online);
      if (target) reasons.push('primeiro-target-online');
    }
    if (!target) throw new MediaProviderError('target_not_found', 'Nenhum target de mídia disponível');
    if (!target.online) throw new MediaProviderError('offline', `Target offline: ${target.name}`);

    const providerId = request.providerId ?? target.providerId ?? preferences.defaultProviderId;
    const provider = providerId ? this.providers.get(providerId) : undefined;
    if (!provider) {
      throw new MediaProviderError('provider_not_found', `Provider não encontrado: ${providerId}`);
    }
    if (provider.id !== target.providerId) {
      throw new MediaProviderError(
        'unsupported',
        `Target ${target.id} não pertence ao provider ${provider.id}`
      );
    }
    if (request.targetId) reasons.push('target-explícito');
    else if (preferredRoomTarget) reasons.push('preferência-do-cômodo');
    else if (preferences.defaultTargetId) reasons.push('target-padrão');
    if (request.providerId) reasons.push('provider-explícito');
    else if (preferences.defaultProviderId) reasons.push('provider-padrão');

    return { provider, target: { ...target }, reasons };
  }

  assertCapability(provider: MediaProvider, action: MediaAction): void {
    if (!provider.capabilities.includes(action)) {
      throw new MediaProviderError(
        'unsupported',
        `Provider ${provider.id} não suporta ${action}`
      );
    }
  }
}
