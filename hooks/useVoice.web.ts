/**
 * useVoice.web.ts — Web Speech API
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { VOICE_SILENCE_MS, type UseVoiceOptions } from '@/constants/voice';
import {
  registerVoicePause,
  unregisterVoicePause,
  waitForMicRelease,
} from '@/services/voice/voiceSession';

export type { UseVoiceOptions };

interface SRInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
interface SRResultEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SRErrorEvent extends Event {
  error: string;
}

function getSpeechRecognitionCtor(): (new () => SRInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: new () => SRInstance;
    webkitSpeechRecognition?: new () => SRInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function requestMicPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return true;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export function useVoice(options?: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { setStatus } = useAIStore();
  const { settings } = useSettingsStore();

  const srRef = useRef<SRInstance | null>(null);
  const modeRef = useRef<'idle' | 'active'>('idle');
  const transcriptRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSendRef = useRef(options?.onAutoSend);
  const startingRef = useRef(false);
  const submittedRef = useRef(false);
  const silenceMs = options?.silenceMs ?? VOICE_SILENCE_MS;

  onAutoSendRef.current = options?.onAutoSend;

  const SRCtor = getSpeechRecognitionCtor();
  const isSupported = SRCtor !== null;
  const lang = settings.personality.language ?? 'pt-BR';

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const killSR = useCallback(() => {
    if (srRef.current) {
      try {
        srRef.current.abort();
      } catch {}
      srRef.current = null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    clearSilenceTimer();
    killSR();
    modeRef.current = 'idle';
    startingRef.current = false;
    setIsListening(false);
  }, [clearSilenceTimer, killSR]);

  const submitTranscript = useCallback(
    (text: string) => {
      if (!text || !onAutoSendRef.current || submittedRef.current) return;
      submittedRef.current = true;
      onAutoSendRef.current(text);
      setTimeout(() => {
        submittedRef.current = false;
      }, 3000);
    },
    []
  );

  const finalizeActiveListening = useCallback(
    (submit: boolean) => {
      const text = transcriptRef.current.trim();
      releaseMic();
      transcriptRef.current = '';
      setTranscript('');

      if (submit && text) {
        submitTranscript(text);
      } else if (!submit) {
        setStatus('idle');
      }
    },
    [releaseMic, setStatus, submitTranscript]
  );

  const scheduleAutoSend = useCallback(() => {
    if (!onAutoSendRef.current) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (modeRef.current !== 'active') return;
      const text = transcriptRef.current.trim();
      if (!text) return;
      finalizeActiveListening(true);
    }, silenceMs);
  }, [clearSilenceTimer, finalizeActiveListening, silenceMs]);

  const buildSR = useCallback((): SRInstance | null => {
    if (!SRCtor) return null;
    const r = new SRCtor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.maxAlternatives = 1;
    return r;
  }, [SRCtor, lang]);

  const attachHandlersRef = useRef<(rec: SRInstance) => void>(() => {});

  const restartActiveSession = useCallback(() => {
    if (modeRef.current !== 'active') return;
    const rec = buildSR();
    if (!rec) return;
    attachHandlersRef.current(rec);
    srRef.current = rec;
    try {
      rec.start();
    } catch {
      releaseMic();
      setStatus('idle');
    }
  }, [buildSR, releaseMic, setStatus]);

  const attachHandlers = useCallback(
    (rec: SRInstance) => {
      rec.onstart = () => {
        startingRef.current = false;
        setIsListening(true);
        setStatus('listening');
        setError(null);
      };

      rec.onresult = (e: SRResultEvent) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        if (!text.trim()) return;
        transcriptRef.current = text.trim();
        setTranscript(text.trim());
        scheduleAutoSend();
      };

      rec.onerror = (e: SRErrorEvent) => {
        if (e.error === 'aborted' || e.error === 'no-speech') return;

        if (e.error === 'audio-capture') {
          setError('Microfone indisponível. Verifique permissões e tente de novo.');
        } else if (e.error === 'not-allowed') {
          setError('Permissão do microfone negada. Libere nas configurações do navegador.');
        } else {
          setError('Erro no microfone: ' + e.error);
        }

        releaseMic();
        setStatus('idle');
      };

      rec.onend = () => {
        if (modeRef.current !== 'active') return;

        const text = transcriptRef.current.trim();
        if (text) {
          finalizeActiveListening(true);
          return;
        }

        /* Chrome encerra sessões longas — reinicia enquanto o usuário ainda escuta */
        srRef.current = null;
        setTimeout(() => restartActiveSession(), 250);
      };
    },
    [finalizeActiveListening, releaseMic, restartActiveSession, scheduleAutoSend, setStatus]
  );

  attachHandlersRef.current = attachHandlers;

  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError('Reconhecimento de voz não suportado. Use Chrome ou Edge.');
      return;
    }
    if (modeRef.current === 'active' || startingRef.current) return;

    const aiStatus = useAIStore.getState().status;
    if (aiStatus === 'thinking' || aiStatus === 'executing' || aiStatus === 'speaking') {
      return;
    }

    startingRef.current = true;
    submittedRef.current = false;
    releaseMic();
    await waitForMicRelease();

    const micOk = await requestMicPermission();
    if (!micOk) {
      startingRef.current = false;
      setError('Permissão do microfone negada. Libere nas configurações do navegador.');
      return;
    }

    modeRef.current = 'active';
    transcriptRef.current = '';
    setTranscript('');
    setError(null);

    const rec = buildSR();
    if (!rec) {
      startingRef.current = false;
      modeRef.current = 'idle';
      return;
    }

    attachHandlers(rec);
    srRef.current = rec;

    try {
      rec.start();
    } catch (err) {
      console.warn('[Argos Voice] falha ao iniciar:', err);
      startingRef.current = false;
      modeRef.current = 'idle';
      setError('Não foi possível acessar o microfone. Tente de novo.');
    }
  }, [isSupported, attachHandlers, buildSR, releaseMic]);

  const stopListening = useCallback(
    (submit = false) => {
      if (modeRef.current === 'active') {
        finalizeActiveListening(submit);
        return;
      }
      releaseMic();
      setStatus('idle');
    },
    [finalizeActiveListening, releaseMic, setStatus]
  );

  useEffect(() => {
    registerVoicePause(() => {
      releaseMic();
      if (useAIStore.getState().status === 'listening') {
        useAIStore.getState().setStatus('idle');
      }
    });
    return () => unregisterVoicePause();
  }, [releaseMic]);

  useEffect(() => {
    return () => {
      releaseMic();
    };
  }, [releaseMic]);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    setTranscript,
    isSupported,
    startWakeWordDetection: () => {},
    stopWakeWordDetection: () => releaseMic(),
    wakeWordDetected: false,
    setWakeWordDetected: () => {},
  };
}
