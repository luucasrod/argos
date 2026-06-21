import { useState, useCallback, useEffect, useRef } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { VOICE_SILENCE_MS, type UseVoiceOptions } from '@/constants/voice';

export type { UseVoiceOptions };

let Voice: {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onSpeechResults?: (e: { value?: string[] }) => void;
  onSpeechError?: (e: { error?: { message?: string } }) => void;
} | null = null;

try {
  Voice = require('@react-native-voice/voice').default;
} catch {
  console.warn('Voice recognition not available');
}

export function useVoice(options?: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { setStatus } = useAIStore();

  const transcriptRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSendRef = useRef(options?.onAutoSend);
  const isListeningRef = useRef(false);
  const silenceMs = options?.silenceMs ?? VOICE_SILENCE_MS;

  onAutoSendRef.current = options?.onAutoSend;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const finalizeListening = useCallback(
    async (submit: boolean) => {
      clearSilenceTimer();
      const text = transcriptRef.current.trim();
      isListeningRef.current = false;
      setIsListening(false);
      setStatus('idle');

      if (Voice) {
        try {
          await Voice.stop();
        } catch {}
      }

      transcriptRef.current = '';
      setTranscript('');

      if (submit && text && onAutoSendRef.current) {
        onAutoSendRef.current(text);
      }

      return text;
    },
    [clearSilenceTimer, setStatus]
  );

  const scheduleAutoSend = useCallback(() => {
    if (!onAutoSendRef.current) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!isListeningRef.current) return;
      const text = transcriptRef.current.trim();
      if (!text) return;
      void finalizeListening(true);
    }, silenceMs);
  }, [clearSilenceTimer, finalizeListening, silenceMs]);

  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechStart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setStatus('listening');
    };

    Voice.onSpeechEnd = () => {
      isListeningRef.current = false;
      setIsListening(false);
    };

    Voice.onSpeechResults = (e) => {
      const result = e.value?.[0] || '';
      transcriptRef.current = result;
      setTranscript(result);
      scheduleAutoSend();
    };

    Voice.onSpeechError = (e) => {
      setError(e.error?.message || 'Erro no reconhecimento de voz');
      isListeningRef.current = false;
      setIsListening(false);
      setStatus('idle');
      clearSilenceTimer();
    };

    return () => {
      clearSilenceTimer();
      Voice?.destroy().then(() => Voice?.removeAllListeners());
    };
  }, [setStatus, scheduleAutoSend, clearSilenceTimer]);

  const startListening = useCallback(async () => {
    if (!Voice) {
      setError('Reconhecimento de voz não disponível neste dispositivo');
      return;
    }

    try {
      clearSilenceTimer();
      transcriptRef.current = '';
      setTranscript('');
      setError(null);
      await Voice.start('pt-BR');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar voz');
    }
  }, [clearSilenceTimer]);

  const stopListening = useCallback(
    (submit = false) => {
      void finalizeListening(submit);
    },
    [finalizeListening]
  );

  return { isListening, transcript, error, startListening, stopListening, setTranscript };
}
