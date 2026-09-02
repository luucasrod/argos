import '../global.css';
import 'react-native-reanimated';
import 'react-native-gesture-handler';
import { Stack, router, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useState } from 'react';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { isAuthRequired } from '@/services/auth/config';
import { supabase, mapUser } from '@/services/auth/supabase';
import { stopAllSpeech } from '@/services/voice/textToSpeech';

/*
 * Todo reload de OTA passa por aqui (issue #32). O reload derruba a
 * ReactInstance, e o expo-av tem um bug de thread conhecido: se um
 * Audio.Sound (voz em nuvem, cloudTts.ts) ainda estiver carregado nesse
 * momento, AVManager.onHostDestroy() tenta liberar o ExoPlayer numa thread
 * de pool, não a main — FATAL EXCEPTION, o app fecha sozinho (capturado em
 * log real, ver a issue). O bundle novo carrega normalmente depois; quem
 * morre é a instância antiga, no desligamento.
 *
 * stopAllSpeech() (#145) já para os dois motores (cloud e sistema) e
 * descarrega o Audio.Sound de forma limpa, na thread certa, ANTES do
 * teardown nativo começar — sem áudio carregado, não sobra nada pro
 * AVManager tentar liberar errado. Silenciar erro de propósito: mesmo se
 * isto falhar, o reload tem que continuar.
 */
async function reloadApp(): Promise<void> {
  try {
    await stopAllSpeech();
  } catch {
    // Não deixa uma falha aqui impedir o reload.
  }
  Updates.reloadAsync().catch(() => {});
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Argos ErrorBoundary:', error);
  }

  render() {
    if (this.state.error) {
      // Antes esta tela era um beco sem saída: fundo quase preto, texto pequeno e
      // nenhuma forma de sair — o usuário só podia matar o app. Agora dá pra
      // tentar de novo ou recarregar o bundle.
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Argos travou</Text>
          <Text style={errorStyles.message}>{this.state.error.message}</Text>
          <View style={errorStyles.actions}>
            <TouchableOpacity
              style={errorStyles.btn}
              onPress={() => this.setState({ error: null })}
              activeOpacity={0.8}
            >
              <Text style={errorStyles.btnText}>Tentar de novo</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={[errorStyles.btn, errorStyles.btnGhost]}
                onPress={() => { void reloadApp(); }}
                activeOpacity={0.8}
              >
                <Text style={errorStyles.btnText}>Reiniciar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    padding: 24,
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? ('100vh' as unknown as number) : undefined,
  },
  title: { color: Colors.text.primary, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  message: { color: Colors.status.error, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

const rootStyle = Platform.select({
  web: { flex: 1, minHeight: '100vh' as unknown as number, width: '100%' as unknown as number, backgroundColor: Colors.bg.primary },
  default: { flex: 1, backgroundColor: Colors.bg.primary },
});

/** Guard que redireciona para login se não autenticado */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, initialized, initialize } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    initialize().then((unsub) => { unsubscribe = unsub; });
    return () => unsubscribe?.();
  }, [initialize]);

  useEffect(() => {
    if (!initialized) return;
    if (!isAuthRequired()) return;

    const inLogin = segments[0] === 'login';

    if (!user && !inLogin) {
      router.replace('/login');
    } else if (user && inLogin) {
      router.replace('/(tabs)');
    }
  }, [user, initialized, segments]);

  // Tela de carregamento enquanto verifica sessão
  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#7C3AED', marginBottom: 20 }} />
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

function useMicWarmUp() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const warmUp = () => {
      import('@/services/voice/micPermission').then((m) => m.warmUpMic());
    };
    document.addEventListener('pointerdown', warmUp, { once: true });
    return () => document.removeEventListener('pointerdown', warmUp);
  }, []);
}

// Quando o service worker atualiza (nova versão deployada), recarrega a página
// automaticamente para que o usuário veja a versão nova sem precisar fechar/abrir o app.
function useSwUpdateReload() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}

// No TWA, o Google OAuth redireciona de volta dentro de um Chrome Custom Tab overlay.
// O Custom Tab completa a auth e salva a sessão no localStorage (compartilhado com o TWA).
// Quando o Custom Tab fecha e o TWA volta ao foco, detectamos aqui e atualizamos o store.
function useOAuthTabResume() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !session.user.is_anonymous) {
        useAuthStore.setState({ user: mapUser(session.user), initialized: true, loading: false });
      }
    };

    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
}

function useOAuthDeepLink() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handle = async ({ url }: { url: string }) => {
      if (!url) return;
      try {
        await supabase.auth.exchangeCodeForSession(url);
      } catch {}
    };
    const sub = Linking.addEventListener('url', handle);
    Linking.getInitialURL().then((url) => { if (url) void handle({ url }); });
    return () => sub.remove();
  }, []);
}

