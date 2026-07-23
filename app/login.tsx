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
import Svg, { Path, G, ClipPath, Defs, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/useAuthStore';
import { Colors } from '@/constants/colors';

const SUPABASE_PROVIDERS_URL =
  'https://supabase.com/dashboard/project/qzoknfwfvdqcnbsirwlf/auth/providers';

/** "DD/MM/AAAA" digitado pelo usuário → "AAAA-MM-DD" para o banco. */
function birthdateToIso(input: string): string | null {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function formatBirthdateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join('/');
}

export default function LoginScreen() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithPassword,
    signInWithPassword,
    loading,
    authError,
    authMessage,
    clearAuthFeedback,
  } = useAuthStore();

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');

  // Criar conta
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [birthdateInput, setBirthdateInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Entrar
  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');

  // Magic link
  const [magicEmail, setMagicEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location) return;

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDesc =
      params.get('error_description') ??
      hashParams.get('error_description') ??
      params.get('error') ??
      hashParams.get('error');

    if (errorDesc?.includes('not enabled') || errorDesc?.includes('Unsupported provider')) {
      useAuthStore.setState({
        authError: 'O Google ainda não está ativado no Supabase. Use o cadastro abaixo.',
      });
      window.history.replaceState({}, '', '/login');
      return;
    }

    const hasAuthCallback =
      hashParams.has('access_token') || hashParams.has('code') || params.has('code');

    if (hasAuthCallback) {
      useAuthStore.setState({ loading: true, authMessage: 'Entrando…' });
      // Timeout de segurança: se o exchange falhar silenciosamente, o Supabase
      // não dispara SIGNED_IN e o loading ficaria preso para sempre.
      setTimeout(() => {
        if (useAuthStore.getState().loading) {
          useAuthStore.setState({ loading: false, authMessage: null });
        }
      }, 15_000);
    }
  }, []);

  const handleSignup = () => {
    if (password !== confirmPassword) {
      useAuthStore.setState({ authError: 'As senhas não coincidem.' });
      return;
    }
    const iso = birthdateToIso(birthdateInput);
    if (!iso) {
      useAuthStore.setState({ authError: 'Digite a data de nascimento no formato DD/MM/AAAA.' });
      return;
    }
    void signUpWithPassword(name, signupEmail, iso, password);
  };

  const handleSignin = () => {
    void signInWithPassword(signinEmail, signinPassword);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0612', '#0D0A1E', '#0A0612']} style={StyleSheet.absoluteFill} />
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

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tabBtn, mode === 'signup' && styles.tabBtnActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
                Criar conta
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, mode === 'signin' && styles.tabBtnActive]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
                Entrar
              </Text>
            </Pressable>
          </View>

          {mode === 'signup' ? (
            <View style={styles.formBox}>
              <TextInput
                style={styles.input}
                placeholder="Seu nome"
                placeholderTextColor={Colors.text.muted}
                value={name}
                onChangeText={setName}
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                placeholderTextColor={Colors.text.muted}
                value={signupEmail}
                onChangeText={setSignupEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="Data de nascimento (DD/MM/AAAA)"
                placeholderTextColor={Colors.text.muted}
                value={birthdateInput}
                onChangeText={(v) => setBirthdateInput(formatBirthdateInput(v))}
                keyboardType="number-pad"
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor={Colors.text.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirmar senha"
                placeholderTextColor={Colors.text.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!loading}
              />
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
                onPress={handleSignup}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Criar conta e entrar</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.formBox}>
              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                placeholderTextColor={Colors.text.muted}
                value={signinEmail}
                onChangeText={setSigninEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor={Colors.text.muted}
                value={signinPassword}
                onChangeText={setSigninPassword}
                secureTextEntry
                editable={!loading}
              />
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
                onPress={handleSignin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Entrar</Text>}
              </Pressable>
            </View>
          )}

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
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <View style={styles.googleIconBox}>
                  <Svg width={20} height={20} viewBox="0 0 48 48">
                    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </Svg>
                </View>
                <Text style={styles.googleText}>Entrar com Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.emailBox}>
            <Text style={styles.emailLabel}>Ou receba um link sem senha</Text>
            <TextInput
              style={styles.input}
              placeholder="seu@email.com"
              placeholderTextColor={Colors.text.muted}
              value={magicEmail}
              onChangeText={setMagicEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
              onPress={() => void signInWithEmail(magicEmail)}
              disabled={loading}
            >
              <Text style={styles.secondaryBtnText}>Enviar link de acesso</Text>
            </Pressable>
          </View>

          <View style={styles.helpBox}>
            <Text style={styles.helpTitle}>Google não funciona?</Text>
            <Text style={styles.helpText}>
              Esse erro significa que o provedor Google ainda não foi ativado no painel do
              Supabase. Ative em Authentication → Providers → Google, ou crie sua conta com senha
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
  container: { flex: 1, backgroundColor: '#0A0612', overflow: 'hidden' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  orbGlow: {
    position: 'absolute',
    width: '80%',
    maxWidth: 400,
    aspectRatio: 1,
    borderRadius: 9999,
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
  orbSmall: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#7C3AED' },
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

  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#7C3AED' },
  tabText: { color: Colors.text.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  formBox: { gap: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.text.primary,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: Colors.text.primary, fontWeight: '600', fontSize: 14 },

  emailBox: { gap: 10 },
  emailLabel: { color: Colors.text.muted, fontSize: 13, fontWeight: '600' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: Colors.text.muted, fontSize: 13 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    minHeight: 52,
  },
  googleIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  btnPressed: { opacity: 0.85 },
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
