/**
 * Estado de conectividade de rede (FASE 5 do Prompt Master).
 * Usa fetch ping leve para detectar online/offline sem depender de
 * módulos nativos adicionais (100% OTA-safe).
 */
import { create } from 'zustand';

type ConnectivityState = {
  isOnline: boolean;
  lastChecked: number | null;
  checkNow: () => Promise<void>;
};

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isOnline: true,
  lastChecked: null,

  checkNow: async () => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch('https://1.1.1.1', {
        method: 'HEAD',
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(tid);
      set({ isOnline: res.status < 500, lastChecked: Date.now() });
    } catch {
      set({ isOnline: false, lastChecked: Date.now() });
    }
  },
}));

let _intervalId: ReturnType<typeof setInterval> | null = null;

/** Inicia verificação periódica. Retorna cleanup function. */
export function startConnectivityMonitor(): () => void {
  const { checkNow } = useConnectivityStore.getState();
  checkNow();
  if (!_intervalId) {
    _intervalId = setInterval(checkNow, 30_000);
  }
  return () => {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  };
}