/**
 * Aplica a atualização no BOOT, antes de qualquer coisa subir.
 *
 * Por que aqui e não em background: aplicar depois exige reiniciar o bundle, e o
 * reload derruba o foreground service da escuta — pior, se o serviço voltar a
 * subir com o app já em background, o Android nega o microfone. No boot o app
 * está em primeiro plano e o serviço ainda não existe, então é a única janela em
 * que reiniciar é inofensivo.
 *
 * Também resolve o problema de entrega: um cold start comum só BAIXA o update e
 * o aplica no início seguinte — ou seja, era preciso abrir o app duas vezes.
 * Aqui a busca, o download e o reload acontecem na mesma abertura.
 */
function UpdateGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(Platform.OS === 'web' || __DEV__);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return;
    let cancelled = false;

    const run = async () => {
      try {
        // Se a rede estiver ruim, não travar a abertura do app.
        const check = await Promise.race([
          Updates.checkForUpdateAsync(),
          new Promise<null>((r) => setTimeout(() => r(null), 6000)),
        ]);
        if (cancelled) return;

        if (check && check.isAvailable) {
          setUpdating(true);
          const fetched = await Promise.race([
            Updates.fetchUpdateAsync(),
            new Promise<null>((r) => setTimeout(() => r(null), 25000)),
          ]);
          if (cancelled) return;
          if (fetched && fetched.isNew) {
            await reloadApp();
            return; // o processo reinicia aqui
          }
        }
      } catch {
        // Offline ou updates desabilitado — segue com o bundle atual.
      }
      if (!cancelled) {
        setUpdating(false);
        setReady(true);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <View style={gateStyles.container}>
        <View style={gateStyles.dot} />
        <ActivityIndicator color="#7C3AED" size="large" />
        <Text style={gateStyles.text}>
          {updating ? 'Atualizando o Argos...' : 'Verificando atualizações...'}
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const gateStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
  },
  dot: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#7C3AED' },
  text: { color: '#C4B5FD', fontSize: 14, fontWeight: '500' },
});

function UpdateBanner() {
  const { isUpdateAvailable, isUpdatePending, isDownloading } = Updates.useUpdates();
  const appliedRef = React.useRef(false);

  useEffect(() => {
    if (isUpdateAvailable && !isDownloading) {
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [isUpdateAvailable, isDownloading]);

  /*
   * Aplica a atualização sozinho — MAS NUNCA com a escuta contínua ligada.
   *
   * Duas lições aprendidas na prática, as duas visíveis no logcat:
   *   1. O reload recriava este componente, `isUpdatePending` continuava true e
   *      ele recarregava de novo — um laço de reinícios ("Running main" repetido).
   *   2. Cada reload derruba o foreground service e o reconhecedor de wake word.
   *      Pior: se o serviço voltar a subir com o app em background, o Android
   *      NEGA acesso ao microfone ("Foreground service started from background
   *      can not have microphone access"). Ou seja, o auto-reload quebrava
   *      exatamente a função principal do app.
   * Com a escuta ligada, só mostramos o banner e quem decide reiniciar é o usuário.
   */
  const autoListen = useSettingsStore((s) => s.settings.autoListen);

  useEffect(() => {
    if (!isUpdatePending || appliedRef.current) return;
    if (Platform.OS !== 'web' && autoListen) return;
    appliedRef.current = true;
    const t = setTimeout(() => {
      void reloadApp();
    }, 1200);
    return () => clearTimeout(t);
  }, [isUpdatePending, autoListen]);

  const restart = useCallback(() => {
    void reloadApp();
  }, []);

  if (!isDownloading && !isUpdatePending) return null;

  return (
    <View style={updateStyles.bar}>
      {isDownloading ? (
        <View style={updateStyles.row}>
          <ActivityIndicator size="small" color="#a78bfa" style={{ marginRight: 8 }} />
          <Text style={updateStyles.text}>Baixando atualização...</Text>
        </View>
      ) : (
        <TouchableOpacity style={updateStyles.row} onPress={restart} activeOpacity={0.8}>
          <Text style={updateStyles.text}>✓ Atualização pronta — reiniciando...</Text>
          <View style={updateStyles.btn}>
            <Text style={updateStyles.btnText}>Reiniciar</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const updateStyles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: '#1e1040',
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { color: '#c4b5fd', fontSize: 13, flex: 1 },
  btn: { backgroundColor: '#7C3AED', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12, marginLeft: 12 },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default function RootLayout() {
  useMicWarmUp();
  useSwUpdateReload();
  useOAuthDeepLink();
  useOAuthTabResume();
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={rootStyle}>
          <StatusBar style="light" />
          <UpdateGate>
          <AuthGuard>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Colors.bg.primary },
              }}
            >
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="(modals)"
                options={{
                  headerShown: false,
                  presentation: Platform.OS === 'web' ? 'card' : 'modal',
                }}
              />
            </Stack>
          </AuthGuard>
          </UpdateGate>
          {Platform.OS !== 'web' && <UpdateBanner />}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
