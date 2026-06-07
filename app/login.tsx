import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/useAuthStore';
import { Colors } from '@/constants/colors';

export default function LoginScreen() {
  const { signInWithGoogle, loading } = useAuthStore();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0612', '#0D0A1E', '#0A0612']}
        style={StyleSheet.absoluteFill}
      />

      {/* Orb decorativo */}
      <View style={styles.orbGlow} />

      <View style={styles.content}>
        {/* Logo / título */}
        <View style={styles.logoArea}>
          <View style={styles.orbSmall} />
          <Text style={styles.title}>Argos</Text>
          <Text style={styles.subtitle}>Seu assistente de IA pessoal</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: '🧠', text: 'Memória que aprende com você' },
            { icon: '🎙', text: 'Voz e wake word "Argos"' },
            { icon: '🌐', text: 'Abre apps, verifica clima' },
            { icon: '🔒', text: 'Seus dados são só seus' },
          ].map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Botão Google */}
        <Pressable
          style={({ pressed }) => [styles.googleBtn, pressed && styles.googleBtnPressed]}
          onPress={signInWithGoogle}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleText}>Entrar com Google</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.terms}>
          Ao entrar, você concorda com o uso do Argos como assistente pessoal.{'\n'}
          Seus dados ficam protegidos e isolados por conta.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0612', justifyContent: 'center', alignItems: 'center' },

  orbGlow: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    top: '10%',
    alignSelf: 'center',
  },

  content: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 32,
  },

  logoArea: { alignItems: 'center', gap: 12 },
  orbSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#C4B5FD',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.muted,
    textAlign: 'center',
  },

  features: { gap: 14, width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  featureText: { color: Colors.text.secondary, fontSize: 15 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  googleBtnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  googleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'serif',
  },
  googleText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  terms: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
