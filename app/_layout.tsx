import '../global.css';
import 'react-native-reanimated';
import 'react-native-gesture-handler';
import { Stack, router, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import React, { useEffect } from 'react';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { isAuthRequired } from '@/services/auth/config';

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
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Argos — erro ao carregar</Text>
          <Text style={errorStyles.message}>{this.state.error.message}</Text>
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

export default function RootLayout() {
  useMicWarmUp();
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={rootStyle}>
          <StatusBar style="light" />
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
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
