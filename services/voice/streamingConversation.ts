/**
 * streamingConversation.ts — issue #237 (Fase 4, épico #232, voz
 * conversacional em tempo real).
 *
 * Consome `POST /api/chat` com `stream:true` (ver api/chat.ts) usando
 * `expo/fetch` — o fetch padrão do React Native historicamente não expõe
 * `response.body` como `ReadableStream` de verdade; o de `expo/fetch`
 * (Expo SDK 54, `node_modules/expo/build/winter/fetch`) expõe. Continua
 * sendo o texto bruto do Claude (mesmo formato JSON de sempre) — só chega
 * em pedaços em vez de tudo de uma vez.
 *
 * Fica atrás de `isVoiceSessionV2Enabled` (chamador decide) e tem fallback
 * completo pra `createMessage` (`anthropicProxy.native.ts`, o caminho de
 * sempre) em qualquer situação que não seja "stream funcionou do começo ao
 * fim" — servidor não suportou, rede caiu no meio, o que for. Quem chama
 * nunca precisa saber qual dos dois caminhos foi usado.
 */
import { fetch as expoFetch } from 'expo/fetch';
import { getAccessToken, clearAuthSession } from '@/services/auth/session';
import { isAuthRequired } from '@/services/auth/config';
import { useAuthStore } from '@/stores/useAuthStore';
import { API_BASE } from '@/constants/api';
import { createMessage, type MessageParams } from '@/services/ai/anthropicProxy';
import { extractSpeechFieldIfComplete } from './streamingJsonScanner';
import { perfMark } from './perfLog';

/** Marcador que api/chat.ts escreve no final do stream se o Anthropic falhar no meio. */
const STREAM_ERROR_PREFIX = '__ARGOS_STREAM_ERROR__:';

export interface StreamingChatResult {
  /** Texto bruto — mesmo formato que `parseAIResponse` já espera. */
  rawText: string;
  /** true se o stream chegou a entregar algum chunk (mesmo que tenha caído no meio). */
  usedStreaming: boolean;
}

async function resolveToken(): Promise<string | undefined> {
  if (!isAuthRequired()) return undefined;
  try {
    return await getAccessToken();
  } catch {
    await clearAuthSession();
    useAuthStore.getState().setUser(null);
    throw new Error('Usuário não autenticado. Faça login para usar o Argos.');
  }
}

/**
 * Envia a mensagem em streaming. `onEarlySpeech` dispara UMA vez, assim que
 * o campo `speech` fechar no JSON ainda incompleto — quem chama normalmente
 * usa isso pra disparar `prefetchCloudSpeech` (`cloudTts.ts`) em paralelo
 * com o resto do stream, sem esperar `actions`/`text` terminarem de chegar.
 */
export async function sendChatMessageStreaming(
  params: MessageParams,
  onEarlySpeech?: (speech: string) => void
): Promise<StreamingChatResult> {
  const token = await resolveToken();

  let res: Response;
  try {
    perfMark('llm_requisicao_enviada_streaming');
    res = await expoFetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...params, stream: true }),
    });
  } catch {
    return fallbackToNonStreaming(params);
  }

  if (!res.ok || !res.body) {
    return fallbackToNonStreaming(params);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let speechSent = false;
  let gotAnyChunk = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) gotAnyChunk = true;
      buf += decoder.decode(value, { stream: true });
      if (!speechSent) {
        const speech = extractSpeechFieldIfComplete(buf);
        if (speech !== null) {
          speechSent = true;
          perfMark('llm_speech_extraido_antecipadamente');
          onEarlySpeech?.(speech);
        }
      }
    }
    buf += decoder.decode();
  } catch {
    // Stream caiu no meio — se já temos ALGUM texto, ainda tentamos parsear
    // (pode ter vindo um JSON completo antes de cair); senão, cai pro
    // caminho não-streaming do zero.
    if (!buf.trim()) return fallbackToNonStreaming(params);
  }

  if (!gotAnyChunk || !buf.trim()) {
    return fallbackToNonStreaming(params);
  }

  const errorIndex = buf.indexOf(STREAM_ERROR_PREFIX);
  if (errorIndex >= 0) {
    const beforeError = buf.slice(0, errorIndex).trim();
    // Se o JSON já tinha fechado ANTES do marcador de erro aparecer, o erro
    // veio depois de tudo que importa — segue com o texto válido. Senão, o
    // stream quebrou no meio de verdade: cai pro caminho de sempre.
    if (beforeError.startsWith('{') && beforeError.endsWith('}')) {
      perfMark('llm_resposta_recebida_streaming');
      return { rawText: beforeError, usedStreaming: true };
    }
    return fallbackToNonStreaming(params);
  }

  perfMark('llm_resposta_recebida_streaming');
  return { rawText: buf, usedStreaming: true };
}

async function fallbackToNonStreaming(params: MessageParams): Promise<StreamingChatResult> {
  perfMark('llm_streaming_indisponivel_caindo_para_padrao');
  const response = await createMessage(params);
  const rawText = response.content[0]?.type === 'text' ? (response.content[0].text ?? '') : '';
  return { rawText, usedStreaming: false };
}
