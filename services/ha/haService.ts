import { supabase } from '@/services/auth/supabase';

const HA_API = '/api/ha';

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function generateHAKey(): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${HA_API}?action=generate-key`, { method: 'POST', headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Erro ao gerar chave');
  return json.api_key as string;
}

export async function getHAKey(): Promise<{ api_key: string; created_at: string } | null> {
  const headers = await authHeaders();
  const res = await fetch(`${HA_API}?action=get-key`, { headers });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Erro ao buscar chave');
  return json as { api_key: string; created_at: string };
}

export async function deleteHAKey(): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${HA_API}?action=delete-key`, { method: 'DELETE', headers });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.error ?? 'Erro ao remover chave');
  }
}
