/**
 * anthropicProxy.ts
 * Dev: SDK direta com EXPO_PUBLIC_ANTHROPIC_API_KEY
 * Prod: POST /api/chat (com ou sem auth, conforme SKIP_AUTH)
 */
import { getAnthropicClient } from './anthropic';
import { getAccessToken, clearAuthSession } from '@/services/auth/session';
import { isAuthRequired } from '@/services/auth/config';
import { useAuthStore } from '@/stores/useAuthStore';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface MessageParams {
  model: string;
  system: string;
  messages: MessageParam[];
  max_tokens?: number;
}

export interface MessageResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callChatApi(params: MessageParams, token?: string): Promise<MessageResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const { API_BASE } = await import('@/constants/api');
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const errorType = err.error ?? 'api_error';
    const errorMsg = err.message ?? `HTTP ${response.status}`;

    if (response.status === 401 && isAuthRequired()) {
      await clearAuthSession();
      useAuthStore.getState().setUser(null);
      throw { status: 401, error: { type: 'authentication_error', message: errorMsg } };
    }
    throw { status: response.status, error: { type: errorType, message: errorMsg } };
  }

  return response.json() as Promise<MessageResponse>;
}

export async function createMessage(params: MessageParams): Promise<MessageResponse> {
  if (__DEV__) {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: params.model,
      system: params.system,
      messages: params.messages,
      max_tokens: params.max_tokens ?? 1024,
    });
    return response as MessageResponse;
  }

  if (!isAuthRequired()) {
    return callChatApi(params);
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    await clearAuthSession();
    useAuthStore.getState().setUser(null);
    throw new Error('Usuário não autenticado. Faça login para usar o Argos.');
  }

  return callChatApi(params, token);
}

export function isConfigured(): boolean {
  if (__DEV__) {
    const key = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.trim() ?? '';
    return key.length > 20;
  }
  return true;
}
