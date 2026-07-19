import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/colors';
import { exchangeHueCode } from '@/services/devices/hueService';
import { useDeviceStore } from '@/stores/useDeviceStore';

export default function HueCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const { syncHueLights } = useDeviceStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Conectando Philips Hue...');

  useEffect(() => {
    async function run() {
      if (params.error) {
        setStatus('error');
        setMessage(`Acesso negado: ${params.error}`);
        return;
      }
      if (!params.code) {
        setStatus('error');
        setMessage('Código de autorização ausente.');
        return;
      }
      try {
        await exchangeHueCode(params.code);
        await syncHueLights();
        setStatus('success');
        setMessage('Philips Hue conectado! Argos ja pode controlar suas lampadas.');
        setTimeout(() => router.replace('/(tabs)/settings'), 1800);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Falha ao conectar Philips Hue.');
      }
    }
    run();
  }, [params.code, params.error, syncHueLights]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {status === 'loading' && <ActivityIndicator size="large" color={Colors.accent.primary} />}
          <Text style={styles.icon}>
            {status === 'success' ? '💡' : status === 'error' ? '❌' : '🔆'}
          </Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  icon: { fontSize: 40 },
  message: { color: Colors.text.primary, fontSize: 16, textAlign: 'center' },
});
