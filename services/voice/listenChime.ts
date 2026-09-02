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
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

/** Duração aproximada do bipe — espere isso antes de abrir o mic. */
export const CHIME_MS = 260;

let sound: Audio.Sound | null = null;
let loading: Promise<void> | null = null;

/*
 * Issue #16: usuário relata sentir só a vibração, nunca o bipe, com o app em
 * background (o caso de uso real da wake word). Antes deste log, os dois
 * catches abaixo engoliam qualquer erro em silêncio — impossível saber pelo
 * logcat se o asset falhou ao carregar, se playAsync() lançou (foco de áudio
 * negado, sessão ocupada pela gravação contínua do Vosk) ou se o problema é
 * outro (device sem suporte a record+playback simultâneo, por exemplo — não
 * dá pra distinguir isso de dentro do JS, playAsync() pode resolver "com
 * sucesso" e mesmo assim não sair som nenhum do hardware).
 * Ler com `adb logcat | grep argos-chime`.
 */
function clog(msg: string): void {
  console.log('[argos-chime] ' + msg);
}

async function ensureLoaded(): Promise<void> {
  if (sound) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { sound: s } = await Audio.Sound.createAsync(
        require('../../assets/chime.wav'),
        { volume: 0.85 }
      );
      sound = s;
      clog('asset carregado com sucesso');
    } catch (e) {
      sound = null;
      clog('FALHA ao carregar assets/chime.wav: ' + String(e));
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
    clog('sem asset carregado — tocando só a vibração');
    // Sem áudio disponível, ao menos respeita o tempo para a vibração ser sentida.
    await new Promise((r) => setTimeout(r, 120));
    return;
  }

  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
    clog('playAsync() resolveu sem erro (isso não garante que saiu som — ver #16)');
  } catch (e) {
    // Áudio ocupado pela gravação — a vibração já serviu de confirmação.
    clog('FALHA em playAsync(): ' + String(e));
  }
  await new Promise((r) => setTimeout(r, CHIME_MS));
}

export function playListenChime(): void {
  void playListenChimeAndWait();
}
