/**
 * Registro de apps com deep links (iOS / Android) e fallback web.
 * PWA no iPhone não abre apps nativos sem gesto do usuário — use prepareAppOpen + botão.
 */

export interface AppLink {
  label: string;
  web?: string;
  ios?: string;
  android?: string;
}

const APP_LINKS: Record<string, AppLink> = {
  whatsapp: {
    label: 'WhatsApp',
    web: 'https://web.whatsapp.com',
    ios: 'whatsapp://',
    android: 'whatsapp://send',
  },
  spotify: {
    label: 'Spotify',
    web: 'https://open.spotify.com',
    ios: 'spotify://',
    android: 'spotify://',
  },
  youtube: {
    label: 'YouTube',
    web: 'https://youtube.com',
    ios: 'youtube://',
    android: 'vnd.youtube://',
  },
  'youtube music': {
    label: 'YouTube Music',
    web: 'https://music.youtube.com',
    ios: 'youtubemusic://',
    android: 'vnd.youtube.music://',
  },
  instagram: {
    label: 'Instagram',
    web: 'https://instagram.com',
    ios: 'instagram://',
    android: 'instagram://',
  },
  twitter: {
    label: 'Twitter / X',
    web: 'https://twitter.com',
    ios: 'twitter://',
    android: 'twitter://',
  },
  x: {
    label: 'X',
    web: 'https://x.com',
    ios: 'twitter://',
    android: 'twitter://',
  },
  telegram: {
    label: 'Telegram',
    web: 'https://web.telegram.org',
    ios: 'tg://',
    android: 'tg://',
  },
  discord: {
    label: 'Discord',
    web: 'https://discord.com/app',
    ios: 'discord://',
    android: 'discord://',
  },
  netflix: {
    label: 'Netflix',
    web: 'https://netflix.com',
    ios: 'nflx://',
    android: 'nflx://',
  },
  gmail: {
    label: 'Gmail',
    web: 'https://mail.google.com',
    ios: 'googlegmail://',
    android: 'googlegmail://',
  },
  google: {
    label: 'Google',
    web: 'https://google.com',
    ios: 'googlechrome://',
    android: 'https://google.com',
  },
  maps: {
    label: 'Mapas',
    web: 'https://maps.google.com',
    ios: 'maps://',
    android: 'geo:0,0',
  },
  'google maps': {
    label: 'Google Maps',
    web: 'https://maps.google.com',
    ios: 'comgooglemaps://',
    android: 'comgooglemaps://',
  },
  waze: {
    label: 'Waze',
    web: 'https://waze.com',
    ios: 'waze://',
    android: 'waze://',
  },
  uber: {
    label: 'Uber',
    web: 'https://m.uber.com',
    ios: 'uber://',
    android: 'uber://',
  },
  '99': {
    label: '99',
    web: 'https://99app.com',
    ios: 'taxis99://',
    android: 'taxis99://',
  },
  ifood: {
    label: 'iFood',
    web: 'https://www.ifood.com.br',
    ios: 'ifood://',
    android: 'ifood://',
  },
  rappi: {
    label: 'Rappi',
    web: 'https://www.rappi.com.br',
    ios: 'rappi://',
    android: 'rappi://',
  },
  mercadolivre: {
    label: 'Mercado Livre',
    web: 'https://mercadolivre.com.br',
    ios: 'meli://',
    android: 'meli://',
  },
  amazon: {
    label: 'Amazon',
    web: 'https://amazon.com.br',
    ios: 'amazon://',
    android: 'amazon://',
  },
  shopee: {
    label: 'Shopee',
    web: 'https://shopee.com.br',
    ios: 'shopee://',
    android: 'shopee://',
  },
  linkedin: {
    label: 'LinkedIn',
    web: 'https://linkedin.com',
    ios: 'linkedin://',
    android: 'linkedin://',
  },
  github: {
    label: 'GitHub',
    web: 'https://github.com',
    ios: 'github://',
    android: 'github://',
  },
  notion: {
    label: 'Notion',
    web: 'https://notion.so',
    ios: 'notion://',
    android: 'notion://',
  },
  chatgpt: {
    label: 'ChatGPT',
    web: 'https://chat.openai.com',
    ios: 'chatgpt://',
    android: 'https://chat.openai.com',
  },
  'chat gpt': {
    label: 'ChatGPT',
    web: 'https://chat.openai.com',
    ios: 'chatgpt://',
  },
  twitch: {
    label: 'Twitch',
    web: 'https://twitch.tv',
    ios: 'twitch://',
    android: 'twitch://',
  },
  tiktok: {
    label: 'TikTok',
    web: 'https://tiktok.com',
    ios: 'tiktok://',
    android: 'snssdk1233://',
  },
  facebook: {
    label: 'Facebook',
    web: 'https://facebook.com',
    ios: 'fb://',
    android: 'fb://',
  },
  messenger: {
    label: 'Messenger',
    web: 'https://messenger.com',
    ios: 'fb-messenger://',
    android: 'fb-messenger://',
  },
  photos: {
    label: 'Fotos',
    web: 'photos://',
    ios: 'photos-redirect://',
  },
  camera: {
    label: 'Câmera',
    ios: 'camera://',
  },
  settings: {
    label: 'Ajustes',
    ios: 'app-settings:',
    android: 'android.settings.SETTINGS',
  },
  ajustes: {
    label: 'Ajustes',
    ios: 'app-settings:',
  },
  calendar: {
    label: 'Calendário',
    ios: 'calshow://',
  },
  calendario: {
    label: 'Calendário',
    ios: 'calshow://',
  },
  notes: {
    label: 'Notas',
    ios: 'mobilenotes://',
  },
  notas: {
    label: 'Notas',
    ios: 'mobilenotes://',
  },
  music: {
    label: 'Apple Music',
    web: 'https://music.apple.com',
    ios: 'music://',
  },
  'apple music': {
    label: 'Apple Music',
    web: 'https://music.apple.com',
    ios: 'music://',
  },
  facetime: {
    label: 'FaceTime',
    ios: 'facetime://',
  },
  phone: {
    label: 'Telefone',
    ios: 'tel://',
    android: 'tel:',
  },
  telefone: {
    label: 'Telefone',
    ios: 'tel://',
  },
  messages: {
    label: 'Mensagens',
    ios: 'sms://',
    android: 'sms:',
  },
  mensagens: {
    label: 'Mensagens',
    ios: 'sms://',
  },
  mail: {
    label: 'E-mail',
    ios: 'message://',
  },
  appstore: {
    label: 'App Store',
    ios: 'itms-apps://itunes.apple.com',
  },
};

