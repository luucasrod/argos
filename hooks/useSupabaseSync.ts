/**
 * useSupabaseSync — sincroniza dados do usuário com Supabase ao logar
 * Deve ser chamado uma vez na raiz dos tabs (após autenticação)
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { supabase } from '@/services/auth/supabase';

export function useSupabaseSync() {
  const { user } = useAuthStore();
  const { syncFromSupabase } = useMemoryStore();

  useEffect(() => {
    if (!user?.id) return;
    // Carrega memórias do Supabase quando o usuário loga
    syncFromSupabase(user.id);
  }, [user?.id, syncFromSupabase]);
}

/** Salva uma nota no Supabase para o usuário logado */
export async function saveNoteToSupabase(id: string, title: string, content: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  await supabase.from('notes').insert({
    id,
    user_id: session.user.id,
    title,
    content,
    created_at: new Date().toISOString(),
  });
}
