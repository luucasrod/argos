/**
 * browserActions.ts — Ações no browser/PWA (abrir apps, lembretes, etc.)
 */
import {
  resolveAppTarget,
  type AppOpenTarget,
} from '@/services/browser/appLinks';

export type { AppOpenTarget };

/** @deprecated Use resolveAppTarget */
export function resolveUrl(input: string): string {
  return resolveAppTarget(input).webUrl;
}

/** Abre URL web em nova aba (desktop / fallback). */
export function openWebUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Abre app nativo — deve ser chamado direto de um toque do usuário (iOS PWA).
 */
export function openNativeApp(target: AppOpenTarget): boolean {
  if (typeof window === 'undefined' || !target.nativeUrl) return false;

  const url = target.nativeUrl;

  try {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    window.location.assign(url);
    return true;
  }
}

/** Abre automaticamente (Android/desktop) ou web quando não há app nativo. */
export function openAppAuto(target: AppOpenTarget): 'native' | 'web' | 'pending' {
  if (target.requiresUserTap) {
    return 'pending';
  }

  if (target.nativeUrl) {
    const ok = openNativeApp(target);
    if (ok) return 'native';
  }

  openWebUrl(target.webUrl);
  return 'web';
}

/** Prepara abertura — use com banner/modal no iOS. */
export function prepareAppOpen(input: string): AppOpenTarget {
  return resolveAppTarget(input);
}

/** Compat: abre web (comportamento antigo). */
export function openUrl(urlOrApp: string): boolean {
  const target = prepareAppOpen(urlOrApp);
  const mode = openAppAuto(target);
  if (mode === 'pending') return false;
  return mode === 'native' || mode === 'web';
}

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

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export async function scheduleReminder(
  title: string,
  message: string,
  delayMs: number
): Promise<void> {
  if (typeof window === 'undefined') return;

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
        alert(`⏰ ${title}\n${message}`);
      }
    } else {
      alert(`⏰ ${title}\n${message}`);
    }
  }, delayMs);
}
