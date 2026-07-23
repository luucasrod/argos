import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
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
  signUpWithPassword: (
    name: string,
    email: string,
    birthdate: string,
    password: string
  ) => Promise<string | null>;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
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

function getRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return Linking.createURL('/');
}

async function resolveUserFromSession(opts?: { allowAnonymous?: boolean }): Promise<SupabaseUser | null> {
  const allowAnonymous = opts?.allowAnonymous ?? true;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  if (!allowAnonymous && session.user.is_anonymous) {
    // Sessão fantasma do modo de teste — não vale como login real.
    await clearAuthSession();
    return null;
  }

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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectUrl(),
        skipBrowserRedirect: Platform.OS !== 'web',
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
    if (Platform.OS !== 'web' && data?.url) {
      await Linking.openURL(data.url);
    }
    // Timeout de segurança para todos os casos: no iOS PWA o OAuth abre no
    // Safari do sistema e o PWA nunca recebe o redirect — sem isso o botão
    // fica girando para sempre.
    setTimeout(() => {
      if (useAuthStore.getState().loading) set({ loading: false });
    }, 30_000);
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
      options: {
        emailRedirectTo: getRedirectUrl(),
        shouldCreateUser: true,
      },
    });
    set({ loading: false });

    if (error) {
      const msg = error.message.includes('rate limit')
        ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
        : error.message;
      set({ authError: msg });
      return msg;
    }

    const msg = `Link enviado para ${trimmed}. Abra seu e-mail e toque no link para entrar.`;
    set({ authMessage: msg });
    return null;
  },

  signUpWithPassword: async (name, email, birthdate, password) => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      const msg = 'Digite seu nome.';
      set({ authError: msg });
      return msg;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      const msg = 'Digite um e-mail válido.';
      set({ authError: msg });
      return msg;
    }
    if (!birthdate) {
      const msg = 'Digite sua data de nascimento.';
      set({ authError: msg });
      return msg;
    }
    if (password.length < 6) {
      const msg = 'A senha precisa ter pelo menos 6 caracteres.';
      set({ authError: msg });
      return msg;
    }

    set({ loading: true, authError: null, authMessage: null });

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { data: { full_name: trimmedName, birthdate } },
    });

    if (error) {
      const msg = error.message.includes('already registered')
        ? 'Esse e-mail já está cadastrado. Faça login.'
        : error.message;
      set({ loading: false, authError: msg });
      return msg;
    }

    if (!data.session || !data.user) {
      // Confirmação de e-mail ainda ativa no Supabase — não deveria acontecer em produção.
      set({
        loading: false,
        authMessage: 'Conta criada! Confirme seu e-mail para entrar.',
      });
      return null;
    }

    await supabase
      .from('profiles')
      .update({ name: trimmedName, birthdate })
      .eq('id', data.user.id);

    set({ user: mapUser(data.user), loading: false, initialized: true });
    return null;
  },

  signInWithPassword: async (email, password) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      const msg = 'Digite um e-mail válido.';
      set({ authError: msg });
      return msg;
    }

    set({ loading: true, authError: null, authMessage: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password });

    if (error) {
      const msg = error.message.includes('Invalid login credentials')
        ? 'E-mail ou senha incorretos.'
        : error.message;
      set({ loading: false, authError: msg });
      return msg;
    }

    set({ user: mapUser(data.user), loading: false, initialized: true });
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
      let user = await resolveUserFromSession();
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!error && data.user) {
          user = mapUser(data.user);
        }
      }
      set({
        user: user ?? { id: 'test-mode', name: 'Modo teste', email: 'teste@argos.local' },
        initialized: true,
      });
      return () => {};
    }

    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finishInit = (user: SupabaseUser | null) => {
      if (settled) return;
      settled = true;
      set({ user, initialized: true, loading: false });
    };

    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        const isRealUser = !!(session?.user && !session.user.is_anonymous);

        if (event === 'INITIAL_SESSION') {
          finishInit(isRealUser ? mapUser(session.user) : null);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (isRealUser) {
            // Sempre atualiza o usuário — necessário no fluxo PKCE onde
            // INITIAL_SESSION dispara com null antes da troca do code completar,
            // marcando settled=true e fazendo finishInit ignorar o SIGNED_IN.
            settled = true;
            set({ user: mapUser(session.user!), initialized: true, loading: false });
          } else {
            // Sem usuário real: garante que loading seja limpo em qualquer cenário
            if (!settled) finishInit(null);
            else set({ loading: false });
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          set({ user: null, loading: false });
        }
      });
      subscription = data.subscription;

      const user = await resolveUserFromSession({ allowAnonymous: false });
      finishInit(user);
    } catch {
      // Qualquer erro na inicialização do auth: desbloqueia o spinner
      finishInit(null);
    }

    return () => subscription?.unsubscribe();
  },
}));
