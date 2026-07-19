import { supabase } from '@/services/auth/supabase';

export interface WizLocalDeviceInfo {
  ip: string;
  mac: string;
}

type BroadcastMsg = { payload?: Record<string, unknown> };

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function pingBridge(bridgeId: string): Promise<{ ok: boolean; localIp: string }> {
  return new Promise((resolve, reject) => {
    const requestId = uid();
    const ch = supabase.channel(`wiz:${bridgeId}`);
    let done = false;

    const finish = (ok: boolean, err?: string) => {
      if (done) return;
      done = true;
      void supabase.removeChannel(ch);
      if (ok) resolve({ ok: true, localIp: '' });
      else reject(new Error(err));
    };

    const timer = setTimeout(
      () => finish(false, 'Bridge não respondeu. Verifica se o script está a correr no computador.'),
      6000
    );

    ch.on('broadcast', { event: 'pong' }, (msg: BroadcastMsg) => {
      if (msg.payload?.['id'] === requestId) {
        clearTimeout(timer);
        finish(true);
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.send({ type: 'broadcast', event: 'ping', payload: { id: requestId } });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        finish(false, 'Falha ao ligar ao Supabase Realtime.');
      }
    });
  });
}

export async function scanWizLocal(bridgeId: string): Promise<WizLocalDeviceInfo[]> {
  return new Promise((resolve, reject) => {
    const requestId = uid();
    const ch = supabase.channel(`wiz:${bridgeId}`);
    let done = false;

    const finish = (devices?: WizLocalDeviceInfo[], err?: string) => {
      if (done) return;
      done = true;
      void supabase.removeChannel(ch);
      if (devices !== undefined) resolve(devices);
      else reject(new Error(err));
    };

    const timer = setTimeout(
      () => finish(undefined, 'Scan demorou demasiado. Bridge pode estar offline.'),
      15000
    );

    ch.on('broadcast', { event: 'scan-result' }, (msg: BroadcastMsg) => {
      if (msg.payload?.['id'] === requestId) {
        clearTimeout(timer);
        finish((msg.payload?.['devices'] as WizLocalDeviceInfo[] | undefined) ?? []);
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.send({ type: 'broadcast', event: 'scan', payload: { id: requestId } });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        finish(undefined, 'Falha ao ligar ao Supabase Realtime.');
      }
    });
  });
}

export async function controlWizLocal(
  bridgeId: string,
  ip: string,
  params: Record<string, unknown>
): Promise<void> {
  const ch = supabase.channel(`wiz:${bridgeId}`);
  await new Promise<void>((resolve) => {
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch
          .send({ type: 'broadcast', event: 'control', payload: { ip, params } })
          .finally(() => {
            void supabase.removeChannel(ch);
            resolve();
          });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        void supabase.removeChannel(ch);
        resolve();
      }
    });
  });
}

export async function getWizLocalStatus(
  _bridgeId: string,
  _ip: string
): Promise<Record<string, unknown> | null> {
  return null;
}
