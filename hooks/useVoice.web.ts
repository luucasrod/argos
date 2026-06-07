/**
 * useVoice.web.ts — Hook de reconhecimento de voz para web via Web Speech API.
 * Metro resolve este arquivo no lugar de useVoice.ts quando bundlando para web.
 * Interface compatível com useVoice.ts (nativo) + campos extras para wake word.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

/* ─── Tipos internos da Web Speech API ─── */
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

/** Palavra de ativação — detectada em qualquer caixa */
const WAKE_REGEX = /\bargos\b/i;

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** true quando a wake word foi detectada no modo background */
  const [wakeWordDetected, setWakeWordDetected] = useState(false);

  const { setStatus } = useAIStore();
  const { settings } = useSettingsStore();

  const srRef = useRef<SRInstance | null>(null);
  /** 'idle' | 'wake' | 'active' */
  const modeRef = useRef<'idle' | 'wake' | 'active'>('idle');
  /** flag para saber se o loop de wake word deve continuar */
  const wakeLoopRef = useRef(false);

  const SRCtor = getSpeechRecognitionCtor();
  const isSupported = SRCtor !== null;
  const lang = settings.personality.language ?? 'pt-BR';

  /* ─── Cria instância de reconhecimento ─── */
  const buildSR = useCallback((): SRInstance | null => {
    if (!SRCtor) return null;
    const r = new SRCtor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.maxAlternatives = 1;
    return r;
  }, [SRCtor, lang]);

  /* ─── Mata a instância atual ─── */
  const killSR = useCallback(() => {
    if (srRef.current) {
      try { srRef.current.abort(); } catch {}
      srRef.current = null;
    }
  }, []);

  /* ─── ESCUTA ATIVA (botão do microfone) ─── */
  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Reconhecimento de voz não suportado. Use Chrome ou Edge.');
      return;
    }
    if (modeRef.current === 'active') return;

    // Para o modo wake word enquanto o usuário está falando
    wakeLoopRef.current = false;
    killSR();
    modeRef.current = 'active';
    setTranscript('');
    setError(null);

    const rec = buildSR();
    if (!rec) return;

    rec.onstart = () => {
      setIsListening(true);
      setStatus('listening');
    };

    rec.onresult = (e: SRResultEvent) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (text) setTranscript(text);
    };

    rec.onerror = (e: SRErrorEvent) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        setError('Erro no microfone: ' + e.error);
      }
    };

    rec.onend = () => {
      if (modeRef.current === 'active') {
        modeRef.current = 'idle';
        setIsListening(false);
        setStatus('idle');
      }
    };

    srRef.current = rec;
    try { rec.start(); } catch (err) {
      console.warn('[Argos Voice] falha ao iniciar:', err);
      modeRef.current = 'idle';
    }
  }, [isSupported, buildSR, killSR, setStatus]);

  /* ─── PARA escuta ativa ─── */
  const stopListening = useCallback(() => {
    killSR();
    modeRef.current = 'idle';
    setIsListening(false);
    setStatus('idle');
  }, [killSR, setStatus]);

  /* ─── MODO WAKE WORD (escuta em background) ─── */
  const startWakeWordDetection = useCallback(() => {
    if (!isSupported || modeRef.current !== 'idle') return;

    wakeLoopRef.current = true;

    const launch = () => {
      if (!wakeLoopRef.current || modeRef.current !== 'idle') return;

      const rec = buildSR();
      if (!rec) return;

      modeRef.current = 'wake';

      rec.onresult = (e: SRResultEvent) => {
        if (modeRef.current !== 'wake') return;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (WAKE_REGEX.test(text)) {
            // Wake word detectada!
            wakeLoopRef.current = false;
            killSR();
            modeRef.current = 'idle';
            setWakeWordDetected(true);
            return;
          }
        }
      };

      // Erros silenciosos em modo background
      rec.onerror = () => {};

      rec.onend = () => {
        if (modeRef.current === 'wake') {
          modeRef.current = 'idle';
          srRef.current = null;
          // Reinicia após pequena pausa (evita spam)
          if (wakeLoopRef.current) {
            setTimeout(launch, 800);
          }
        }
      };

      srRef.current = rec;
      try { rec.start(); } catch {}
    };

    launch();
  }, [isSupported, buildSR, killSR]);

  /* ─── Para o loop de wake word ─── */
  const stopWakeWordDetection = useCallback(() => {
    wakeLoopRef.current = false;
    if (modeRef.current === 'wake') {
      killSR();
      modeRef.current = 'idle';
    }
  }, [killSR]);

  /* ─── Cleanup ao desmontar ─── */
  useEffect(() => {
    return () => {
      wakeLoopRef.current = false;
      killSR();
    };
  }, [killSR]);

  return {
    /* interface compatível com useVoice.ts nativo */
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    setTranscript,
    /* extras para web */
    startWakeWordDetection,
    stopWakeWordDetection,
    wakeWordDetected,
    setWakeWordDetected,
    isSupported,
  };
}
