/**
 * playMusic.ts — toca música no YouTube Music a partir de um pedido em texto.
 *
 * Caminho principal: o intent padrão do Android `MEDIA_PLAY_FROM_SEARCH`. É o
 * mesmo que o Google Assistente usa e é o único que **inicia a reprodução**
 * sozinho — abrir a URL do YouTube Music apenas mostra a busca e exige um toque,
 * o que não serve dirigindo.
 *
 * Reserva: se nenhum app responder ao intent, abre a busca do YouTube Music pela
 * URL. Pelo menos a pessoa vê o resultado e toca uma vez.
 *
 * Limitação conhecida (Android): pausar/continuar/próxima exigem enviar tecla de
 * mídia, o que só é possível por módulo nativo (AudioManager.dispatchMediaKeyEvent)
 * — não existe API disso no React Native puro. Por isso só `play` funciona hoje.
 */
import { Linking, Platform } from 'react-native';

const YTM_PACKAGE = 'com.google.android.apps.youtube.music';

export interface PlayMusicResult {
  ok: boolean;
  /** Mensagem pronta para falar/mostrar. */
  message: string;
}

function searchUrl(query: string): string {
  return 'https://music.youtube.com/search?q=' + encodeURIComponent(query);
}

/** Abre o YouTube Music já buscando, como reserva quando o intent falha. */
async function openSearchFallback(query: string): Promise<boolean> {
  try {
    await Linking.openURL(searchUrl(query));
    return true;
  } catch {
    return false;
  }
}

/**
 * Toca o que foi pedido. `query` é livre: nome da música, artista, álbum ou
 * playlist — quem resolve é o próprio YouTube Music.
 */
export async function playMusic(query: string): Promise<PlayMusicResult> {
  const q = query.trim();
  if (!q) return { ok: false, message: 'Não entendi qual música você quer.' };

  if (Platform.OS !== 'android') {
    const opened = await openSearchFallback(q);
    return opened
      ? { ok: true, message: `Abrindo ${q} no YouTube Music.` }
      : { ok: false, message: 'Não consegui abrir o YouTube Music.' };
  }

  try {
    // Intent padrão de mídia: inicia a reprodução sem exigir toque.
    await Linking.sendIntent('android.media.action.MEDIA_PLAY_FROM_SEARCH', [
      { key: 'query', value: q },
      // Dica de app preferido. Nem toda versão do Android respeita, mas quando
      // respeita evita o seletor de aplicativo aparecer no meio do trânsito.
      { key: 'android.intent.extra.PACKAGE_NAME', value: YTM_PACKAGE },
    ]);
    return { ok: true, message: `Tocando ${q}.` };
  } catch {
    const opened = await openSearchFallback(q);
    return opened
      ? { ok: true, message: `Abri a busca por ${q} no YouTube Music.` }
      : {
          ok: false,
          message: 'Não consegui iniciar a música. O YouTube Music está instalado?',
        };
  }
}

/** Abre o YouTube Music sem busca — usado para "continuar tocando". */
export async function openMusicApp(): Promise<PlayMusicResult> {
  try {
    await Linking.sendIntent('android.intent.action.MAIN', [
      { key: 'android.intent.extra.PACKAGE_NAME', value: YTM_PACKAGE },
    ]);
    return { ok: true, message: 'Abrindo o YouTube Music.' };
  } catch {
    const opened = await openSearchFallback('');
    return opened
      ? { ok: true, message: 'Abrindo o YouTube Music.' }
      : { ok: false, message: 'Não consegui abrir o YouTube Music.' };
  }
}