export interface AppOpenTarget {
  input: string;
  label: string;
  webUrl: string;
  nativeUrl: string | null;
  /** iOS PWA exige toque do usuário para abrir app nativo */
  requiresUserTap: boolean;
}

export function isIOSWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isAndroidWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function normalizeKey(input: string): string {
  return input.toLowerCase().trim();
}

export function resolveAppLink(input: string): AppLink | null {
  const key = normalizeKey(input);
  return APP_LINKS[key] ?? null;
}

/** Resolve nome de app, URL ou pesquisa para destino de abertura. */
export function resolveAppTarget(input: string): AppOpenTarget {
  const trimmed = input.trim();
  const lower = normalizeKey(trimmed);
  const known = APP_LINKS[lower];

  if (known) {
    const nativeUrl = isIOSWeb()
      ? known.ios ?? null
      : isAndroidWeb()
        ? known.android ?? known.ios ?? null
        : null;

    return {
      input: trimmed,
      label: known.label,
      webUrl: known.web ?? known.ios ?? 'about:blank',
      nativeUrl,
      requiresUserTap: isIOSWeb() && !!nativeUrl,
    };
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return {
      input: trimmed,
      label: trimmed.replace(/^https?:\/\//, '').split('/')[0],
      webUrl: trimmed,
      nativeUrl: null,
      requiresUserTap: false,
    };
  }

  if (lower.startsWith('tel:') || lower.startsWith('sms:') || lower.startsWith('mailto:')) {
    return {
      input: trimmed,
      label: trimmed.split(':')[0],
      webUrl: trimmed,
      nativeUrl: trimmed,
      requiresUserTap: isIOSWeb(),
    };
  }

  if (lower.includes('.') && !lower.includes(' ')) {
    const webUrl = 'https://' + trimmed;
    return {
      input: trimmed,
      label: trimmed,
      webUrl,
      nativeUrl: null,
      requiresUserTap: false,
    };
  }

  const webUrl = 'https://www.google.com/search?q=' + encodeURIComponent(trimmed);
  return {
    input: trimmed,
    label: `Pesquisa: ${trimmed}`,
    webUrl,
    nativeUrl: null,
    requiresUserTap: false,
  };
}

/** Lista de apps suportados (para o prompt da IA). */
export function getSupportedAppNames(): string[] {
  return Object.keys(APP_LINKS).filter((k) => !k.includes(' '));
}
