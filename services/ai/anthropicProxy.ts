/**
 * anthropicProxy.ts
 * Dev (expo start): SDK direta com EXPO_PUBLIC_ANTHROPIC_API_KEY
 * Prod (Vercel): POST /api/chat com Bearer token Supabase
 */
import { getAnthropicClient } from './anthropic';
import { supabase } from '@/services/auth/supabase';
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

export async function createMessage(params: MessageParams): Promise<MessageResponse> {
  if (__DEV__) {
    // Desenvolvimento: SDK direto (usa EXPO_PUBLIC_ANTHROPIC_API_KEY do .env)
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: params.model,
      system: params.system,
      messages: params.messages,
      max_tokens: params.max_tokens ?? 1024,
    });
    return response as MessageResponse;
  }

  // Produção: proxy seguro via Vercel com auth Supabase
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('Usuário não autenticado. Faça login para usar o Argos.');
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const errorType = err.error ?? 'api_error';
    const errorMsg = err.message ?? `HTTP ${response.status}`;

    if (response.status === 401) {
      throw { status: 401, error: { type: 'authentication_error', message: errorMsg } };
    }
    throw { status: response.status, error: { type: errorType, message: errorMsg } };
  }

  return response.json() as Promise<MessageResponse>;
}

/** Em produção sempre considera configurado (chave no servidor) */
export function isConfigured(): boolean {
  if (!__DEV__) return true;
  const key = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.trim() ?? '';
  return key.length > 20;
}
