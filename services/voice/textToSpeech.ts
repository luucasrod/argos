import * as Speech from 'expo-speech';
import { AIPersonality } from '@/types/ai.types';
import { pickVoiceForPersonality, pitchForUtterance } from '@/services/voice/voicePicker';
import { stripForSpeech } from '@/services/voice/speechText';

// getAvailableVoicesAsync() no Android leva segundos e a lista não muda durante a
// sessão. Sem este cache, cada fala pagava esse custo antes de começar a falar.
type VoiceList = Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>;

let voicesCache: VoiceList | null = null;
let voicesPromise: Promise<VoiceList> | null = null;
let voicesLogged = false;

async function getVoices(): Promise<VoiceList> {
  if (voicesCache) return voicesCache;
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync()
      .then((v) => {
        voicesCache = v;
        return v;
      })
      .catch((): VoiceList => []);
  }
  return voicesPromise;
}

export async function textToSpeech(text: string, personality: AIPersonality): Promise<void> {
  // stripForSpeech, não stripEmojis: o sintetizador lê "asterisco" e "cerquilha"
  // quando o markdown escapa, e nem todo chamador passa por resolveIntentSpeech.
  const spoken = stripForSpeech(text?.trim() ?? '');
  if (!spoken) return;

  Speech.stop();

  /*
   * Tenta a voz neural do servidor primeiro. Se não houver provedor
   * configurado, se a cota acabar ou se a rede falhar, cai para a voz do
   * sistema — o usuário no máximo ouve a voz antiga, nunca silêncio.
   */
  try {
    const { speakWithCloud } = await import('@/services/voice/cloudTts');
    const falou = await speakWithCloud(spoken, {
      rate: Math.min(2, Math.max(0.5, personality.voiceSpeed ?? 1.0)),
      gender: personality.voiceGender,
    });
    if (falou) return;
  } catch {
    // segue para a voz do sistema
  }

  const voices = await getVoices();
  const selected = pickVoiceForPersonality(voices, personality);
  const rate = Math.min(2, Math.max(0.5, personality.voiceSpeed ?? 1.0));
  const pitch = pitchForUtterance(selected ?? null, personality.voiceGender);

  // Diagnóstico (uma vez por sessão): sem a lista real de vozes do aparelho não
  // dá para saber por que a escolha masculina falha — os identificadores do
  // Google TTS no Android não trazem o gênero no nome, então os regexes de
  // voicePicker.ts podem simplesmente não ter em que casar. Ler no logcat com
  // a tag ReactNativeJS, prefixo [argos-voz].
  if (!voicesLogged) {
    voicesLogged = true;
    const pt = voices.filter((v) =>
      (v.language ?? '').toLowerCase().startsWith('pt')
    );
    console.log(
      `[argos-voz] genero=${personality.voiceGender} escolhida=${
        selected?.identifier ?? 'NENHUMA(voz padrao do sistema)'
      } pitch=${pitch} | ${pt.length} vozes pt: ` +
        pt.map((v) => `${v.identifier}[${v.language}]`).join(', ')
    );
  }

  return new Promise((resolve) => {
    // O expo-speech no Android não garante onDone/onError: se o motor de TTS não
    // estiver instalado, ou a voz/idioma pedido não existir, ele pode não chamar
    // callback nenhum. Sem este teto, a promise nunca resolvia e travava todo o
    // fluxo do Argos (o speak() é aguardado antes de executar ações).
    let settled = false;
    let guard: ReturnType<typeof setTimeout>;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve();
    };

    /*
     * O guard existe só para o caso de onDone/onError nunca chegarem. Antes ele
     * chamava Speech.stop(), o que TRUNCAVA a frase no meio quando a estimativa
     * de duração era curta. Agora ele consulta se ainda está falando e reagenda —
     * nunca interrompe. Sem teto fixo: quem manda é o próprio motor de TTS.
     */
    const armGuard = (ms: number) => {
      guard = setTimeout(() => {
        if (settled) return;
        Speech.isSpeakingAsync()
          .then((speaking) => {
            if (speaking) armGuard(2000);
            else finish();
          })
          .catch(() => finish());
      }, ms);
    };

    // ~10 caracteres por segundo em pt-BR, com folga generosa.
    const estimatedMs = (spoken.length / 10) * 1000 * (1 / Math.max(0.5, rate));
    armGuard(Math.max(5000, estimatedMs + 4000));

    const options: Speech.SpeechOptions = {
      language: personality.language,
      pitch,
      rate,
      onDone: finish,
      onError: finish,
      onStopped: finish,
    };

    if (selected?.identifier) {
      options.voice = selected.identifier;
    }

    try {
      Speech.speak(spoken, options);
    } catch {
      finish();
    }
  });
}

export function stopSpeaking() {
  Speech.stop();
}

export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

export async function listAvailableVoices(): Promise<string[]> {
  const voices = await getVoices();
  return voices.map((v) => `${v.name ?? v.identifier} (${v.language})`);
}
