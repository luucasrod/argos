import { supabase } from './supabase';

/** Obtém token válido; tenta refresh se a sessão local expirou. */
export async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) return session.access_token;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }

  throw new Error('Usuário não autenticado. Faça login para usar o Argos.');
}

export async function clearAuthSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Ignora falha ao limpar no servidor
  }
}
