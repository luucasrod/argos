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
import { wakeWordEngine } from '@/services/voice/wakeWordEngine.native';
import { registerVoicePause, unregisterVoicePause } from '@/services/voice/voiceSession';
import { perfAbort } from '@/services/voice/perfLog';
import { playListenChime, preloadListenChime, CHIME_MS } from '@/services/voice/listenChime';
import {
  getSpeakableDeviceAlias,
  resolveDeviceVoiceAlias,
} from '@/services/voice/deviceVoiceAliases';

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
  /*
   * A-048: startWakeWordDetection/stopWakeWordDetection escrevem
   * isWakeListening de forma otimista (resposta imediata ao toque), mas o
   * polling abaixo também escreve, a cada 2s, a partir do estado real do
   * motor. Start/stop são assíncronos (permissão de microfone, warmup/
   * teardown nativo) — sem isto, um tick do polling podia cair NO MEIO de
   * uma transição e sobrescrever a escrita otimista com um valor ainda
   * desatualizado, produzindo o texto contraditório relatado ("não está
   * ativa" ao lado de "ouvindo..."). Enquanto uma transição está em curso,
   * o polling não escreve — só volta a fazer isso depois que a transição
   * termina e a escrita otimista final (baseada no resultado real de
   * start/stop) já aconteceu.
   *
   * Contador, não booleano: alternar rapidamente pode disparar um novo
   * start/stop antes do anterior terminar (start ainda em voo quando o
   * stop já foi pedido). Com um booleano, o `finally` do primeiro a
   * terminar reabriria o polling cedo demais, no meio da transição do
   * segundo. O polling só volta quando NENHUMA transição está em curso.
   */
  const transitionCountRef = useRef(0);

  onAutoSendRef.current = options?.onAutoSend;
  wakeWordRef.current = settings.wakeWord || 'Ei Argos';

  /** Ref para a wake word disparar a escuta ativa sem dependência circular. */
  const startListeningRef = useRef<((opts?: { skipChime?: boolean }) => Promise<void>) | null>(null);

  /** Sobe (ou religa) a escuta contínua da wake word em background. */
  const startWakeWordDetection = useCallback(async () => {
    transitionCountRef.current++;
    try {
      if (wakeWordEngine.isRunning()) {
        wakeWordEngine.resume();
        setIsWakeListening(true);
        return;
      }

      // Nomes reais dos dispositivos e cômodos entram na gramática, senão o
      // reconhecedor não tem como devolver "escritorio" ou "lampada da sala".
      const devices = useDeviceStore.getState().devices;
      const voiceAliases = devices
        .map((device) => getSpeakableDeviceAlias(device.name))
        .filter((alias): alias is string => Boolean(alias));
      const extraPhrases = [
        ...devices.map((d) => d.name),
        ...voiceAliases,
        ...devices.map((d) => d.room).filter(Boolean),
      ] as string[];

      const ok = await wakeWordEngine.start({
        wakeWord: wakeWordRef.current,
        extraPhrases,
        onWakeDetected: () => {
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
          const clean = resolveDeviceVoiceAlias(text, devices);
          if (!clean) {
            // Wake word disparou mas não veio comando (silêncio total depois
            // dela) — o turno de medição foi aberto em submit() e nunca vai
            // ser fechado por speak(), então fecha aqui sem imprimir resumo.
            perfAbort();
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
    } finally {
      transitionCountRef.current--;
    }
  }, []);

  const stopWakeWordDetection = useCallback(async () => {
    transitionCountRef.current++;
    setIsWakeListening(false);
    try {
      await wakeWordEngine.stop();
    } finally {
      transitionCountRef.current--;
    }
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
      if (wakeWordEngine.isRunning()) {
        if (!opts?.skipChime) playListenChime();
        if (wakeWordEngine.armUtterance()) {
          setTranscript('');
          setIsListening(true);
          setStatus('listening');
        } else {
          setError('A escuta contínua não está ativa.');
        }
        return;
      }

      // Sem escuta contínua: grava com o expo-av e transcreve via Whisper.
      wakeWordEngine.suspend();
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
        wakeWordEngine.resume();
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
      if (!wakeWordEngine.isRunning()) {
        void startWakeWordDetection();
      }
    }
  }, [silenceMs, setStatus, startWakeWordDetection]);

  startListeningRef.current = startListening;

  const stopListening = useCallback(
    (submit = false) => {
      // Fala em curso no Vosk: cancelar volta a vigiar a wake word sem soltar o mic.
      if (wakeWordEngine.isArmed()) {
        wakeWordEngine.cancelUtterance();
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
      wakeWordEngine.suspend();
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
      if (!wakeWordEngine.isRunning()) return;
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
        wakeWordEngine.suspend();
      } else if (state.status === 'idle') {
        if (!activeWindow) {
          /*
           * Issue #16: cloudTts.ts configura o modo de áudio global com
           * allowsRecordingIOS:false antes de falar (correto lá — a escuta
           * está suspensa durante a fala). Mas nada reconfigurava de volta
           * para o modo compatível com gravação (allowsRecordingIOS:true)
           * depois que o Argos termina de falar e a escuta volta — o Vosk
           * continua gravando pelo AudioRecord nativo dele mesmo assim
           * (independente do modo do expo-av), mas a sessão de áudio do
           * expo-av ficava com uma configuração que não bate com o que
           * está realmente acontecendo no hardware. Suspeita levantada na
           * investigação do bipe de confirmação não soando (só a
           * vibração) depois de qualquer resposta falada — reconfigurar
           * aqui, sempre que a escuta volta, é best-effort e barato
           * (mesma chamada já usada em startBackgroundWakeWord).
           */
          void configureAudioMode(true);
          wakeWordEngine.resume();
        }
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
      // Não sobrescreve no meio de um start/stop em andamento — ver comentário
      // de transitionCountRef acima.
      if (transitionCountRef.current > 0) return;
      setIsWakeListening(wakeWordEngine.isRunning());
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
