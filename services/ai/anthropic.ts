import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from './config';

let client: Anthropic | null = null;
let cachedKey: string | null = null;

export function getAnthropicClient(): Anthropic {
  const apiKey = getAnthropicApiKey();

  if (!apiKey) {
    throw new Error(
      'Chave da API não configurada. Verifique o arquivo .env na pasta argos e reinicie o Expo.'
    );
  }

  if (!client || cachedKey !== apiKey) {
    cachedKey = apiKey;
    client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  return client;
}

export function resetClient() {
  client = null;
  cachedKey = null;
}

export function getApiErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.includes('Chave da API')) {
    return err.message;
  }

  const apiErr = err as {
    status?: number;
    message?: string;
    error?: { type?: string; message?: string };
  };

  const detail = apiErr.error?.message ?? apiErr.message;

  if (apiErr.status === 401 || apiErr.error?.type === 'authentication_error') {
    return 'Falha de autenticação com a IA. A chave no .env pode estar inválida ou revogada.';
  }

  if (apiErr.status === 404 || detail?.includes('model')) {
    return 'Modelo de IA inválido. Troque para Haiku ou Sonnet em Configurações.';
  }

  if (detail) {
    return __DEV__ ? `Erro da IA: ${detail}` : 'Não consegui processar sua mensagem. Tente de novo.';
  }

  return 'Não consegui processar sua mensagem. Verifique sua conexão e tente de novo.';
}
