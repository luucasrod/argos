import { create } from 'zustand';
import { supabase, mapUser, type SupabaseUser } from '@/services/auth/supabase';

interface AuthStore {
  user: SupabaseUser | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: SupabaseUser | null) => void;
  setLoading: (v: boolean) => void;
  setInitialized: (v: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<() => void>; // retorna unsubscribe
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  setUser: (user) => set({ user }),
  setLoading: (v) => set({ loading: v }),
  setInitialized: (v) => set({ initialized: v }),

  signInWithGoogle: async () => {
    set({ loading: true });
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      console.error('[Auth] Erro Google OAuth:', error.message);
      set({ loading: false });
    }
    // Após redirect, a sessão é detectada automaticamente via onAuthStateChange
  },

  signOut: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    set({ user: null, loading: false });
  },

  initialize: async () => {
    // Verifica sessão existente ao iniciar o app
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({ user: mapUser(session.user), initialized: true });
    } else {
      set({ initialized: true });
    }

    // Escuta mudanças de auth (login/logout/refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        set({ user: mapUser(session.user), loading: false });
      } else {
        set({ user: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
