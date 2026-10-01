import { useCallback, useRef, useState } from 'react';
import { handleStreamingLLM, type StreamingChatOptions } from '@/services/ai/streamingChat';

export interface VoiceStreamState {
  isStreaming: boolean;
  text: string;
  error: string | null;
}

/**
 * Hook fino para resposta de voz em streaming: Claude gera tokens, o buffer TTS
 * sintetiza chunks enquanto a resposta ainda chega, e o playback começa antes
 * do texto completo existir. O fluxo antigo pode continuar chamando `speak()`.
 */
export function useVoiceStream() {
  const [state, setState] = useState<VoiceStreamState>({
    isStreaming: false,
    text: '',
    error: null,
  });
  const generationRef = useRef(0);

  const streamVoiceResponse = useCallback(async (options: StreamingChatOptions) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setState({ isStreaming: true, text: '', error: null });

    try {
      console.log('[STREAMING] iniciando Claude + TTS streaming');
      const result = await handleStreamingLLM(options, (token) => {
        if (generationRef.current !== generation) return;
        setState((prev) => ({ ...prev, text: prev.text + token }));
      });

      if (generationRef.current === generation) {
        setState({ isStreaming: false, text: result.text, error: null });
      }
      console.log(`[STREAMING] finalizado usedStreaming=${result.usedStreaming}`);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'voice_stream_error';
      if (generationRef.current === generation) {
        setState((prev) => ({ ...prev, isStreaming: false, error: message }));
      }
      console.warn('[STREAMING] erro:', message);
      return { text: '', usedStreaming: false };
    }
  }, []);

  const cancelVoiceStream = useCallback(() => {
    generationRef.current += 1;
    setState((prev) => ({ ...prev, isStreaming: false }));
    console.log('[STREAMING] cancelado pelo cliente');
  }, []);

  return {
    ...state,
    streamVoiceResponse,
    cancelVoiceStream,
  };
}
