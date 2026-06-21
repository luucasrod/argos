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
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('Chave da API')) return msg;
    if (msg.includes('autenticado') || msg.includes('login')) {
      return 'Você precisa estar logado para conversar comigo.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('Network')) {
      return 'Sem conexão com o servidor. Verifique sua internet.';
    }
    return msg;
  }

  const apiErr = err as {
    status?: number;
    message?: string;
    error?: { type?: string; message?: string };
  };

  const detail = apiErr.error?.message ?? apiErr.message ?? '';

  if (apiErr.status === 401 || apiErr.error?.type === 'authentication_error') {
    if (detail.includes('Sessão') || detail.includes('Token')) {
      return 'Sua sessão expirou. Faça login novamente.';
    }
    return 'Não consegui autenticar com o servidor de IA.';
  }

  if (apiErr.status === 404 || detail.includes('model')) {
    return 'Modelo de IA inválido. Troque para Haiku ou Sonnet em Configurações.';
  }

  if (apiErr.status === 500) {
    return 'O servidor de IA está indisponível no momento.';
  }

  if (detail) return detail;

  return 'Não consegui processar sua mensagem. Tente de novo.';
}

/** Versão curta para falar em voz alta. */
export function getSpeechErrorMessage(err: unknown, fallback?: string): string {
  const text = fallback ?? getApiErrorMessage(err);

  if (text.includes('logado') || text.includes('sessão') || text.includes('login')) {
    return 'Você precisa fazer login para eu poder te ajudar.';
  }
  if (text.includes('conexão') || text.includes('internet') || text.includes('servidor')) {
    return 'Desculpe, não consegui me conectar agora. Verifique sua internet.';
  }
  if (text.includes('acesso') || text.includes('disponível')) {
    return 'Desculpe, não tenho acesso a isso agora.';
  }
  if (text.length > 120) {
    return 'Desculpe, não consegui fazer isso agora. Tente de outro jeito.';
  }
  return text.startsWith('Desculpe') ? text : `Desculpe, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
