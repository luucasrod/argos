// Native stub — Expo gere permissões por conta própria.
export async function warmUpMic(): Promise<void> {}
export async function isMicGranted(): Promise<boolean> { return true; }
export async function requestMicPermission(): Promise<boolean> { return true; }
