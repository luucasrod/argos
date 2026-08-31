/**
 * listenChime.ts — confirmação de que o Argos começou a escutar (nativo).
 *
 * Duas pistas ao mesmo tempo, porque só uma não cobre os casos reais:
 *   - bipe curto (assets/chime.wav), para quando o telefone está na mão;
 *   - vibração, que funciona com a tela bloqueada e o aparelho no bolso.
 *
 * IMPORTANTE: quem chama deve tocar o chime ANTES de abrir o microfone e esperar
 * CHIME_MS. Se o bipe toca com a gravação já aberta, o próprio VAD o escuta e
 * conta como fala, disparando a janela sozinho.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

/** Duração aproximada do bipe — espere isso antes de abrir o mic. */
export const CHIME_MS = 260;

let sound: AudioPlayer | null = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (sound) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const s = createAudioPlayer(require('../../assets/chime.wav'));
      s.volume = 0.85;
      sound = s;
    } catch {
      sound = null;
    }
  })();
  return loading;
}

/** Pré-carrega o áudio para o primeiro toque não sair atrasado. */
export function preloadListenChime(): void {
  void ensureLoaded();
}

/**
 * Toca o bipe e SÓ resolve quando ele terminou de sair pelo alto-falante.
 *
 * É esta variante que o serviço de wake word usa: com a tela bloqueada não há
 * nada visual, então o bipe é a única confirmação de que o Argos ouviu. Precisa
 * ser aguardado antes de reabrir o microfone, senão o VAD escuta o próprio bipe.
 */
export async function playListenChimeAndWait(): Promise<void> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

  await ensureLoaded();
  if (!sound) {
    // Sem áudio disponível, ao menos respeita o tempo para a vibração ser sentida.
    await new Promise((r) => setTimeout(r, 120));
    return;
  }

  try {
    await sound.seekTo(0);
    sound.play();
  } catch {
    // Áudio ocupado pela gravação — a vibração já serviu de confirmação.
  }
  await new Promise((r) => setTimeout(r, CHIME_MS));
}

export function playListenChime(): void {
  void playListenChimeAndWait();
}
