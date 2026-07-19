/**
 * wakeWordDetector.web.ts — detecção de wake word por captura própria +
 * Whisper, substituindo o SpeechRecognition nativo (que no Safari degrada
 * de forma conhecida depois do primeiro uso — bug documentado do WebKit,
 * não é algo que dá pra corrigir ajustando timing no nosso código).
 *
 * Pra não sair caro rodando o tempo todo: um monitor de volume local (grátis,
 * roda no aparelho) fica de guarda; só quando detecta volume de fala de
 * verdade é que grava um pedacinho curto e manda transcrever via Whisper. Na
 * maior parte do tempo (silêncio ambiente) não é gasto nada.
 */
import { getAccessToken } from '@/services/auth/session';

export interface WakeDetectorHandle {
  stop: () => void;
}

export interface WakeDetectorOptions {
  wakeWord: string;
  onWakeWordDetected: () => void;
  onError?: (message: string) => void;
}

const SPEECH_THRESHOLD = 12;
const TRIGGER_POLLS_NEEDED = 2; // ~300ms de volume sustentado antes de começar a gravar
const CHECK_INTERVAL_MS = 150;
const TRAILING_SILENCE_MS = 1200;
const MAX_CHUNK_MS = 4000;
const COOLDOWN_MS = 400;

const DIACRITICS_RE = /[̀-ͯ]/g;
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

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
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function transcribeChunk(blob: Blob, mimeType: string | undefined): Promise<string> {
  const token = await getAccessToken();
  const base64 = await blobToBase64(blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ audio: base64, mimeType }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) return '';
  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}

export async function startWakeWordDetector(opts: WakeDetectorOptions): Promise<WakeDetectorHandle | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    });
  } catch {
    opts.onError?.('Microfone indisponível para a wake word. Verifique permissões.');
    return null;
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  const analyser = audioCtx?.createAnalyser() ?? null;
  if (audioCtx && analyser) {
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    analyser.fftSize = 512;
  }
  const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  const mimeType = pickMimeType();

  let stopped = false;
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let cooldownUntil = 0;
  let abovePollsCount = 0;

  // Estado da gravação em andamento (null quando só monitorando volume)
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let hasSpeechInChunk = false;
  let lastSpeechAt = 0;
  let chunkStartedAt = 0;

  const teardown = () => {
    if (checkInterval) clearInterval(checkInterval);
    if (audioCtx) audioCtx.close().catch(() => {});
    stream.getTracks().forEach((t) => t.stop());
  };

  const finishChunk = () => {
    if (!recorder) return;
    const rec = recorder;
    recorder = null;
    if (rec.state !== 'inactive') rec.stop();
  };

  const startChunk = () => {
    if (stopped || recorder) return;
    chunks = [];
    hasSpeechInChunk = true;
    lastSpeechAt = Date.now();
    chunkStartedAt = Date.now();

    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = null;
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      void (async () => {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        if (stopped) return;
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        if (blob.size < 800) return; // gravação vazia demais, ignora

        const text = await transcribeChunk(blob, mimeType).catch(() => '');
        if (stopped) return;

        if (text && normalize(text).includes(normalize(opts.wakeWord))) {
          stopped = true;
          teardown();
          opts.onWakeWordDetected();
        }
      })();
    };

    recorder.start();
  };

  checkInterval = setInterval(() => {
    if (stopped || !analyser || !dataArray) return;
    if (Date.now() < cooldownUntil) return;

    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
    const level = sum / dataArray.length;
    const speaking = level > SPEECH_THRESHOLD;

    if (!recorder) {
      // Só monitorando — espera volume sustentado antes de gastar uma gravação/transcrição
      abovePollsCount = speaking ? abovePollsCount + 1 : 0;
      if (abovePollsCount >= TRIGGER_POLLS_NEEDED) {
        abovePollsCount = 0;
        startChunk();
      }
      return;
    }

    // Gravando — decide quando parar (silêncio sustentado ou duração máxima)
    if (speaking) lastSpeechAt = Date.now();

    const elapsed = Date.now() - chunkStartedAt;
    const silentFor = Date.now() - lastSpeechAt;
    if (elapsed >= MAX_CHUNK_MS || (hasSpeechInChunk && silentFor >= TRAILING_SILENCE_MS)) {
      finishChunk();
    }
  }, CHECK_INTERVAL_MS);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      finishChunk();
      teardown();
    },
  };
}
