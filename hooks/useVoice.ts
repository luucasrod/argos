import { useState, useCallback, useEffect } from 'react';
import { useAIStore } from '@/stores/useAIStore';

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

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { setStatus } = useAIStore();

  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechStart = () => {
      setIsListening(true);
      setStatus('listening');
    };

    Voice.onSpeechEnd = () => {
      setIsListening(false);
    };

    Voice.onSpeechResults = (e) => {
      const result = e.value?.[0] || '';
      setTranscript(result);
    };

    Voice.onSpeechError = (e) => {
      setError(e.error?.message || 'Erro no reconhecimento de voz');
      setIsListening(false);
      setStatus('idle');
    };

    return () => {
      Voice?.destroy().then(() => Voice?.removeAllListeners());
    };
  }, [setStatus]);

  const startListening = useCallback(async () => {
    if (!Voice) {
      setError('Reconhecimento de voz não disponível neste dispositivo');
      return;
    }

    try {
      setTranscript('');
      setError(null);
      await Voice.start('pt-BR');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar voz');
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (!Voice) return;
    try {
      await Voice.stop();
      setIsListening(false);
    } catch (e) {
      console.warn('Stop listening error:', e);
    }
  }, []);

  return { isListening, transcript, error, startListening, stopListening, setTranscript };
}
