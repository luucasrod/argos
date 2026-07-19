/**
 * /integrations/amazon/callback — recebe o código OAuth da Amazon (LWA)
 * e troca-o por tokens que permitem ao Argos controlar dispositivos Alexa.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/colors';
import { exchangeAmazonCode } from '@/services/devices/amazonService';
import { useDeviceStore } from '@/stores/useDeviceStore';

export default function AmazonCallbackScreen() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const { syncAlexaDevices } = useDeviceStore();

  useEffect(() => {
    void (async () => {
      try {
        if (typeof window === 'undefined') {
          setStatus('error');
          setErrorMsg('Apenas disponível em ambiente web.');
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state'); // userId passado no authorize
        const error = params.get('error');

        if (error) {
          setStatus('error');
          setErrorMsg(`Amazon recusou: ${params.get('error_description') ?? error}`);
          return;
        }
        if (!code) {
          setStatus('error');
          setErrorMsg('Código de autorização não encontrado.');
          return;
        }

        await exchangeAmazonCode(code, state ?? '', 'na');
        await syncAlexaDevices();
        setStatus('success');

        // Redirecionar para settings após 1.5 s
        setTimeout(() => {
          window.location.replace('/settings');
        }, 1500);
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido');
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {status === 'loading' && (
            <>
              <ActivityIndicator size="large" color={Colors.accent.primary} />
              <Text style={styles.subtitle}>A conectar conta Amazon Alexa…</Text>
            </>
          )}
          {status === 'success' && (
            <>
              <Text style={styles.icon}>✓</Text>
              <Text style={styles.title}>Alexa conectada!</Text>
              <Text style={styles.subtitle}>Os teus dispositivos vão aparecer no Argos.</Text>
            </>
          )}
          {status === 'error' && (
            <>
              <Text style={[styles.icon, styles.iconError]}>✕</Text>
              <Text style={styles.title}>Algo correu mal</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  icon: { fontSize: 56, color: Colors.status.success },
  iconError: { color: Colors.status.error },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text.primary },
  subtitle: { fontSize: 15, color: Colors.text.secondary, textAlign: 'center' },
  errorText: { fontSize: 13, color: Colors.status.error, textAlign: 'center' },
});
