import { useSettingsStore } from '@/stores/useSettingsStore';

export const ANTHROPIC_MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5',
} as const;

export type AnthropicModelId =
  (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];

const MODEL_IDS = new Set<string>(Object.values(ANTHROPIC_MODELS));

/** Chave Anthropic: apenas para uso em __DEV__ (SDK direta). Em produção o chat passa por /api/chat. */
export function getAnthropicApiKey(): string {
  const fromEnv = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.trim() ?? '';
  if (fromEnv) return fromEnv;

  const legacy = (
    useSettingsStore.getState().settings as { apiKey?: string }
  ).apiKey?.trim();
  return legacy ?? '';
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey().length > 20;
}

export function resolveAnthropicModel(model: string | undefined): AnthropicModelId {
  if (model && MODEL_IDS.has(model)) {
    return model as AnthropicModelId;
  }
  return ANTHROPIC_MODELS.sonnet;
}
