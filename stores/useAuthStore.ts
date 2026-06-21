import { create } from 'zustand';
import { Platform } from 'react-native';
import { supabase, mapUser, type SupabaseUser } from '@/services/auth/supabase';
import { clearAuthSession } from '@/services/auth/session';
import { isAuthRequired } from '@/services/auth/config';

interface AuthStore {
  user: SupabaseUser | null;
  loading: boolean;
  initialized: boolean;
  authError: string | null;
  authMessage: string | null;
  setUser: (user: SupabaseUser | null) => void;
  setLoading: (v: boolean) => void;
  setInitialized: (v: boolean) => void;
  clearAuthFeedback: () => void;
  signInWithGoogle: () => Promise<string | null>;
  signInWithEmail: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  handleSessionExpired: () => Promise<void>;
  initialize: () => Promise<() => void>;
}

async function redirectToLogin() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign('/login');
    return;
  }
  const { router } = await import('expo-router');
  router.replace('/login');
}

function getRedirectUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

async function resolveUserFromSession(): Promise<SupabaseUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (!error && user) return mapUser(user);

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed.session?.user) {
    return mapUser(refreshed.session.user);
  }

  await clearAuthSession();
  return null;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  authError: null,
  authMessage: null,

  setUser: (user) => set({ user }),
  setLoading: (v) => set({ loading: v }),
  setInitialized: (v) => set({ initialized: v }),
  clearAuthFeedback: () => set({ authError: null, authMessage: null }),

  signInWithGoogle: async () => {
    set({ loading: true, authError: null, authMessage: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectUrl(),
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (error) {
      const msg =
        error.message.includes('not enabled') || error.message.includes('Unsupported provider')
          ? 'Login com Google ainda não está ativado no Supabase. Use o e-mail abaixo ou ative o Google no painel do Supabase.'
          : error.message;
      set({ loading: false, authError: msg });
      return msg;
    }
    return null;
  },

  signInWithEmail: async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      const msg = 'Digite um e-mail válido.';
      set({ authError: msg });
      return msg;
    }

    set({ loading: true, authError: null, authMessage: null });
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: getRedirectUrl() },
    });
    set({ loading: false });

    if (error) {
      set({ authError: error.message });
      return error.message;
    }

    const msg = `Link enviado para ${trimmed}. Abra seu e-mail e toque no link para entrar.`;
    set({ authMessage: msg });
    return null;
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await clearAuthSession();
    } finally {
      set({ user: null, loading: false, authError: null, authMessage: null });
      await redirectToLogin();
    }
  },

  handleSessionExpired: async () => {
    set({ user: null, loading: false });
    await clearAuthSession();
    await redirectToLogin();
  },

  initialize: async () => {
    if (!isAuthRequired()) {
      set({
        user: { id: 'test-mode', name: 'Modo teste', email: 'teste@argos.local' },
        initialized: true,
      });
      return () => {};
    }

    const user = await resolveUserFromSession();
    set({ user, initialized: true });

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
