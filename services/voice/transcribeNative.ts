/**
 * transcribeNative.ts — envia o arquivo gravado para /api/transcribe (Whisper).
 *
 * Usa FormData com `{ uri, name, type }`, que é o caminho de upload de arquivo
 * do React Native: a camada nativa de rede lê o arquivo direto do disco. É de
 * propósito que NÃO se lê o arquivo em JS aqui:
 *   - `expo-file-system` não está instalado (e OTA não pode adicionar módulo
 *     nativo), então readAsStringAsync não é opção;
 *   - `fetch(fileUri) -> blob() -> FileReader` (o que o código antigo fazia)
 *     não é confiável para `file://` no Android — era por isso que a wake word
 *     nunca transcrevia nada.
 * Como bônus, sem base64 o payload fica ~25% menor e não bloqueia a thread JS.
 *
 * Importante: não definir Content-Type manualmente — o RN precisa gerar o
 * boundary do multipart.
 */
import { getAccessToken } from '@/services/auth/session';
import { API_BASE } from '@/constants/api';

const TIMEOUT_MS = 20000;

export async function transcribeRecording(uri: string): Promise<string> {
  const token = await getAccessToken().catch(() => null);

  const form = new FormData();
  form.append('file', {
    uri,
    name: 'audio.m4a',
    type: 'audio/mp4',
  } as unknown as Blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('auth');
    throw new Error(`transcribe_${res.status}`);
  }

  const json = (await res.json()) as { text?: string };
  return (json.text ?? '').trim();
}
