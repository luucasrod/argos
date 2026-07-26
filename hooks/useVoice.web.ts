/**
 * useVoice.web.ts — captura própria (getUserMedia + MediaRecorder) + Whisper,
 * tanto pra escuta ativa quanto pra wake word. Não usa mais o
 * SpeechRecognition nativo do Safari: além do alcance curto, ele tem um bug
 * documentado do WebKit em que o reconhecimento degrada depois do primeiro
 * uso (https://github.com/WebAudio/web-speech-api/issues/96) — não dava pra
 * corrigir só ajustando timing no nosso código.
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
import { unlockSpeech } from '@/services/voice/speechUnlock';
import { isMicGranted, requestMicPermission } from '@/services/voice/micPermission';
import { startCustomCapture, type CaptureHandle } from '@/services/voice/customCapture.web';
import { startWakeWordDetector, type WakeDetectorHandle } from '@/services/voice/wakeWordDetector.web';
import { playListenChime } from '@/services/voice/listenChime';

export type { UseVoiceOptions };

function isCaptureSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export function useVoice(options?: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wakeWordDetected, setWakeWordDetectedState] = useState(false);

  const { setStatus } = useAIStore();
  const { settings } = useSettingsStore();

  const captureHandleRef = useRef<CaptureHandle | null>(null);
  const wakeDetectorRef = useRef<WakeDetectorHandle | null>(null);
  const modeRef = useRef<'idle' | 'wake' | 'active'>('idle');
  const transcriptRef = useRef('');
  const onAutoSendRef = useRef(options?.onAutoSend);
  const startingRef = useRef(false);
  const submittedRef = useRef(false);
  const autoListenRef = useRef(settings.autoListen);
  const wakeWordRef = useRef(settings.wakeWord || 'Argos');
  const silenceMs = options?.silenceMs ?? VOICE_SILENCE_MS;

  onAutoSendRef.current = options?.onAutoSend;
  autoListenRef.current = settings.autoListen;
  wakeWordRef.current = settings.wakeWord || 'Argos';

  const isSupported = isCaptureSupported();

  const stopWakeDetector = useCallback(() => {
    if (wakeDetectorRef.current) {
      wakeDetectorRef.current.stop();
      wakeDetectorRef.current = null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    if (captureHandleRef.current) {
      captureHandleRef.current.cancel();
      captureHandleRef.current = null;
    }
    stopWakeDetector();
    modeRef.current = 'idle';
    startingRef.current = false;
    setIsListening(false);
    setIsWakeListening(false);
  }, [stopWakeDetector]);

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

  /*
   * Escuta ATIVA (depois de tocar no orb ou a wake word disparar): usa
   * captura própria (getUserMedia + MediaRecorder) transcrita via Whisper —
   * ver customCapture.web.ts. O SpeechRecognition nativo do Safari tem
   * alcance de captação muito curto (sem o acesso privilegiado que a Siri
   * tem ao hardware); aqui dá pra controlar os parâmetros de captura
   * diretamente, principalmente autoGainControl.
   */
  const startListening = useCallback(async () => {
    if (modeRef.current === 'active' || startingRef.current) return;

    const aiStatus = useAIStore.getState().status;
    if (aiStatus === 'thinking' || aiStatus === 'executing' || aiStatus === 'speaking') {
      return;
    }

    startingRef.current = true;
    submittedRef.current = false;
    releaseMic();
    await waitForMicRelease();

    unlockSpeech();
    transcriptRef.current = '';
    setTranscript('');
    setError(null);

    const micGranted = await requestMicPermission();
    if (!micGranted) {
      startingRef.current = false;
      modeRef.current = 'idle';
      setError('Permissão do microfone negada. Vá em Configurações do navegador para permitir.');
      setStatus('idle');
      return;
    }

    const handle = await startCustomCapture({
      silenceMs,
      onTranscript: (text) => {
        captureHandleRef.current = null;
        modeRef.current = 'idle';
        startingRef.current = false;
        setIsListening(false);
        const trimmed = text.trim();
        transcriptRef.current = trimmed;
        setTranscript(trimmed);
        if (trimmed) {
          submitTranscript(trimmed);
        } else {
          setStatus('idle');
        }
      },
      onError: (message) => {
        captureHandleRef.current = null;
        modeRef.current = 'idle';
        startingRef.current = false;
        setIsListening(false);
        setError(message);
        setStatus('idle');
      },
    });

    if (!handle) {
      // erro já reportado via onError
      startingRef.current = false;
      modeRef.current = 'idle';
      return;
    }

    captureHandleRef.current = handle;
    modeRef.current = 'active';
    startingRef.current = false;
    setIsListening(true);
    setStatus('listening');
    playListenChime();
  }, [releaseMic, silenceMs, setStatus, submitTranscript]);

  const stopListening = useCallback(
    (submit = false) => {
      if (modeRef.current === 'active' && captureHandleRef.current) {
        if (submit) {
          // dispara a transcrição — onTranscript acima cuida do resto do estado
          captureHandleRef.current.stop();
        } else {
          captureHandleRef.current.cancel();
          captureHandleRef.current = null;
          modeRef.current = 'idle';
          startingRef.current = false;
          transcriptRef.current = '';
          setTranscript('');
          setIsListening(false);
          setStatus('idle');
        }
        return;
      }
      releaseMic();
      setStatus('idle');
    },
    [releaseMic, setStatus]
  );

  /*
   * Wake word: um monitor de volume local (grátis, roda no aparelho) fica de
   * guarda em segundo plano; só quando detecta volume de fala de verdade é
   * que grava um pedacinho curto e manda transcrever via Whisper — ver
   * wakeWordDetector.web.ts. Assim a maior parte do tempo (silêncio
   * ambiente) não gera nenhuma chamada paga.
   */
  const startWakeWordDetection = useCallback(async () => {
    if (!isSupported || !autoListenRef.current) return;
    if (modeRef.current !== 'idle' || startingRef.current) return;
    if (useAIStore.getState().status !== 'idle') return;
    // Só inicia se permissão já foi concedida — isMicGranted usa o cache
    // atualizado por requestMicPermission() no primeiro startListening()
    const granted = await isMicGranted();
    if (!granted) return;

    modeRef.current = 'wake';

    const handle = await startWakeWordDetector({
      wakeWord: wakeWordRef.current,
      onWakeWordDetected: () => {
        wakeDetectorRef.current = null;
        modeRef.current = 'idle';
        setIsWakeListening(false);
        setWakeWordDetectedState(true);
        setTimeout(() => setWakeWordDetectedState(false), 1500);
        void startListening();
      },
      onError: () => {
        wakeDetectorRef.current = null;
        modeRef.current = 'idle';
        setIsWakeListening(false);
      },
    });

    if (!handle) {
      modeRef.current = 'idle';
      return;
    }

    wakeDetectorRef.current = handle;
    setIsWakeListening(true);
  }, [isSupported, startListening]);

  const stopWakeWordDetection = useCallback(() => {
    if (modeRef.current === 'wake') {
      releaseMic();
    }
  }, [releaseMic]);

  /* Liga/desliga a wake word conforme a config e religa sozinha quando o Argos volta a ficar ocioso. */
  useEffect(() => {
    if (!isSupported) return;

    if (!settings.autoListen) {
      if (modeRef.current === 'wake') releaseMic();
      return;
    }

    if (useAIStore.getState().status === 'idle' && modeRef.current === 'idle') {
      startWakeWordDetection();
    }

    const unsubscribe = useAIStore.subscribe((state) => {
      if (!autoListenRef.current) return;
      if (state.status === 'idle' && modeRef.current === 'idle') {
        setTimeout(() => {
          if (
            modeRef.current === 'idle' &&
            autoListenRef.current &&
            useAIStore.getState().status === 'idle'
          ) {
            startWakeWordDetection();
          }
        }, 400);
      } else if (state.status !== 'idle' && modeRef.current === 'wake') {
        releaseMic();
      }
    });

    return unsubscribe;
  }, [isSupported, settings.autoListen, startWakeWordDetection, releaseMic]);

  /* Retoma detecção quando o usuário volta ao app após sair (visibilitychange). */
  useEffect(() => {
    if (!isSupported || !settings.autoListen) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Página saiu de foco — para o detector para liberar o mic adequadamente
        if (modeRef.current === 'wake') releaseMic();
      } else {
        // Voltou — reinicia após breve delay para o AudioContext se recuperar
        setTimeout(() => {
          if (
            autoListenRef.current &&
            modeRef.current === 'idle' &&
            useAIStore.getState().status === 'idle'
          ) {
            startWakeWordDetection();
          }
        }, 600);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isSupported, settings.autoListen, startWakeWordDetection, releaseMic]);

  /* Screen Wake Lock — mantém tela ligada enquanto escuta, para o AudioContext não ser suspenso. */
  useEffect(() => {
    if (!isSupported || !settings.autoListen) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
      } catch {
        // Silently fail — não crítico
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !lock) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
      lock = null;
    };
  }, [isSupported, settings.autoListen]);

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
    isWakeListening,
    transcript,
    error,
    startListening,
    stopListening,
    setTranscript,
    isSupported,
    startWakeWordDetection,
    stopWakeWordDetection,
    wakeWordDetected,
    setWakeWordDetected: setWakeWordDetectedState,
  };
}
