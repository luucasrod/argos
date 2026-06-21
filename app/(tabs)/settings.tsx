import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Switch, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useSettingsStore } from '@/stores/useSettingsStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAIStore } from '@/stores/useAIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { isTestMode } from '@/services/auth/config';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { AIPersonality } from '@/types/ai.types';
import { ANTHROPIC_MODELS } from '@/services/ai/config';
import { getEwelinkAuthorizeUrl, loginEwelinkWithPassword } from '@/services/devices/ewelinkService';
import { VOICE_SPEED_OPTIONS, VOICE_PREVIEW_PHRASE } from '@/constants/voice';
import { textToSpeech } from '@/services/voice/textToSpeech';
import { unlockSpeech } from '@/services/voice/speechUnlock';
import { VoiceInstallHelp } from '@/components/settings/VoiceInstallHelp';

function SettingRow({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? <Text style={styles.settingDesc}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function optionPillStyle(active: boolean) {
  return StyleSheet.flatten([styles.optionPill, active ? styles.optionPillActive : {}]);
}

function optionTextStyle(active: boolean) {
  return StyleSheet.flatten([styles.optionText, active ? styles.optionTextActive : {}]);
}

export default function SettingsScreen() {
  const { settings, updateSettings, updatePersonality, updateUserProfile } = useSettingsStore();
  const { memories, insights } = useMemoryStore();
  const { clearMessages } = useAIStore();
  const { user, signOut, loading: authLoading } = useAuthStore();
  const { devices, ewelinkConnected, syncEwelinkDevices } = useDeviceStore();
  const { light, medium } = useHaptic();
  const [connectingEwelink, setConnectingEwelink] = React.useState(false);
  const [showEwelinkForm, setShowEwelinkForm] = React.useState(false);
  const [ewelinkEmail, setEwelinkEmail] = React.useState('');
  const [ewelinkPassword, setEwelinkPassword] = React.useState('');
  const [ewelinkError, setEwelinkError] = React.useState<string | null>(null);

  const ewelinkDeviceCount = devices.filter((d) => d.source === 'ewelink').length;

  const handleConnectEwelink = async () => {
    medium();
    setConnectingEwelink(true);
    try {
      const url = await getEwelinkAuthorizeUrl();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(url);
      }
    } catch {
      setConnectingEwelink(false);
    }
  };

  const handleEwelinkPasswordLogin = async () => {
    medium();
    setEwelinkError(null);
    setConnectingEwelink(true);
    try {
      await loginEwelinkWithPassword(ewelinkEmail.trim(), ewelinkPassword, '+351');
      setEwelinkPassword('');
      setShowEwelinkForm(false);
      await syncEwelinkDevices();
    } catch (err) {
      setEwelinkError(err instanceof Error ? err.message : 'Falha ao conectar.');
    } finally {
      setConnectingEwelink(false);
    }
  };

  const toneOptions: AIPersonality['tone'][] = ['formal', 'casual', 'direct', 'friendly', 'playful'];
  const proactivityOptions: AIPersonality['proactivity'][] = ['low', 'medium', 'high'];

  const previewVoice = () => {
    medium();
    unlockSpeech();
    void textToSpeech(VOICE_PREVIEW_PHRASE, settings.personality);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
            <Text style={styles.title}>Configurações</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120)}>
            <SectionHeader title="🔑 Conta" />
            <GlassCard style={styles.section}>
              {user && (user.email || isTestMode()) ? (
                <View style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>{user.name ?? user.email ?? 'Sessão de teste'}</Text>
                    <Text style={styles.settingDesc}>{user.email ?? 'Sem e-mail (modo teste)'}</Text>
                    {isTestMode() ? (
                      <Text style={styles.accountTest}>⚡ Modo teste — login desativado</Text>
                    ) : (
                      <Text style={styles.accountOk}>✓ Conectado com Google</Text>
                    )}
                  </View>
                  {!isTestMode() ? (
                    <Pressable
                      style={styles.signOutBtn}
                      onPress={async () => {
                        medium();
                        await signOut();
                      }}
                      disabled={authLoading}
                    >
                      <Text style={styles.signOutText}>{authLoading ? '...' : 'Sair'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.accountGuest}>
                  <Text style={styles.settingLabel}>Não conectado</Text>
                  <Text style={styles.settingDesc}>
                    Faça login com e-mail ou Google para conversar com o Argos.
                  </Text>
                  <Pressable
                    style={styles.googleLoginBtn}
                    onPress={async () => {
                      medium();
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.location.assign('/login');
                      } else {
                        const { router } = await import('expo-router');
                        router.replace('/login');
                      }
                    }}
                  >
                    <Text style={styles.googleLoginText}>Ir para login</Text>
                  </Pressable>
                </View>
              )}
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(130)}>
            <SectionHeader title="👤 Perfil" />
            <GlassCard style={styles.section}>
              <SettingRow label="Seu nome" description="Argos vai te chamar por este nome">
                <TextInput
                  style={styles.nameInput}
                  value={settings.userProfile?.name ?? ''}
                  onChangeText={(v) => updateUserProfile({ name: v })}
                  placeholder="Ex: João"
                  placeholderTextColor={Colors.text.muted}
                />
              </SettingRow>
              <View style={styles.divider} />
              <SettingRow label="Sua cidade" description="Usada para clima e localização">
                <TextInput
                  style={styles.nameInput}
                  value={settings.userProfile?.city ?? ''}
                  onChangeText={(v) => updateUserProfile({ city: v })}
                  placeholder="Ex: São Paulo"
                  placeholderTextColor={Colors.text.muted}
                />
              </SettingRow>
              <View style={styles.divider} />
              <SettingRow label="Profissão" description="Contexto para sugestões personalizadas">
                <TextInput
                  style={styles.nameInput}
                  value={settings.userProfile?.profession ?? ''}
                  onChangeText={(v) => updateUserProfile({ profession: v })}
                  placeholder="Ex: Desenvolvedor"
                  placeholderTextColor={Colors.text.muted}
                />
              </SettingRow>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(135)}>
            <SectionHeader title="🔌 Dispositivos" />
            <GlassCard style={styles.section}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>eWeLink (tomadas inteligentes)</Text>
                  <Text style={styles.settingDesc}>
                    {ewelinkConnected
                      ? `Conectado · ${ewelinkDeviceCount} dispositivo${ewelinkDeviceCount !== 1 ? 's' : ''}`
                      : 'Conecte sua conta para controlar tomadas por voz'}
                  </Text>
                </View>
                <Pressable
                  style={styles.connectBtn}
                  onPress={ewelinkConnected ? () => syncEwelinkDevices() : handleConnectEwelink}
                  disabled={connectingEwelink}
                >
                  <Text style={styles.connectText}>
                    {connectingEwelink ? '...' : ewelinkConnected ? 'Atualizar' : 'Conectar'}
                  </Text>
                </Pressable>
              </View>

              {!ewelinkConnected && (
                <>
                  <View style={styles.divider} />
                  <Pressable
                    style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                    onPress={() => { light(); setShowEwelinkForm((v) => !v); }}
                  >
                    <Text style={styles.linkText}>
                      {showEwelinkForm ? 'Cancelar' : 'Problemas para conectar? Entrar com e-mail e senha'}
                    </Text>
                  </Pressable>

                  {showEwelinkForm && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
                      <TextInput
                        style={styles.nameInput}
                        value={ewelinkEmail}
                        onChangeText={setEwelinkEmail}
                        placeholder="E-mail do eWeLink"
                        placeholderTextColor={Colors.text.muted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                      <TextInput
                        style={styles.nameInput}
                        value={ewelinkPassword}
                        onChangeText={setEwelinkPassword}
                        placeholder="Senha"
                        placeholderTextColor={Colors.text.muted}
                        secureTextEntry
                      />
                      {ewelinkError && <Text style={styles.errorText}>{ewelinkError}</Text>}
                      <Pressable
                        style={[styles.connectBtn, { alignItems: 'center' }]}
                        onPress={handleEwelinkPasswordLogin}
                        disabled={connectingEwelink || !ewelinkEmail || !ewelinkPassword}
                      >
                        <Text style={styles.connectText}>
                          {connectingEwelink ? 'Conectando...' : 'Entrar'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140)}>
            <SectionHeader title="🎛 Autonomia" />
            <GlassCard style={styles.section}>
              <SettingRow
                label="Nível de autonomia"
                description={
                  settings.autonomyLevel === 'autonomous'
                    ? 'Autônomo: executa ações sem confirmação'
                    : 'Assistido: pede confirmação antes de agir'
                }
              >
                <View style={styles.optionRow}>
                  {([
                    { id: 'autonomous', label: '⚡ Autônomo' },
                    { id: 'assisted', label: '🛡 Assistido' },
                  ] as const).map(({ id, label }) => (
                    <Pressable
                      key={id}
                      onPress={() => {
                        light();
                        updateSettings({ autonomyLevel: id });
                      }}
                      style={optionPillStyle(settings.autonomyLevel === id)}
                    >
                      <Text style={optionTextStyle(settings.autonomyLevel === id)}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150)}>
            <SectionHeader title="🤖 Assistente" />
            <GlassCard style={styles.section}>
              <SettingRow label="Nome da assistente">
                <TextInput
                  style={styles.nameInput}
                  value={settings.personality.name}
                  onChangeText={(v) => updatePersonality({ name: v })}
                  placeholder="Argos"
                  placeholderTextColor={Colors.text.muted}
                />
              </SettingRow>

              <View style={styles.divider} />

              <SettingRow
                label="Tom da conversa"
                description="Estilo do texto — não altera o timbre da voz"
              >
                <View style={styles.optionRow}>
                  {toneOptions.map((tone) => (
                    <Pressable
                      key={tone}
                      onPress={() => {
                        light();
                        updatePersonality({ tone });
                      }}
                      style={optionPillStyle(settings.personality.tone === tone)}
                    >
                      <Text style={optionTextStyle(settings.personality.tone === tone)}>{tone}</Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>

              <View style={styles.divider} />

              <SettingRow
                label="Proatividade"
                description="Com que frequência o Argos sugere ações"
              >
                <View style={styles.optionRow}>
                  {proactivityOptions.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        light();
                        updatePersonality({ proactivity: opt });
                      }}
                      style={optionPillStyle(settings.personality.proactivity === opt)}
                    >
                      <Text style={optionTextStyle(settings.personality.proactivity === opt)}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>

              <View style={styles.divider} />

              <SettingRow label="Velocidade da voz" description="Ritmo da fala em voz alta">
                <View style={styles.optionRow}>
                  {VOICE_SPEED_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        light();
                        updatePersonality({ voiceSpeed: opt.value });
                        unlockSpeech();
                        void textToSpeech('Velocidade da voz atualizada.', {
                          ...settings.personality,
                          voiceSpeed: opt.value,
                        });
                      }}
                      style={optionPillStyle(
                        Math.abs(settings.personality.voiceSpeed - opt.value) < 0.01
                      )}
                    >
                      <Text
                        style={optionTextStyle(
                          Math.abs(settings.personality.voiceSpeed - opt.value) < 0.01
                        )}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>

              <View style={styles.divider} />

              <SettingRow label="Gênero da voz" description="Escolhe voz masculina ou feminina do sistema">
                <View style={styles.optionRow}>
                  {(['female', 'male'] as const).map((gender) => (
                    <Pressable
                      key={gender}
                      onPress={() => {
                        light();
                        updatePersonality({ voiceGender: gender });
                        unlockSpeech();
                        void textToSpeech(
                          gender === 'female'
                            ? 'Voz feminina selecionada.'
                            : 'Voz masculina selecionada.',
                          { ...settings.personality, voiceGender: gender }
                        );
                      }}
                      style={optionPillStyle(settings.personality.voiceGender === gender)}
                    >
                      <Text style={optionTextStyle(settings.personality.voiceGender === gender)}>
                        {gender === 'female' ? '👩 Feminino' : '👨 Masculino'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>

              <VoiceInstallHelp voiceGender={settings.personality.voiceGender} />

              <View style={styles.divider} />

              <Pressable style={styles.previewVoiceBtn} onPress={previewVoice}>
                <Text style={styles.previewVoiceText}>🔊 Testar voz</Text>
              </Pressable>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200)}>
            <SectionHeader title="🧠 Inteligência Artificial" />
            <GlassCard style={styles.section}>
              <SettingRow
                label="Modelo"
                description="Sonnet é mais inteligente; Haiku responde mais rápido"
              >
                <View style={styles.optionRow}>
                  {(
                    [
                      { id: ANTHROPIC_MODELS.haiku, label: '⚡ Haiku' },
                      { id: ANTHROPIC_MODELS.sonnet, label: '🧠 Sonnet' },
                    ] as const
                  ).map(({ id, label }) => (
                    <Pressable
                      key={id}
                      onPress={() => {
                        light();
                        updateSettings({ model: id });
                      }}
                      style={optionPillStyle(settings.model === id)}
                    >
                      <Text style={optionTextStyle(settings.model === id)}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>

              <View style={styles.divider} />

              <SettingRow label="Memória ativa" description="A IA aprende seus hábitos e preferências">
                <Switch
                  value={settings.memoryEnabled}
                  onValueChange={(v) => {
                    light();
                    updateSettings({ memoryEnabled: v });
                  }}
                  trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                  thumbColor="#FFFFFF"
                />
              </SettingRow>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(250)}>
            <SectionHeader title="🎙 Voz" />
            <GlassCard style={styles.section}>
              <SettingRow label="Resposta por voz" description="Argos fala as respostas em voz alta">
                <Switch
                  value={settings.autoListen}
                  onValueChange={(v) => {
                    light();
                    updateSettings({ autoListen: v });
                  }}
                  trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                  thumbColor="#FFFFFF"
                />
              </SettingRow>
              <View style={styles.divider} />
              <SettingRow label="Idioma">
                <View style={styles.optionRow}>
                  {(['pt-BR', 'en-US'] as const).map((lang) => (
                    <Pressable
                      key={lang}
                      onPress={() => {
                        light();
                        updatePersonality({ language: lang });
                      }}
                      style={optionPillStyle(settings.personality.language === lang)}
                    >
                      <Text style={optionTextStyle(settings.personality.language === lang)}>
                        {lang === 'pt-BR' ? '🇧🇷 PT' : '🇺🇸 EN'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300)}>
            <SectionHeader title="🔒 Privacidade" />
            <GlassCard style={styles.section}>
              <SettingRow label="Salvar histórico de conversas">
                <Switch
                  value={settings.saveHistory}
                  onValueChange={(v) => {
                    light();
                    updateSettings({ saveHistory: v });
                  }}
                  trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                  thumbColor="#FFFFFF"
                />
              </SettingRow>
              <View style={styles.divider} />
              <SettingRow label="Feedback tátil (haptic)">
                <Switch
                  value={settings.hapticFeedback}
                  onValueChange={(v) => {
                    light();
                    updateSettings({ hapticFeedback: v });
                  }}
                  trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                  thumbColor="#FFFFFF"
                />
              </SettingRow>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(350)}>
            <SectionHeader title="📊 Dados" />
            <GlassCard style={styles.section}>
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
              <Pressable
                onPress={() => {
                  medium();
                  clearMessages();
                }}
                style={styles.dangerButton}
              >
                <Text style={styles.dangerText}>🗑 Limpar histórico de conversas</Text>
              </Pressable>
            </GlassCard>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  scroll: { paddingBottom: 60 },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { color: Colors.text.primary, fontSize: 28, fontWeight: '800' },
  sectionHeader: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 8,
  },
  section: { marginHorizontal: 24, padding: 0, overflow: 'hidden' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingLabel: { color: Colors.text.primary, fontSize: 15, fontWeight: '500' },
  settingDesc: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.glass.border, marginHorizontal: 16 },
  nameInput: {
    color: Colors.text.primary,
    fontSize: 15,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flex: 1 },
  optionPill: {
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionPillActive: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  optionText: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },
  optionTextActive: { color: '#FFFFFF', fontWeight: '600' },
  valueText: { color: Colors.accent.primary, fontSize: 15, fontWeight: '600' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 20 },
  statBox: { alignItems: 'center' },
  statValue: { color: Colors.accent.primary, fontSize: 24, fontWeight: '800' },
  statLabel: { color: Colors.text.muted, fontSize: 12, marginTop: 4 },
  dangerButton: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: Colors.status.error, fontSize: 14, fontWeight: '500' },
  signOutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  signOutText: { color: Colors.status.error, fontWeight: '600', fontSize: 14 },
  connectBtn: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectText: { color: '#A78BFA', fontWeight: '600', fontSize: 14 },
  linkText: { color: '#A78BFA', fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
  errorText: { color: Colors.status.error, fontSize: 12 },
  accountOk: { color: Colors.status.success, fontSize: 12, marginTop: 6, fontWeight: '500' },
  accountTest: { color: '#A78BFA', fontSize: 12, marginTop: 6, fontWeight: '500' },
  accountGuest: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  googleLoginBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  googleLoginText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  previewVoiceBtn: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
    alignItems: 'center',
  },
  previewVoiceText: { color: '#C4B5FD', fontWeight: '700', fontSize: 15 },
});
