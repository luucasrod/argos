// Versão web — separa verificação silenciosa de pedido explícito de permissão.
let cached: boolean | null = null;

type PermState = 'granted' | 'denied' | 'prompt' | null;

async function queryPermissionsAPI(): Promise<PermState> {
  if (!('permissions' in navigator)) return null;
  try {
    const s = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return s.state as PermState;
  } catch {
    return null;
  }
}

/** Verifica se já há permissão — nunca mostra diálogo. */
export async function isMicGranted(): Promise<boolean> {
  if (cached !== null) return cached;
  if (typeof navigator === 'undefined') { cached = true; return true; }

  const state = await queryPermissionsAPI();
  if (state === 'granted') { cached = true; return true; }
  if (state === 'denied')  { cached = false; return false; }
  // 'prompt' ou null → ainda não concedido, não pede agora
  return false;
}

/** Pede permissão via getUserMedia — mostra diálogo se necessário.
 *  Deve ser chamado APENAS a partir de um gesto do usuário. */
export async function requestMicPermission(): Promise<boolean> {
  if (cached === true) return true;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    cached = true;
    return true;
  }

  const state = await queryPermissionsAPI();
  if (state === 'granted') { cached = true; return true; }
  if (state === 'denied')  { cached = false; return false; }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    cached = true;
    return true;
  } catch {
    cached = false;
    return false;
  }
}

/** Pré-aquece o cache verificando silenciosamente — sem diálogo. */
export async function warmUpMic(): Promise<void> {
  await isMicGranted();
}
