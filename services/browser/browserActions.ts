/**
 * browserActions.ts — Ações disponíveis no browser/PWA
 * Abre URLs, gerencia notificações, agendamentos, hora/data
 */

/** Atalhos para apps e sites comuns */
const URL_SHORTCUTS: Record<string, string> = {
  spotify: 'https://open.spotify.com',
  youtube: 'https://youtube.com',
  'youtube music': 'https://music.youtube.com',
  whatsapp: 'https://web.whatsapp.com',
  gmail: 'https://mail.google.com',
  google: 'https://google.com',
  instagram: 'https://instagram.com',
  twitter: 'https://twitter.com',
  x: 'https://x.com',
  netflix: 'https://netflix.com',
  amazon: 'https://amazon.com.br',
  maps: 'https://maps.google.com',
  'google maps': 'https://maps.google.com',
  notion: 'https://notion.so',
  github: 'https://github.com',
  chatgpt: 'https://chat.openai.com',
  'chat gpt': 'https://chat.openai.com',
  linkedin: 'https://linkedin.com',
  twitch: 'https://twitch.tv',
  discord: 'https://discord.com/app',
  telegram: 'https://web.telegram.org',
};

/** Resolve um nome de app ou URL parcial para URL completa */
export function resolveUrl(input: string): string {
  const lower = input.toLowerCase().trim();

  // Atalho direto
  const shortcut = URL_SHORTCUTS[lower];
  if (shortcut) return shortcut;

  // Já é URL com protocolo
  if (lower.startsWith('http://') || lower.startsWith('https://')) return input;

  // Parece um domínio
  if (lower.includes('.') && !lower.includes(' ')) return 'https://' + input;

  // Pesquisa no Google
  return 'https://www.google.com/search?q=' + encodeURIComponent(input);
}

/** Abre uma URL ou app no browser */
export function openUrl(urlOrApp: string): boolean {
  if (typeof window === 'undefined') return false;
  const url = resolveUrl(urlOrApp);
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** Retorna hora e data atual formatadas em pt-BR */
export function getCurrentDateTime(): {
  time: string;
  date: string;
  weekday: string;
  fullFormatted: string;
} {
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const fullFormatted = `${weekday}, ${date} — ${time}`;
  return { time, date, weekday, fullFormatted };
}

/** Pede permissão de notificação ao usuário */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

/** Agendamento de lembrete via setTimeout + Notification API */
export async function scheduleReminder(
  title: string,
  message: string,
  delayMs: number
): Promise<void> {
  if (typeof window === 'undefined') return;

  // Pede permissão antes de agendar
  const hasPermission = await requestNotificationPermission();

  const delayMinutes = Math.round(delayMs / 60000);
  console.log(`[Argos] Lembrete agendado: "${title}" em ${delayMinutes} min`);

  setTimeout(() => {
    if (hasPermission && 'Notification' in window) {
      try {
        new Notification(`⏰ ${title}`, {
          body: message,
          icon: '/assets/icon.png',
          tag: `argos-reminder-${Date.now()}`,
          requireInteraction: true,
        });
      } catch {
        // Fallback para alert
        alert(`⏰ ${title}\n${message}`);
      }
    } else {
      alert(`⏰ ${title}\n${message}`);
    }
  }, delayMs);
}
