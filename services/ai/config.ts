import Constants from 'expo-constants';
import { useSettingsStore } from '@/stores/useSettingsStore';

export const ANTHROPIC_MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5',
} as const;

export type AnthropicModelId =
  (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];

const MODEL_IDS = new Set<string>(Object.values(ANTHROPIC_MODELS));

function getExpoExtra(): Record<string, unknown> {
  const manifest = Constants.expoConfig ?? Constants.manifest;
  return (manifest as { extra?: Record<string, unknown> } | null)?.extra ?? {};
}

/** Chave Anthropic: app.config extra → EXPO_PUBLIC → legado nas settings. */
export function getAnthropicApiKey(): string {
  const fromExtra = getExpoExtra().anthropicApiKey;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim();
  }

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
