import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Message } from '@/types/ai.types';

/** Monta histórico válido para a API (sem duplicar a última mensagem do usuário). */
export function buildApiMessageHistory(messages: Message[]): MessageParam[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-20)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.trim(),
    }));
}
