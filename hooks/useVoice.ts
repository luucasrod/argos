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
import { useDeviceStore } from '@/stores/useDeviceStore';
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
  cancelVoskUtterance,
  isVoskArmed,
  armVoskUtterance,
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

    // Nomes reais dos dispositivos e cômodos entram na gramática, senão o
    // reconhecedor não tem como devolver "escritorio" ou "lampada da sala".
    const devices = useDeviceStore.getState().devices;
    const extraPhrases = [
      ...devices.map((d) => d.name),
      ...devices.map((d) => d.room).filter(Boolean),
    ] as string[];

    const ok = await startBackgroundWakeWord({
      wakeWord: wakeWordRef.current,
      extraPhrases,
      onWakeWordDetected: () => {
        // Só retorno visual. O comando vem na mesma fala, pelo onCommand abaixo —
        // não há mais um segundo passo de "começar a escutar".
        setWakeWordDetected(true);
        setTimeout(() => setWakeWordDetected(false), 1500);
        setTranscript('');
        setIsListening(true);
        setStatus('listening');
      },
      onPartial: (t) => setTranscript(t),
      onCommand: (text) => {
        setIsListening(false);
        const clean = text.trim();
        if (!clean) {
          setStatus('idle');
          return;
        }
        setTranscript(clean);
        setStatus('thinking');
        onAutoSendRef.current?.(clean);
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

      /*
       * Escuta contínua de pé: o microfone JÁ está aberto pelo Vosk. Tocar no orb
       * só arma a captura — o comando chega pelo onCommand configurado em
       * startWakeWordDetection, igual a quando a wake word dispara. Nada de
       * fechar e reabrir áudio, que é justamente o que não sobrevive em background.
       */
      if (isBackgroundWakeWordRunning()) {
        if (!opts?.skipChime) playListenChime();
        if (armVoskUtterance()) {
          setTranscript('');
          setIsListening(true);
          setStatus('listening');
        } else {
          setError('A escuta contínua não está ativa.');
        }
        return;
      }

      // Sem escuta contínua: grava com o expo-av e transcreve via Whisper.
      suspendBackgroundWakeWord();
      await releaseMic();
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

      /*
       * Cão de guarda: sob NENHUMA circunstância a escuta pode ficar presa. Se a
       * janela não fechar sozinha (VAD sem callback, mic roubado por outro
       * componente, etc.), aborta e devolve a UI. Já ficamos travados em
       * "Ouvindo..." sem botão de sair mais de uma vez por causa disso.
       */
      const watchdog = setTimeout(() => {
        if (activeWindow === window) {
          window.cancel();
        }
      }, 25000);

      const result = await window.done;
      clearTimeout(watchdog);
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
      // Fala em curso no Vosk: cancelar volta a vigiar a wake word sem soltar o mic.
      if (isVoskArmed()) {
        cancelVoskUtterance();
        setIsListening(false);
        setStatus('idle');
        return;
      }
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
      /*
       * Suspende SÓ enquanto o Argos fala (TTS), para ele não se ouvir.
       *
       * Antes isto suspendia a qualquer status diferente de 'idle' — e como a
       * detecção da wake word muda o status para 'listening', a própria detecção
       * derrubava o reconhecedor: o log mostrava "wake=true" seguido na hora de
       * "start OK", e o estado "armado" se perdia. O comando nunca era enviado.
       * Regra escrita para a arquitetura antiga, em que a escuta ativa usava um
       * microfone separado e o Vosk tinha de soltar o dele. Hoje o Vosk É a escuta.
       */
      if (state.status === 'speaking') {
        suspendBackgroundWakeWord();
      } else if (state.status === 'idle') {
        if (!activeWindow) resumeBackgroundWakeWord();
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
