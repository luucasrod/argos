import { fetch as expoFetch } from 'expo/fetch';
import { getAccessToken, clearAuthSession } from '@/services/auth/session';
import { isAuthRequired } from '@/services/auth/config';
import { useAuthStore } from '@/stores/useAuthStore';
import { API_BASE } from '@/constants/api';
import { createStreamingTtsEngine } from '@/services/voice/streamingTts';
import { isTurnStale, beginTtsTurn, endTtsTurn } from '@/services/voice/bargeIn';
import { perfMark } from '@/services/voice/perfLog';

export interface StreamingChatOptions {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  personality: {
    language: string;
    voiceGender: 'female' | 'male';
    voiceSpeed: number;
  };
}

export async function handleStreamingLLM(
  options: StreamingChatOptions,
  onToken?: (token: string) => void
): Promise<{ text: string; usedStreaming: boolean }> {
  const token = await resolveToken();
  const turnGen = beginTtsTurn();
  const cancelled = () => isTurnStale(turnGen);
  const engine = await createStreamingTtsEngine({
    personality: options.personality,
    cancelled,
  });

  try {
    perfMark('llm_requisicao_enviada_streaming_tts');
    const res = await expoFetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        system: options.system,
        messages: options.messages,
        max_tokens: options.max_tokens ?? 1024,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      await engine.stop();
      endTtsTurn(turnGen);
      return fallbackToNonStreaming();
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let gotAnyChunk = false;
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) gotAnyChunk = true;
        const chunk = decoder.decode(value, { stream: true });
        buf += chunk;
        fullText += chunk;

        await engine.processToken(buf);
        buf = '';

        onToken?.(chunk);

        if (cancelled()) {
          perfMark('streaming_tts_interrompido_barge_in');
          await engine.stop();
          return { text: fullText, usedStreaming: true };
        }
      }
      const tail = decoder.decode();
      if (tail) {
        buf += tail;
        fullText += tail;
        await engine.processToken(buf);
      }
    } catch {
      if (!fullText.trim()) {
        await engine.stop();
        endTtsTurn(turnGen);
        return fallbackToNonStreaming();
      }
    }

    if (!gotAnyChunk || !fullText.trim()) {
      await engine.stop();
      endTtsTurn(turnGen);
      return fallbackToNonStreaming();
    }

    await engine.flush();
    await engine.stop();
    endTtsTurn(turnGen);

    return { text: fullText, usedStreaming: true };
  } catch {
    await engine.stop();
    endTtsTurn(turnGen);
    return fallbackToNonStreaming();
  }
}

function fallbackToNonStreaming(): { text: string; usedStreaming: boolean } {
  perfMark('llm_streaming_tts_indisponivel_caindo_para_padrao');
  return { text: '', usedStreaming: false };
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
