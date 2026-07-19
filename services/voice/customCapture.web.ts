/**
 * customCapture.web.ts — captura de microfone própria (getUserMedia + MediaRecorder)
 * transcrita via Whisper (api/transcribe.ts), no lugar do SpeechRecognition nativo.
 *
 * Por quê: o SpeechRecognition do Safari usa a mesma captação genérica de
 * qualquer site — sem o acesso privilegiado ao hardware de áudio que a Siri
 * tem — e o alcance de captação é bem curto. Aqui a gente controla os
 * parâmetros do getUserMedia diretamente (principalmente autoGainControl, que
 * amplifica sinal fraco) e detecta silêncio por conta própria via um
 * AnalyserNode, em vez de depender do reconhecimento embutido do navegador.
 *
 * Escopo: só a escuta ATIVA (depois de tocar no orb ou a wake word disparar).
 * A wake word em si continua no SpeechRecognition nativo — ficar gravando e
 * mandando pra transcrever a cada poucos segundos o tempo todo custaria caro
 * e teria mais atraso do que o necessário só pra esperar o "Argos".
 */
import { getAccessToken } from '@/services/auth/session';

export interface CaptureHandle {
  /** Para a gravação e transcreve o que foi capturado até agora. */
  stop: () => void;
  /** Para a gravação sem transcrever (descarta). */
  cancel: () => void;
}

export interface CaptureOptions {
  silenceMs: number;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

const SPEECH_THRESHOLD = 12; // desvio médio do centro (128) no time-domain — acima disso conta como "falando"
const CHECK_INTERVAL_MS = 150;
const MAX_RECORDING_MS = 25_000; // rede de segurança — nunca grava pra sempre

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // remove o prefixo "data:audio/...;base64,"
      const base64 = result.slice(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function transcribe(blob: Blob, mimeType: string | undefined): Promise<string> {
  const token = await getAccessToken();
  const base64 = await blobToBase64(blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ audio: base64, mimeType }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Falha ao transcrever áudio');
  }

  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}

export async function startCustomCapture(opts: CaptureOptions): Promise<CaptureHandle | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false, // supressão agressiva corta fala mais baixa/distante
        autoGainControl: true, // amplifica sinal fraco — é o que mais ajuda no alcance
      },
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      opts.onError('Permissão do microfone negada. Libere nas configurações do navegador.');
    } else {
      opts.onError('Microfone indisponível. Verifique permissões e tente de novo.');
    }
    return null;
  }

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    opts.onError('Não foi possível acessar o microfone. Tente de novo.');
    return null;
  }

  const chunks: Blob[] = [];
  let finished = false;
  let cancelled = false;

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // ─── Detecção de silêncio (VAD simples por volume) ───────────────────────
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  const analyser = audioCtx?.createAnalyser() ?? null;
  if (audioCtx && analyser) {
    const source = audioCtx.createMediaStreamSource(stream);
    analyser.fftSize = 512;
    source.connect(analyser);
  }
  const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

  let hasSpoken = false;
  let lastSpeechAt = Date.now();

  const cleanupAudioNodes = () => {
    if (audioCtx) audioCtx.close().catch(() => {});
  };

  const stopEverything = () => {
    clearInterval(checkInterval);
    clearTimeout(maxTimer);
    cleanupAudioNodes();
    stream.getTracks().forEach((t) => t.stop());
  };

  const finalize = (shouldTranscribe: boolean) => {
    if (finished) return;
    finished = true;
    cancelled = !shouldTranscribe;
    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      void onRecorderStop();
    }
  };

  const onRecorderStop = async () => {
    stopEverything();
    if (cancelled) return;
    try {
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      const text = await transcribe(blob, mimeType);
      opts.onTranscript(text);
    } catch (err) {
      opts.onError(err instanceof Error ? err.message : 'Falha ao transcrever áudio');
    }
  };

  recorder.onstop = () => { void onRecorderStop(); };

  const checkInterval = setInterval(() => {
    if (!analyser || !dataArray) return;
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += Math.abs(dataArray[i] - 128);
    }
    const level = sum / dataArray.length;

    if (level > SPEECH_THRESHOLD) {
      hasSpoken = true;
      lastSpeechAt = Date.now();
    } else if (hasSpoken && Date.now() - lastSpeechAt > opts.silenceMs) {
      finalize(true);
    }
  }, CHECK_INTERVAL_MS);

  const maxTimer = setTimeout(() => finalize(true), MAX_RECORDING_MS);

  recorder.start();

  return {
    stop: () => finalize(true),
    cancel: () => finalize(false),
  };
}
