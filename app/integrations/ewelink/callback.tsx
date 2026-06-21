import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/colors';
import { exchangeEwelinkCode } from '@/services/devices/ewelinkService';
import { useDeviceStore } from '@/stores/useDeviceStore';

export default function EwelinkCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; region?: string; state?: string }>();
  const { syncEwelinkDevices } = useDeviceStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Conectando sua conta eWeLink...');

  useEffect(() => {
    async function run() {
      if (!params.code || !params.region) {
        setStatus('error');
        setMessage('Código de autorização ausente.');
        return;
      }
      try {
        await exchangeEwelinkCode(params.code, params.region, params.state);
        await syncEwelinkDevices();
        setStatus('success');
        setMessage('Tomada conectada! Já pode pedir pro Argos controlar.');
        setTimeout(() => router.replace('/(tabs)/settings'), 1800);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Falha ao conectar eWeLink.');
      }
    }
    run();
  }, [params.code, params.region, params.state, syncEwelinkDevices]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {status === 'loading' && <ActivityIndicator size="large" color={Colors.accent.primary} />}
          <Text style={styles.icon}>{status === 'success' ? '✅' : status === 'error' ? '❌' : '🔌'}</Text>
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
