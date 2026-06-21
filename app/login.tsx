import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/useAuthStore';
import { Colors } from '@/constants/colors';

const SUPABASE_PROVIDERS_URL =
  'https://supabase.com/dashboard/project/qzoknfwfvdqcnbsirwlf/auth/providers';

export default function LoginScreen() {
  const { signInWithGoogle, signInWithEmail, loading, authError, authMessage, clearAuthFeedback } =
    useAuthStore();
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDesc =
      params.get('error_description') ??
      hashParams.get('error_description') ??
      params.get('error') ??
      hashParams.get('error');

    if (errorDesc?.includes('not enabled') || errorDesc?.includes('Unsupported provider')) {
      useAuthStore.setState({
        authError:
          'O Google ainda não está ativado no Supabase. Use o login por e-mail abaixo.',
      });
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0612', '#0D0A1E', '#0A0612']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orbGlow} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.logoArea}>
            <View style={styles.orbSmall} />
            <Text style={styles.title}>Argos</Text>
            <Text style={styles.subtitle}>Seu assistente de IA pessoal</Text>
          </View>

          {authError ? (
            <View style={styles.feedbackError}>
              <Text style={styles.feedbackErrorText}>{authError}</Text>
              <Pressable onPress={clearAuthFeedback}>
                <Text style={styles.feedbackDismiss}>Fechar</Text>
              </Pressable>
            </View>
          ) : null}

          {authMessage ? (
            <View style={styles.feedbackOk}>
              <Text style={styles.feedbackOkText}>{authMessage}</Text>
            </View>
          ) : null}

          {/* Login por e-mail — funciona sem configurar Google */}
          <View style={styles.emailBox}>
            <Text style={styles.emailLabel}>Entrar com e-mail</Text>
            <TextInput
              style={styles.emailInput}
              placeholder="seu@email.com"
              placeholderTextColor={Colors.text.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Pressable
              style={({ pressed }) => [styles.emailBtn, pressed && styles.btnPressed]}
              onPress={() => void signInWithEmail(email)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.emailBtnText}>Enviar link de acesso</Text>
              )}
            </Pressable>
            <Text style={styles.emailHint}>
              Você recebe um link no e-mail. Toque nele para entrar — sem senha.
            </Text>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [styles.googleBtn, pressed && styles.btnPressed]}
            onPress={() => void signInWithGoogle()}
            disabled={loading}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleText}>Entrar com Google</Text>
          </Pressable>

          <View style={styles.helpBox}>
            <Text style={styles.helpTitle}>Google não funciona?</Text>
            <Text style={styles.helpText}>
              Esse erro significa que o provedor Google ainda não foi ativado no painel do
              Supabase. Ative em Authentication → Providers → Google, ou use o login por e-mail
              acima.
            </Text>
            <Pressable onPress={() => Linking.openURL(SUPABASE_PROVIDERS_URL)}>
              <Text style={styles.helpLink}>Abrir configuração do Supabase →</Text>
            </Pressable>
          </View>

          <Text style={styles.terms}>
            Ao entrar, você concorda com o uso do Argos como assistente pessoal.{'\n'}
            Seus dados ficam protegidos e isolados por conta.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0612' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  orbGlow: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    top: '8%',
    alignSelf: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 32,
    alignSelf: 'center',
    gap: 20,
  },
  logoArea: { alignItems: 'center', gap: 12, marginBottom: 8 },
  orbSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7C3AED',
  },
  title: { fontSize: 40, fontWeight: '800', color: '#C4B5FD', letterSpacing: 2 },
  subtitle: { fontSize: 16, color: Colors.text.muted, textAlign: 'center' },

  feedbackError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  feedbackErrorText: { color: '#FCA5A5', fontSize: 14, lineHeight: 20 },
  feedbackDismiss: { color: Colors.text.muted, fontSize: 12 },
  feedbackOk: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: 12,
    padding: 14,
  },
  feedbackOkText: { color: '#86EFAC', fontSize: 14, lineHeight: 20 },

  emailBox: { gap: 10 },
  emailLabel: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  emailInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.text.primary,
    fontSize: 16,
  },
  emailBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emailBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  emailHint: { color: Colors.text.muted, fontSize: 12, lineHeight: 16 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: Colors.text.muted, fontSize: 13 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  btnPressed: { opacity: 0.85 },
  googleIcon: { fontSize: 18, fontWeight: '800', color: '#fff', fontFamily: 'serif' },
  googleText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  helpBox: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  helpTitle: { color: '#C4B5FD', fontSize: 13, fontWeight: '700' },
  helpText: { color: Colors.text.muted, fontSize: 12, lineHeight: 18 },
  helpLink: { color: '#A78BFA', fontSize: 12, fontWeight: '600', marginTop: 4 },

  terms: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
});
