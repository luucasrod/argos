// Stub nativo — SDK da Anthropic não funciona em React Native (usa node:fs etc.)
// No mobile, toda comunicação com a IA vai pelo endpoint /api/chat no Vercel.

export function getAnthropicClient(): never {
  throw new Error('Anthropic SDK não disponível no native — use o endpoint /api/chat');
}

export function resetClient(): void {}

export function getApiErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
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

  if (apiErr.status === 401) return 'Não consegui autenticar com o servidor de IA.';
  if (apiErr.status === 500) return 'O servidor de IA está indisponível no momento.';
  if (detail) return detail;

  return 'Não consegui processar sua mensagem. Tente de novo.';
}

export function getSpeechErrorMessage(err: unknown, fallback?: string): string {
  const text = fallback ?? getApiErrorMessage(err);
  if (text.includes('logado') || text.includes('sessão')) {
    return 'Você precisa fazer login para eu poder te ajudar.';
  }
  if (text.includes('conexão') || text.includes('internet')) {
    return 'Desculpe, não consegui me conectar agora.';
  }
  return text.startsWith('Desculpe') ? text : `Desculpe, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
