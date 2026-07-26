/**
 * useVoice.ts — versão NATIVE (Android/iOS).
 *
 * Espelha o comportamento do useVoice.web.ts (que já funciona bem no PWA), mas
 * usando o metering do expo-av como VAD em vez do AnalyserNode da Web Audio:
 *   - escuta ATIVA que se encerra sozinha quando a pessoa para de falar;
 *   - wake word contínua num foreground service, com portão de volume local
 *     para só transcrever quando há fala de verdade.
 *
 * O @react-native-voice/voice foi abandonado aqui: ele depende do SpeechRecognizer
 * do Google, que em muitos aparelhos falha na hora e sem disparar callback —
 * era por isso que tocar no orb não fazia absolutamente nada.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { type UseVoiceOptions } from '@/constants/voice';
import {
  openMicWindow,
  releaseMic,
  ensureMicPermission,
  configureAudioMode,
  type MicWindow,
} from '@/services/voice/nativeMic';
import { transcribeRecording } from '@/services/voice/transcribeNative';
import {
  startBackgroundWakeWord,
  stopBackgroundWakeWord,
  isBackgroundWakeWordRunning,
  suspendBackgroundWakeWord,
  resumeBackgroundWakeWord,
} from '@/services/voice/backgroundWakeWord.native';
import { registerVoicePause, unregisterVoicePause } from '@/services/voice/voiceSession';
import { playListenChime, preloadListenChime, CHIME_MS } from '@/services/voice/listenChime';

export type { UseVoiceOptions };

/** Silêncio que encerra a fala. O usuário quer resposta rápida — 1,5s. */
const NATIVE_SILENCE_MS = 1500;

/** Só uma janela de escuta ativa por vez, mesmo com várias telas montadas. */
let activeWindow: MicWindow | null = null;

export function useVoice(options?: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);

  const { setStatus } = useAIStore();
  const { settings } = useSettingsStore();

  const onAutoSendRef = useRef(options?.onAutoSend);
  const startingRef = useRef(false);
  const wakeWordRef = useRef(settings.wakeWord || 'Ei Argos');
  const silenceMs = options?.silenceMs ?? NATIVE_SILENCE_MS;

  onAutoSendRef.current = options?.onAutoSend;
  wakeWordRef.current = settings.wakeWord || 'Ei Argos';

  /** Ref para a wake word disparar a escuta ativa sem dependência circular. */
  const startListeningRef = useRef<((opts?: { skipChime?: boolean }) => Promise<void>) | null>(null);

  /** Sobe (ou religa) a escuta contínua da wake word em background. */
  const startWakeWordDetection = useCallback(async () => {
    if (isBackgroundWakeWordRunning()) {
      resumeBackgroundWakeWord();
      setIsWakeListening(true);
      return;
    }

    const ok = await startBackgroundWakeWord({
      wakeWord: wakeWordRef.current,
      onWakeWordDetected: () => {
        setWakeWordDetected(true);
        setTimeout(() => setWakeWordDetected(false), 1500);
        void startListeningRef.current?.({ skipChime: true });
      },
    });

    setIsWakeListening(ok);
    if (!ok) {
      setError('Não consegui ativar a escuta contínua. Permita o microfone nas configurações.');
    }
  }, []);

  const stopWakeWordDetection = useCallback(async () => {
    setIsWakeListening(false);
    await stopBackgroundWakeWord();
  }, []);

  const startListening = useCallback(async (opts?: { skipChime?: boolean }) => {
    if (startingRef.current || activeWindow) return;
    startingRef.current = true;

    try {
      setError(null);
      setTranscript('');

      const granted = await ensureMicPermission();
      if (!granted) {
        setError('Permissão de microfone negada. Libere nas configurações do Android.');
        return;
      }

      // A wake word e a escuta ativa disputam o mesmo microfone: suspende o laço
      // e libera o mic antes de abrir a janela de escuta.
      suspendBackgroundWakeWord();
      await releaseMic();

      // Bipe + vibração ANTES de abrir o microfone: com a gravação já aberta, o
      // próprio VAD escutaria o bipe e contaria como fala. Quando o disparo vem da
      // wake word, o serviço já tocou o bipe — não repetir.
      if (!opts?.skipChime) {
        playListenChime();
        await new Promise((r) => setTimeout(r, CHIME_MS));
      }

      await configureAudioMode(true);

      const window = await openMicWindow({
        silenceMs,
        maxUtteranceMs: 20000,
        // Se a pessoa tocou no orb e não falou nada, encerra em 8s.
        idleRecycleMs: 8000,
      });

      if (!window) {
        setError('Não consegui acessar o microfone. Feche outros apps que usam áudio.');
        resumeBackgroundWakeWord();
        return;
      }

      activeWindow = window;
      setIsListening(true);
      setStatus('listening');

      const result = await window.done;
      activeWindow = null;
      setIsListening(false);

      if (result.cancelled || !result.uri) {
        setStatus('idle');
        return;
      }

      setStatus('thinking');

      let text = '';
      try {
        text = await transcribeRecording(result.uri);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg === 'auth'
            ? 'Sessão expirada. Faça login novamente.'
            : 'Não consegui entender o áudio. Tente falar mais perto.'
        );
        setStatus('idle');
        return;
      }

      if (!text) {
        setStatus('idle');
        return;
      }

      setTranscript(text);
      onAutoSendRef.current?.(text);
    } finally {
      startingRef.current = false;
      // Deixa a escuta contínua ligada a partir do primeiro toque no orb —
      // é o comportamento principal do Argos.
      if (!isBackgroundWakeWordRunning()) {
        void startWakeWordDetection();
      }
    }
  }, [silenceMs, setStatus, startWakeWordDetection]);

  startListeningRef.current = startListening;

  const stopListening = useCallback(
    (submit = false) => {
      const window = activeWindow;
      if (!window) {
        setIsListening(false);
        setStatus('idle');
        return;
      }
      if (submit) window.stop();
      else window.cancel();
    },
    [setStatus]
  );

  /*
   * O speak() do useArgos chama pauseVoiceInput() antes do TTS. No nativo isso
   * nunca estava registrado, então o microfone continuava aberto disputando o
   * áudio com a síntese de voz.
   */
  useEffect(() => {
    registerVoicePause(() => {
      suspendBackgroundWakeWord();
      activeWindow?.cancel();
      activeWindow = null;
      setIsListening(false);
      void releaseMic();
    });
    return () => unregisterVoicePause();
  }, []);

  /* Religa a wake word quando o Argos volta a ficar ocioso (depois de falar/executar). */
  useEffect(() => {
    const unsubscribe = useAIStore.subscribe((state) => {
      if (!isBackgroundWakeWordRunning()) return;
      if (state.status === 'idle') {
        if (!activeWindow) resumeBackgroundWakeWord();
      } else {
        suspendBackgroundWakeWord();
      }
    });
    return unsubscribe;
  }, []);

  /* Pré-carrega o bipe para o primeiro disparo não sair atrasado. */
  useEffect(() => {
    preloadListenChime();
  }, []);

  /* Mantém o rótulo de escuta contínua em sincronia com o serviço. */
  useEffect(() => {
    const id = setInterval(() => {
      setIsWakeListening(isBackgroundWakeWordRunning());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return {
    isListening,
    isWakeListening,
    transcript,
    error,
    startListening,
    stopListening,
    setTranscript,
    isSupported: true,
    startWakeWordDetection,
    stopWakeWordDetection,
    wakeWordDetected,
    setWakeWordDetected,
  };
}
