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
 *
 * Streaming TTS real-time: quando `personality` é passado nas opções, os
 * tokens do campo `speech` alimentam um `StreamingTtsEngine` assim que
 * chegam — o usuário ouve a resposta enquanto o LLM ainda está gerando.
 * `speak()` subsequente com o mesmo texto simplesmente aguarda o áudio já
 * em andamento terminar, sem re-sintetizar.
 */
import { fetch as expoFetch } from 'expo/fetch';
import { getAccessToken, clearAuthSession } from '@/services/auth/session';
import { isAuthRequired } from '@/services/auth/config';
import { useAuthStore } from '@/stores/useAuthStore';
import { API_BASE } from '@/constants/api';
import { createMessage, type MessageParams } from '@/services/ai/anthropicProxy';
import { extractSpeechFieldIfComplete, SpeechTokenScanner } from './streamingJsonScanner';
import { createStreamingTtsEngine } from './streamingTts';
import { registerStreamingTts } from './streamingTtsState';
import { beginTtsTurn, endTtsTurn, isTurnStale } from './bargeIn';
import { perfMark } from './perfLog';

/** Marcador que api/chat.ts escreve no final do stream se o Anthropic falhar no meio. */
const STREAM_ERROR_PREFIX = '__ARGOS_STREAM_ERROR__:';

export interface StreamingChatResult {
  /** Texto bruto — mesmo formato que `parseAIResponse` já espera. */
  rawText: string;
  /** true se o stream chegou a entregar algum chunk (mesmo que tenha caído no meio). */
  usedStreaming: boolean;
  /**
   * true se o TTS começou a tocar em streaming. Neste caso `speak()` chamado
   * com o mesmo texto `speech` vai aguardar o áudio terminar em vez de
   * re-sintetizar — ver `streamingTtsState.ts`.
   */
  ttsStreamed: boolean;
}

export interface StreamingOptions {
  /** Quando fornecido, ativa streaming TTS real-time (áudio toca enquanto o LLM gera). */
  personality?: {
    language: string;
    voiceGender: 'female' | 'male';
    voiceSpeed: number;
  };
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
 * o campo `speech` fechar no JSON ainda incompleto — usado para prefetch de
 * TTS quando streaming TTS real-time não está ativo.
 *
 * Quando `opts.personality` é fornecido, ativa streaming TTS real-time:
 * os tokens do campo `speech` alimentam um engine de TTS assim que chegam,
 * e o usuário ouve áudio enquanto o LLM ainda está gerando a resposta.
 */
export async function sendChatMessageStreaming(
  params: MessageParams,
  onEarlySpeech?: (speech: string) => void,
  opts?: StreamingOptions
): Promise<StreamingChatResult> {
  const token = await resolveToken();
  const speechScanner = new SpeechTokenScanner();
  const personality = opts?.personality;

  let engine: Awaited<ReturnType<typeof createStreamingTtsEngine>> | null = null;
  let turnGen = -1;
  let ttsStreamed = false;
  let fullSpeechText = '';

  if (personality) {
    turnGen = await beginTtsTurn();
    engine = await createStreamingTtsEngine({
      personality,
      cancelled: () => isTurnStale(turnGen),
    });
  }

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
    if (engine) await engine.stop();
    if (turnGen >= 0) endTtsTurn(turnGen);
    return fallbackToNonStreaming(params);
  }

  if (!res.ok || !res.body) {
    if (engine) await engine.stop();
    if (turnGen >= 0) endTtsTurn(turnGen);
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

      // Streaming TTS real-time: alimenta tokens do campo speech ao engine
      if (engine && !speechScanner.isDone) {
        const newTokens = speechScanner.feed(buf);
        if (newTokens) {
          fullSpeechText += newTokens;
          ttsStreamed = true;
          void engine.processToken(newTokens);
        }
      }

      // Prefetch legacy: quando personalidade não está disponível ou como fallback
      if (!speechSent) {
        const speech = extractSpeechFieldIfComplete(buf);
        if (speech !== null) {
          speechSent = true;
          perfMark('llm_speech_extraido_antecipadamente');
          onEarlySpeech?.(speech);
          // Se streaming TTS não está ativo, fullSpeechText vem do scanner completo
          if (!engine) fullSpeechText = speech;
        }
      }
    }
    buf += decoder.decode();
  } catch {
    if (!buf.trim()) {
      if (engine) await engine.stop();
      if (turnGen >= 0) endTtsTurn(turnGen);
      return fallbackToNonStreaming(params);
    }
  }

  // Flush de tokens restantes no buffer do engine
  if (engine && ttsStreamed) {
    try {
      await engine.flush();
    } catch {}
    // Registra no estado global para speak() poder aguardar sem re-sintetizar
    if (fullSpeechText.trim()) {
      const completionPromise = engine.waitForCompletion().finally(() => {
        endTtsTurn(turnGen);
      });
      registerStreamingTts(fullSpeechText, completionPromise, () => engine!.stop());
    } else {
      await engine.stop();
      endTtsTurn(turnGen);
    }
  } else if (turnGen >= 0) {
    endTtsTurn(turnGen);
  }

  if (!gotAnyChunk || !buf.trim()) {
    return fallbackToNonStreaming(params);
  }

  const errorIndex = buf.indexOf(STREAM_ERROR_PREFIX);
  if (errorIndex >= 0) {
    const beforeError = buf.slice(0, errorIndex).trim();
    if (beforeError.startsWith('{') && beforeError.endsWith('}')) {
      perfMark('llm_resposta_recebida_streaming');
      return { rawText: beforeError, usedStreaming: true, ttsStreamed };
    }
    return fallbackToNonStreaming(params);
  }

  perfMark('llm_resposta_recebida_streaming');
  return { rawText: buf, usedStreaming: true, ttsStreamed };
}

async function fallbackToNonStreaming(params: MessageParams): Promise<StreamingChatResult> {
  perfMark('llm_streaming_indisponivel_caindo_para_padrao');
  const response = await createMessage(params);
  const rawText = response.content[0]?.type === 'text' ? (response.content[0].text ?? '') : '';
  return { rawText, usedStreaming: false, ttsStreamed: false };
}
