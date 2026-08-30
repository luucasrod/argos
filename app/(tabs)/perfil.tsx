import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useSettingsStore } from '@/stores/useSettingsStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAIStore } from '@/stores/useAIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { isTestMode } from '@/services/auth/config';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { AIPersonality } from '@/types/ai.types';
import { ANTHROPIC_MODELS } from '@/services/ai/config';
import { VOICE_SPEED_OPTIONS } from '@/constants/voice';
import { textToSpeech } from '@/services/voice/textToSpeech';
import { unlockSpeech } from '@/services/voice/speechUnlock';
import { VoiceInstallHelp } from '@/components/settings/VoiceInstallHelp';
import Constants from 'expo-constants';

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDesc}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function pillStyle(active: boolean) {
  return [styles.pill, active && styles.pillActive];
}
function pillTextStyle(active: boolean) {
  return [styles.pillText, active && styles.pillTextActive];
}

function accountStatusLabel(provider?: string): string {
  if (provider === 'google') return '✓ Conectado com Google';
  if (provider === 'email') return '✓ Conectado com e-mail';
  return '✓ Sessão ativa';
}

export default function PerfilScreen() {
  const { settings, updateSettings, updatePersonality, updateUserProfile } = useSettingsStore();
  const { memories, insights } = useMemoryStore();
  const { clearMessages } = useAIStore();
  const { user, signOut, loading: authLoading } = useAuthStore();
  const { light, medium } = useHaptic();

  const toneOptions: AIPersonality['tone'][] = ['formal', 'casual', 'direct', 'friendly', 'playful'];
  const proactivityOptions: AIPersonality['proactivity'][] = ['low', 'medium', 'high'];

  const previewVoice = () => {
    medium();
    unlockSpeech();
    void textToSpeech('Olá, eu sou o Argos, seu assistente pessoal.', settings.personality);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Perfil</Text>
          <Text style={styles.subtitle}>Configurações do Argos</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* ── Conta ── */}
          <SectionLabel title="🔑 Conta" />
          <GlassCard style={styles.card}>
            {user && (user.email || isTestMode()) ? (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{user.name ?? user.email ?? 'Sessão de teste'}</Text>
                  <Text style={styles.rowDesc}>{user.email ?? 'Sem e-mail (modo teste)'}</Text>
                  {isTestMode() ? (
                    <Text style={styles.accountTest}>⚡ Modo teste — login desativado</Text>
                  ) : (
                    <Text style={styles.accountOk}>{accountStatusLabel(user.provider)}</Text>
                  )}
                </View>
                {!isTestMode() ? (
                  <Pressable
                    style={styles.signOutBtn}
                    onPress={async () => { medium(); await signOut(); }}
                    disabled={authLoading}
                  >
                    <Text style={styles.signOutText}>{authLoading ? '...' : 'Sair'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.guestArea}>
                <Text style={styles.rowLabel}>Não conectado</Text>
                <Text style={styles.rowDesc}>Faça login com e-mail ou Google para conversar com o Argos.</Text>
                <Pressable
                  style={styles.loginBtn}
                  onPress={async () => {
                    medium();
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.location.assign('/login');
                    } else {
                      const { router: r } = await import('expo-router');
                      r.replace('/login');
                    }
                  }}
                >
                  <Text style={styles.loginBtnText}>Ir para login</Text>
                </Pressable>
              </View>
            )}
          </GlassCard>

          {/* ── Perfil do usuário ── */}
          <SectionLabel title="👤 Perfil do usuário" />
          <GlassCard style={styles.card}>
            <Row label="Seu nome" description="Argos vai te chamar por este nome">
              <TextInput
                style={styles.textInput}
                value={settings.userProfile?.name ?? ''}
                onChangeText={(v) => updateUserProfile({ name: v })}
                placeholder="Ex: João"
                placeholderTextColor={Colors.text.muted}
              />
            </Row>
            <View style={styles.divider} />
            <Row label="Sua cidade" description="Usada para clima e localização">
              <TextInput
                style={styles.textInput}
                value={settings.userProfile?.city ?? ''}
                onChangeText={(v) => updateUserProfile({ city: v })}
                placeholder="Ex: São Paulo"
                placeholderTextColor={Colors.text.muted}
              />
            </Row>
            <View style={styles.divider} />
            <Row label="Profissão" description="Contexto para sugestões personalizadas">
              <TextInput
                style={styles.textInput}
                value={settings.userProfile?.profession ?? ''}
                onChangeText={(v) => updateUserProfile({ profession: v })}
                placeholder="Ex: Desenvolvedor"
                placeholderTextColor={Colors.text.muted}
              />
            </Row>
          </GlassCard>

          {/* ── Integrações ── */}
          <SectionLabel title="🔌 Dispositivos" />
          <GlassCard style={styles.card}>
            <Pressable
              style={styles.row}
              onPress={() => { light(); router.push('/integracoes'); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Gerenciar integrações</Text>
                <Text style={styles.rowDesc}>eWeLink, Smart Life, Philips WiZ, Tapo, Xiaomi, Alexa, Home Assistant</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </GlassCard>

          {/* ── Autonomia ── */}
          <SectionLabel title="🎛 Autonomia" />
          <GlassCard style={styles.card}>
            <Row
              label="Nível de autonomia"
              description={settings.autonomyLevel === 'autonomous'
                ? 'Autônomo: executa ações sem confirmação'
                : 'Assistido: pede confirmação antes de agir'}
            >
              <View style={styles.optionRow}>
                {([
                  { id: 'autonomous', label: '⚡ Autônomo' },
                  { id: 'assisted', label: '🛡 Assistido' },
                ] as const).map(({ id, label }) => (
                  <Pressable key={id} onPress={() => { light(); updateSettings({ autonomyLevel: id }); }} style={pillStyle(settings.autonomyLevel === id)}>
                    <Text style={pillTextStyle(settings.autonomyLevel === id)}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>
          </GlassCard>

          {/* ── Assistente ── */}
          <SectionLabel title="🤖 Assistente" />
          <GlassCard style={styles.card}>
            <Row label="Nome da assistente">
              <TextInput
                style={styles.textInput}
                value={settings.personality.name}
                onChangeText={(v) => updatePersonality({ name: v })}
                placeholder="Argos"
                placeholderTextColor={Colors.text.muted}
              />
            </Row>
            <View style={styles.divider} />
            <Row label="Tom da conversa" description="Estilo do texto — não altera o timbre da voz">
              <View style={styles.optionRow}>
                {toneOptions.map((tone) => (
                  <Pressable key={tone} onPress={() => { light(); updatePersonality({ tone }); }} style={pillStyle(settings.personality.tone === tone)}>
                    <Text style={pillTextStyle(settings.personality.tone === tone)}>{tone}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>
            <View style={styles.divider} />
            <Row label="Proatividade" description="Com que frequência o Argos sugere ações">
              <View style={styles.optionRow}>
                {proactivityOptions.map((opt) => (
                  <Pressable key={opt} onPress={() => { light(); updatePersonality({ proactivity: opt }); }} style={pillStyle(settings.personality.proactivity === opt)}>
                    <Text style={pillTextStyle(settings.personality.proactivity === opt)}>{opt}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>
          </GlassCard>

          {/* ── Voz ── */}
          <SectionLabel title="🎙 Voz" />
          <GlassCard style={styles.card}>
            <Row label="Resposta por voz" description="Argos fala as respostas em voz alta">
              <Switch
                value={settings.autoListen}
                onValueChange={(v) => { light(); updateSettings({ autoListen: v }); }}
                trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                thumbColor="#fff"
              />
            </Row>
            <View style={styles.divider} />
            <Row label="Palavra de ativação" description="O que você fala pra chamar o Argos">
              <TextInput
                style={styles.textInput}
                value={settings.wakeWord}
                onChangeText={(v) => updateSettings({ wakeWord: v })}
                placeholder="Ex: Ei Argos"
                placeholderTextColor={Colors.text.muted}
              />
            </Row>
            <View style={styles.divider} />
            <Row label="Velocidade da voz" description="Ritmo da fala em voz alta">
              <View style={styles.optionRow}>
                {VOICE_SPEED_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      light();
                      updatePersonality({ voiceSpeed: opt.value });
                      unlockSpeech();
                      void textToSpeech('Velocidade da voz atualizada.', { ...settings.personality, voiceSpeed: opt.value });
                    }}
                    style={pillStyle(Math.abs(settings.personality.voiceSpeed - opt.value) < 0.01)}
                  >
                    <Text style={pillTextStyle(Math.abs(settings.personality.voiceSpeed - opt.value) < 0.01)}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>
            <View style={styles.divider} />
            <Row label="Gênero da voz" description="Voz masculina ou feminina do sistema">
              <View style={styles.optionRow}>
                {(['female', 'male'] as const).map((gender) => (
                  <Pressable
                    key={gender}
                    onPress={() => {
                      light();
                      updatePersonality({ voiceGender: gender });
                      unlockSpeech();
                      void textToSpeech(
                        gender === 'female' ? 'Voz feminina selecionada.' : 'Voz masculina selecionada.',
                        { ...settings.personality, voiceGender: gender }
                      );
                    }}
                    style={pillStyle(settings.personality.voiceGender === gender)}
                  >
                    <Text style={pillTextStyle(settings.personality.voiceGender === gender)}>
                      {gender === 'female' ? '👩 Feminino' : '👨 Masculino'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Row>
            <VoiceInstallHelp voiceGender={settings.personality.voiceGender} />
            <View style={styles.divider} />
            <Pressable style={styles.voicePreviewBtn} onPress={previewVoice}>
              <Text style={styles.voicePreviewText}>🔊 Testar voz</Text>
            </Pressable>
            <View style={styles.divider} />
            <Row label="Idioma">
              <View style={styles.optionRow}>
                {(['pt-BR', 'en-US'] as const).map((lang) => (
                  <Pressable key={lang} onPress={() => { light(); updatePersonality({ language: lang }); }} style={pillStyle(settings.personality.language === lang)}>
                    <Text style={pillTextStyle(settings.personality.language === lang)}>
                      {lang === 'pt-BR' ? '🇧🇷 PT' : '🇺🇸 EN'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Row>
          </GlassCard>

          {/* ── IA ── */}
          <SectionLabel title="🧠 Inteligência Artificial" />
          <GlassCard style={styles.card}>
            <Row label="Modelo" description="Sonnet é mais inteligente; Haiku responde mais rápido">
              <View style={styles.optionRow}>
                {([
                  { id: ANTHROPIC_MODELS.haiku, label: '⚡ Haiku' },
                  { id: ANTHROPIC_MODELS.sonnet, label: '🧠 Sonnet' },
                ] as const).map(({ id, label }) => (
                  <Pressable key={id} onPress={() => { light(); updateSettings({ model: id }); }} style={pillStyle(settings.model === id)}>
                    <Text style={pillTextStyle(settings.model === id)}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>
            <View style={styles.divider} />
            <Row label="Memória ativa" description="A IA aprende seus hábitos e preferências">
              <Switch
                value={settings.memoryEnabled}
                onValueChange={(v) => { light(); updateSettings({ memoryEnabled: v }); }}
                trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                thumbColor="#fff"
              />
            </Row>
          </GlassCard>

          {/* ── Privacidade ── */}
          <SectionLabel title="🔒 Privacidade" />
          <GlassCard style={styles.card}>
            <Row label="Salvar histórico de conversas">
              <Switch
                value={settings.saveHistory}
                onValueChange={(v) => { light(); updateSettings({ saveHistory: v }); }}
                trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                thumbColor="#fff"
              />
            </Row>
            <View style={styles.divider} />
            <Row label="Feedback tátil (haptic)">
              <Switch
                value={settings.hapticFeedback}
                onValueChange={(v) => { light(); updateSettings({ hapticFeedback: v }); }}
                trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                thumbColor="#fff"
              />
            </Row>
          </GlassCard>

          {/* ── Dados ── */}
          <SectionLabel title="📊 Dados" />
          <GlassCard style={styles.card}>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{memories.length}</Text>
                <Text style={styles.statLabel}>Memórias</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{insights.length}</Text>
                <Text style={styles.statLabel}>Insights</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Pressable onPress={() => { medium(); clearMessages(); }} style={styles.dangerBtn}>
              <Text style={styles.dangerText}>🗑 Limpar histórico de conversas</Text>
            </Pressable>
          </GlassCard>

          <Text style={styles.buildLabel}>
            Argos · atualizado {Constants.expoConfig?.extra?.buildTime ?? '—'}
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 3 },
  scroll: { paddingHorizontal: 16, paddingBottom: 110, gap: 4 },

  sectionLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginTop: 20,
    marginBottom: 8,
  },
  card: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLabel: { color: Colors.text.primary, fontSize: 15, fontWeight: '500' },
  rowDesc: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.glass.border, marginHorizontal: 16 },
  chevron: { color: Colors.text.muted, fontSize: 22, fontWeight: '300' },

  textInput: {
    color: Colors.text.primary,
    fontSize: 15,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flex: 1 },
  pill: {
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillActive: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  pillText: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },
  pillTextActive: { color: '#fff', fontWeight: '600' },

  accountOk: { color: Colors.status.success, fontSize: 12, marginTop: 6, fontWeight: '500' },
  accountTest: { color: '#A78BFA', fontSize: 12, marginTop: 6, fontWeight: '500' },
  guestArea: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  loginBtn: { backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  signOutBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  signOutText: { color: Colors.status.error, fontWeight: '600', fontSize: 14 },

  voicePreviewBtn: {
    marginHorizontal: 16,
    marginVertical: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
    alignItems: 'center',
  },
  voicePreviewText: { color: '#C4B5FD', fontWeight: '700', fontSize: 15 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 20 },
  statBox: { alignItems: 'center' },
  statValue: { color: Colors.accent.primary, fontSize: 24, fontWeight: '800' },
  statLabel: { color: Colors.text.muted, fontSize: 12, marginTop: 4 },
  dangerBtn: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: Colors.status.error, fontSize: 14, fontWeight: '500' },
  buildLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.5,
    marginTop: 24,
  },
});
