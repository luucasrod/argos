/**
 * cloudTts.ts — fala usando voz neural do servidor (/api/tts), com queda
 * automática para a voz do sistema.
 *
 * Por que existe: a melhor voz que o Android oferece em pt-BR é a
 * `pt-br-x-afs-network`, e ela já estava sendo usada — ou seja, o teto do
 * aparelho estava atingido. O salto de qualidade real só vem de voz neural
 * em nuvem.
 *
 * Regra de ouro: NUNCA quebrar. Se não houver chave no servidor, se a cota
 * estourar ou se a rede falhar, devolve false e quem chamou usa a voz do
 * sistema. O usuário no máximo ouve a voz antiga — nunca silêncio.
 */
import { Audio } from 'expo-av';
import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';
import { perfMark, perfEnd } from '@/services/voice/perfLog';
import { prefetch as prefetchInCache, takeCached } from '@/services/voice/ttsPrefetchCache';

const TIMEOUT_MS = 8000;

type CloudTtsOpts = {
  voice?: string;
  rate?: number;
  gender?: 'male' | 'female';
  /**
   * Barge-in (#263): checado depois da síntese, antes de tocar. Evita que
   * um áudio do turno interrompido comece a tocar depois do `stopAllSpeech()`
   * (ex.: `void speak()` em voo + prefetch resolvendo tarde).
   */
  cancelled?: () => boolean;
};

/** Evita bater no servidor repetidamente quando já sabemos que não há chave. */
let unavailableUntil = 0;
const COOLDOWN_MS = 5 * 60 * 1000;

let current: Audio.Sound | null = null;

/** Interrompe a fala em andamento. */
export async function stopCloudSpeech(): Promise<void> {
  const s = current;
  current = null;
  if (!s) return;
  try {
    await s.stopAsync();
  } catch {}
  try {
    await s.unloadAsync();
  } catch {}
}

/**
 * Faz a chamada de rede pro `/api/tts` e devolve o áudio em base64. Lança em
 * qualquer falha (rede, timeout, provider indisponível) — quem chama decide
 * o que fazer (cooldown, fallback pra voz do sistema, etc). Extraída de
 * `speakWithCloud` pra poder ser reaproveitada pelo prefetch (issue #237):
 * a mesma síntese que toca ao vivo pode ser disparada mais cedo, assim que
 * o streaming do LLM entrega o campo `speech`, e o resultado fica pronto
 * (ou quase) por quando `speak()` de verdade for chamado.
 */
async function synthesizeBase64(text: string, opts: CloudTtsOpts): Promise<string> {
  const token = await getAccessToken().catch(() => null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  perfMark('tts_requisicao_enviada');
  try {
    res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, voice: opts.voice, rate: opts.rate, gender: opts.gender }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    /*
     * Qualquer erro do servidor (503 sem provedor, 502 de cota estourada,
     * 400 de chave inválida etc.) entra em cooldown — não só 503. Sem isso,
     * uma chave quebrada fazia TODA mensagem esperar os 8s de timeout antes
     * de cair pra voz do sistema: parecia lentidão, mas era uma falha
     * conhecida sendo retentada do zero a cada fala.
     */
    unavailableUntil = Date.now() + COOLDOWN_MS;
    throw new Error(`tts_http_${res.status}`);
  }

  const json = (await res.json()) as { audio?: string };
  if (!json.audio) throw new Error('tts_sem_audio');
  perfMark('tts_audio_recebido');
  return json.audio;
}

/**
 * Dispara a síntese em segundo plano sem tocar nada — issue #237. Chamar
 * assim que o texto de `speech` estiver disponível (ainda com o resto da
 * resposta do LLM em streaming); quando `speak()`/`speakWithCloud` for
 * chamado de verdade com o MESMO texto+opções, reaproveita o resultado em
 * vez de esperar a rede do zero. Nunca lança — falha de prefetch é
 * silenciosa, o caminho normal de `speakWithCloud` sempre pode seguir sem
 * ele.
 */
export function prefetchCloudSpeech(text: string, opts: CloudTtsOpts = {}): void {
  const clean = text.trim();
  if (!clean) return;
  if (Date.now() < unavailableUntil) return;
  prefetchInCache(clean, opts, () => synthesizeBase64(clean, opts));
}

/**
 * Sintetiza e reproduz. Devolve true se falou de verdade — false significa
 * "use a voz do sistema".
 */
export async function speakWithCloud(text: string, opts: CloudTtsOpts = {}): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;
  if (Date.now() < unavailableUntil) return false;

  let base64: string;
  try {
    const cached = takeCached(clean, opts);
    base64 = cached ? await cached : await synthesizeBase64(clean, opts);
  } catch {
    return false;
  }

  // Resposta interrompida enquanto a rede respondia: não toca.
  if (opts.cancelled?.()) return false;

  try {
    await stopCloudSpeech();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'data:audio/mp3;base64,' + base64 },
      { shouldPlay: true, volume: 1 }
    );
    current = sound;
    perfMark('tts_playback_iniciado');

    // Só resolve quando o áudio termina, para quem chamou saber quando o Argos
    // parou de falar (é o que libera o microfone de volta para a wake word).
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded || st.didJustFinish) finish();
      });
      // Rede de segurança: nenhuma reprodução deve prender o fluxo.
      setTimeout(finish, 60000);
    });
    perfEnd('tts_playback_terminado');

    await stopCloudSpeech();
    return true;
  } catch {
    await stopCloudSpeech();
    return false;
  }
}
