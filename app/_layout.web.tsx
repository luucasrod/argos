import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { isAuthRequired } from '@/services/auth/config';

enableScreens(false);

/** Guard que redireciona para login se não autenticado (mesma lógica de _layout.tsx) */
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

export default function RootLayout() {
  useEffect(() => {
    document.documentElement.style.backgroundColor = Colors.bg.primary;
    document.body.style.backgroundColor = Colors.bg.primary;
  }, []);
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <AuthGuard>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.bg.primary },
            }}
          >
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthGuard>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    width: '100%',
  },
});
