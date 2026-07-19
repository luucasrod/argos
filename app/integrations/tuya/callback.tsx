import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/colors';
import { exchangeTuyaCode } from '@/services/devices/tuyaService';
import { useDeviceStore } from '@/stores/useDeviceStore';

export default function TuyaCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { syncTuyaDevices } = useDeviceStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Conectando Smart Life...');

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
        await exchangeTuyaCode(params.code);
        const result = await syncTuyaDevices();
        if (result.count === 0) {
          setStatus('success');
          setMessage('Smart Life conectado! Nenhuma lâmpada encontrada — verifique os dispositivos no app.');
        } else {
          setStatus('success');
          setMessage(`Smart Life conectado! ${result.count} dispositivo${result.count !== 1 ? 's' : ''} encontrado${result.count !== 1 ? 's' : ''}.`);
        }
        setTimeout(() => router.replace('/(tabs)/settings'), 2000);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Falha ao conectar Smart Life.');
      }
    }
    run();
  }, [params.code, params.error, syncTuyaDevices]);

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
