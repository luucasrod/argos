import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Switch, TextInput, Platform, Linking } from 'react-native';
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
import { loginTuya, disconnectTuya, getTuyaAuthorizeUrl } from '@/services/devices/tuyaService';
import { getAmazonAuthorizeUrl, disconnectAmazon } from '@/services/devices/amazonService';
import { loginWiz, loginWizWithGoogle, disconnectWiz } from '@/services/devices/wizService';
import { pingBridge } from '@/services/devices/wizLocalBridgeService';
import { supabase } from '@/services/auth/supabase';
import { loginTapo, disconnectTapo } from '@/services/devices/tapoService';
import { loginXiaomi, disconnectXiaomi, XiaomiVerificationRequiredError } from '@/services/devices/xiaomiService';
import { loginChrome, disconnectChrome } from '@/services/devices/chromeService';
import { VOICE_SPEED_OPTIONS, VOICE_PREVIEW_PHRASE } from '@/constants/voice';
import { textToSpeech } from '@/services/voice/textToSpeech';
import { unlockSpeech } from '@/services/voice/speechUnlock';
import { VoiceInstallHelp } from '@/components/settings/VoiceInstallHelp';
import { generateHAKey, getHAKey, deleteHAKey } from '@/services/ha/haService';

function accountStatusLabel(provider?: string): string {
  if (provider === 'google') return '✓ Conectado com Google';
  if (provider === 'email') return '✓ Conectado com e-mail';
  return '✓ Sessão ativa';
}

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

function IntegrationCard({
  title,
  description,
  connected,
  expanded,
  onToggle,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  description: string;
  connected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <GlassCard style={styles.section}>
      <Pressable style={styles.integrationHeader} onPress={onToggle}>
        <View style={styles.integrationHeaderMain}>
          <Text style={styles.settingLabel}>{title}</Text>
          <Text style={styles.settingDesc} numberOfLines={connected ? 1 : 2}>
            {description}
          </Text>
        </View>
        {connected && onRefresh ? (
          <Pressable
            style={styles.iconBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onRefresh();
            }}
            disabled={refreshing}
          >
            <Text style={styles.iconBtnText}>{refreshing ? '...' : '↻'}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.integrationChevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? (
        <>
          <View style={styles.divider} />
          {children}
        </>
      ) : null}
    </GlassCard>
  );
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
  const {
    devices,
    ewelinkConnected,
    tuyaConnected,
    alexaConnected,
    wizConnected,
    tapoConnected,
    xiaomiConnected,
    chromeConnected,
    wizLocalConnected,
    wizLocalBridgeUrl: storedBridgeUrl,
    syncEwelinkDevices,
    syncTuyaDevices,
    syncAlexaDevices,
    syncWizDevices,
    syncTapoDevices,
    syncXiaomiDevices,
    syncChromeDevices,
    setWizLocalBridgeUrl,
    syncWizLocalDevices,
    clearWizLocalDevices,
  } = useDeviceStore();
  const { light, medium } = useHaptic();
  const [connectingEwelink, setConnectingEwelink] = React.useState(false);
  const [ewelinkEmail, setEwelinkEmail] = React.useState('');
  const [ewelinkPassword, setEwelinkPassword] = React.useState('');
  const [ewelinkError, setEwelinkError] = React.useState<string | null>(null);

  const [connectingTuya, setConnectingTuya] = React.useState(false);
  const [tuyaEmail, setTuyaEmail] = React.useState('');
  const [tuyaPassword, setTuyaPassword] = React.useState('');
  const [tuyaError, setTuyaError] = React.useState<string | null>(null);

  const [connectingWiz, setConnectingWiz] = React.useState(false);
  const [wizEmail, setWizEmail] = React.useState('');
  const [wizPassword, setWizPassword] = React.useState('');
  const [wizError, setWizError] = React.useState<string | null>(null);

  const [connectingTapo, setConnectingTapo] = React.useState(false);
  const [tapoEmail, setTapoEmail] = React.useState('');
  const [tapoPassword, setTapoPassword] = React.useState('');
  const [tapoError, setTapoError] = React.useState<string | null>(null);

  const [connectingXiaomi, setConnectingXiaomi] = React.useState(false);
  const [xiaomiEmail, setXiaomiEmail] = React.useState('');
  const [xiaomiPassword, setXiaomiPassword] = React.useState('');
  const [xiaomiError, setXiaomiError] = React.useState<string | null>(null);
  const [xiaomiVerificationUrl, setXiaomiVerificationUrl] = React.useState<string | null>(null);

  const [connectingChrome, setConnectingChrome] = React.useState(false);
  const [chromeError, setChromeError] = React.useState<string | null>(null);

  const [connectingAlexa, setConnectingAlexa] = React.useState(false);
  const [alexaError, setAlexaError] = React.useState<string | null>(null);

  const [haKey, setHaKey] = React.useState<string | null>(null);
  const [haKeyLoading, setHaKeyLoading] = React.useState(false);
  const [haKeyError, setHaKeyError] = React.useState<string | null>(null);
  const [haCopied, setHaCopied] = React.useState(false);
  const [haUrlCopied, setHaUrlCopied] = React.useState(false);

  const HA_ENDPOINT = 'https://argos-blue.vercel.app/api/ha';

  const handleLoadHAKey = React.useCallback(async () => {
    setHaKeyLoading(true);
    setHaKeyError(null);
    try {
      const data = await getHAKey();
      setHaKey(data?.api_key ?? null);
    } catch (err) {
      setHaKeyError(err instanceof Error ? err.message : 'Erro ao carregar chave.');
    } finally {
      setHaKeyLoading(false);
    }
  }, []);

  const handleGenerateHAKey = async () => {
    medium();
    setHaKeyLoading(true);
    setHaKeyError(null);
    try {
      const key = await generateHAKey();
      setHaKey(key);
    } catch (err) {
      setHaKeyError(err instanceof Error ? err.message : 'Erro ao gerar chave.');
    } finally {
      setHaKeyLoading(false);
    }
  };

  const handleDeleteHAKey = async () => {
    medium();
    setHaKeyLoading(true);
    setHaKeyError(null);
    try {
      await deleteHAKey();
      setHaKey(null);
    } catch (err) {
      setHaKeyError(err instanceof Error ? err.message : 'Erro ao remover chave.');
    } finally {
      setHaKeyLoading(false);
    }
  };

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const [wizBridgeUrl, setWizBridgeUrlLocal] = React.useState(storedBridgeUrl);
  const [wizLocalError, setWizLocalError] = React.useState<string | null>(null);
  const [testingWizBridge, setTestingWizBridge] = React.useState(false);
  const [scanningWizLocal, setScanningWizLocal] = React.useState(false);

  const [expandedIntegrations, setExpandedIntegrations] = React.useState<Record<string, boolean>>({});

  const toggleIntegration = (id: string) => {
    light();
    setExpandedIntegrations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const ewelinkDeviceCount = devices.filter((d) => d.source === 'ewelink').length;
  const tuyaDeviceCount = devices.filter((d) => d.source === 'tuya').length;
  const alexaDeviceCount = devices.filter((d) => d.source === 'alexa').length;
  const wizDeviceCount = devices.filter((d) => d.source === 'wiz').length;
  const tapoDeviceCount = devices.filter((d) => d.source === 'tapo').length;
  const xiaomiDeviceCount = devices.filter((d) => d.source === 'xiaomi').length;
  const chromeDeviceCount = devices.filter((d) => d.source === 'chrome').length;
  const wizLocalDeviceCount = devices.filter((d) => d.source === 'wiz-local').length;

  const handleLoginEwelink = async () => {
    medium();
    setEwelinkError(null);
    setConnectingEwelink(true);
    try {
      await loginEwelinkWithPassword(ewelinkEmail.trim(), ewelinkPassword, '+55');
      setEwelinkPassword('');
      await syncEwelinkDevices();
    } catch (err) {
      setEwelinkError(err instanceof Error ? err.message : 'Falha ao conectar eWeLink.');
    } finally {
      setConnectingEwelink(false);
    }
  };

  const handleLoginTuya = async () => {
    medium();
    setTuyaError(null);
    setConnectingTuya(true);
    try {
      await loginTuya(tuyaEmail.trim(), tuyaPassword);
      setTuyaPassword('');
      await syncTuyaDevices();
    } catch (err) {
      setTuyaError(err instanceof Error ? err.message : 'Falha ao conectar Smart Life.');
    } finally {
      setConnectingTuya(false);
    }
  };

  const handleDisconnectTuya = async () => {
    medium();
    try { await disconnectTuya(); } catch { /* silencioso */ }
    await syncTuyaDevices();
  };

  const handleLoginWiz = async () => {
    medium();
    setWizError(null);
    setConnectingWiz(true);
    try {
      await loginWiz(wizEmail.trim(), wizPassword);
      setWizPassword('');
      await syncWizDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao conectar WiZ.';
      setWizError(msg.replace(/^SOCIAL_ACCOUNT:\s*/i, ''));
    } finally {
      setConnectingWiz(false);
    }
  };

  const handleDisconnectWiz = async () => {
    medium();
    try { await disconnectWiz(); } catch { /* silencioso */ }
    await syncWizDevices();
  };

  const handleTestWizBridge = async () => {
    if (!wizBridgeUrl) return;
    medium();
    setWizLocalError(null);
    setTestingWizBridge(true);
    try {
      const result = await pingBridge(wizBridgeUrl);
      if (result.ok) {
        setWizLocalError('✓ Ponte ligada! Clica "Descobrir" para encontrar lâmpadas.');
      } else {
        setWizLocalError('Ponte respondeu mas com erro inesperado.');
      }
    } catch (err) {
      setWizLocalError(`Não foi possível ligar à ponte: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingWizBridge(false);
    }
  };

  const handleScanWizLocal = async () => {
    // No nativo o scan fala UDP direto (módulo Kotlin próprio) — não depende
    // do texto da ponte. Só grava se tiver algo digitado (reserva pra web).
    medium();
    setWizLocalError(null);
    setScanningWizLocal(true);
    if (wizBridgeUrl) setWizLocalBridgeUrl(wizBridgeUrl);
    try {
      const result = await syncWizLocalDevices();
      if (result.count === 0) {
        setWizLocalError('Nenhuma lâmpada WiZ encontrada. Certifica-te que estás na mesma rede Wi-Fi.');
      } else {
        setWizLocalError(`✓ ${result.count} lâmpada${result.count !== 1 ? 's' : ''} encontrada${result.count !== 1 ? 's' : ''}!`);
      }
    } catch (err) {
      setWizLocalError(`Erro ao procurar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanningWizLocal(false);
    }
  };

  const handleClearWizLocal = () => {
    medium();
    clearWizLocalDevices();
    setWizLocalError(null);
  };

  const handleLoginWizGoogle = async () => {
    medium();
    setWizError(null);
    setConnectingWiz(true);
    try {
      const { data } = await supabase.auth.getSession();
      const googleToken = data.session?.provider_token;
      if (!googleToken) {
        setWizError('Sessão Google expirada. Faz logout e login novamente com o Google, depois tenta de novo.');
        return;
      }
      await loginWizWithGoogle(googleToken);
      await syncWizDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setWizError(msg || 'Falha ao conectar WiZ com Google.');
    } finally {
      setConnectingWiz(false);
    }
  };

  const handleLoginTapo = async () => {
    medium();
    setTapoError(null);
    setConnectingTapo(true);
    try {
      await loginTapo(tapoEmail.trim(), tapoPassword);
      setTapoPassword('');
      await syncTapoDevices();
    } catch (err) {
      setTapoError(err instanceof Error ? err.message : 'Falha ao conectar Tapo.');
    } finally {
      setConnectingTapo(false);
    }
  };

  const handleDisconnectTapo = async () => {
    medium();
    try { await disconnectTapo(); } catch { /* silencioso */ }
    await syncTapoDevices();
  };

  const handleLoginXiaomi = async () => {
    medium();
    setXiaomiError(null);
    setXiaomiVerificationUrl(null);
    setConnectingXiaomi(true);
    try {
      await loginXiaomi(xiaomiEmail.trim(), xiaomiPassword);
      setXiaomiPassword('');
      await syncXiaomiDevices();
    } catch (err) {
      if (err instanceof XiaomiVerificationRequiredError) {
        setXiaomiError(err.message);
        setXiaomiVerificationUrl(err.verificationUrl);
      } else {
        setXiaomiError(err instanceof Error ? err.message : 'Falha ao conectar Xiaomi.');
      }
    } finally {
      setConnectingXiaomi(false);
    }
  };

  const handleDisconnectXiaomi = async () => {
    medium();
    try { await disconnectXiaomi(); } catch { /* silencioso */ }
    await syncXiaomiDevices();
  };

  const handleLoginChrome = async () => {
    medium();
    setChromeError(null);
    setConnectingChrome(true);
    try {
      await loginChrome();
      // O backend retorna um AUTH_URL: na mensagem de erro
      // Este é um padrão especial para indicar que precisa de redirecionamento OAuth
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao conectar Google Home.';
      if (msg.startsWith('AUTH_URL:')) {
        const authUrl = msg.replace('AUTH_URL:', '');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.assign(authUrl);
        } else {
          await Linking.openURL(authUrl);
        }
      } else {
        setChromeError(msg);
      }
    } finally {
      setConnectingChrome(false);
    }
  };

  const handleDisconnectChrome = async () => {
    medium();
    try { await disconnectChrome(); } catch { /* silencioso */ }
    await syncChromeDevices();
  };

  const handleConnectAlexa = async () => {
    medium();
    setAlexaError(null);
    setConnectingAlexa(true);
    try {
      const url = await getAmazonAuthorizeUrl();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(url);
      }
    } catch (err) {
      setAlexaError(err instanceof Error ? err.message : 'Falha ao conectar Amazon.');
      setConnectingAlexa(false);
    }
  };

  const handleDisconnectAlexa = async () => {
    medium();
    try { await disconnectAmazon(); } catch { /* silencioso */ }
  };

  const toneOptions: AIPersonality['tone'][] = ['formal', 'casual', 'direct', 'friendly', 'playful'];
  const proactivityOptions: AIPersonality['proactivity'][] = ['low', 'medium', 'high'];
  const verbosityOptions: { id: AIPersonality['verbosity']; label: string }[] = [
    { id: 'minimal', label: 'Mínima' },
    { id: 'normal', label: 'Normal' },
    { id: 'detailed', label: 'Detalhada' },
  ];

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
                      <Text style={styles.accountOk}>{accountStatusLabel(user.provider)}</Text>
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

            {/* ── eWeLink ── */}
            <IntegrationCard
              title="eWeLink"
              description={
                ewelinkConnected
                  ? `✓ ${ewelinkDeviceCount} dispositivo${ewelinkDeviceCount !== 1 ? 's' : ''} conectado${ewelinkDeviceCount !== 1 ? 's' : ''}`
                  : 'Tomadas e interruptores inteligentes'
              }
              connected={ewelinkConnected}
              expanded={!!expandedIntegrations.ewelink}
              onToggle={() => toggleIntegration('ewelink')}
              onRefresh={() => { void syncEwelinkDevices(); }}
              refreshing={connectingEwelink}
            >
              {!ewelinkConnected ? (
                <View style={styles.formArea}>
                  <TextInput style={styles.formInput} value={ewelinkEmail} onChangeText={setEwelinkEmail}
                    placeholder="E-mail eWeLink" placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none" keyboardType="email-address" editable={!connectingEwelink} />
                  <TextInput style={styles.formInput} value={ewelinkPassword} onChangeText={setEwelinkPassword}
                    placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                    editable={!connectingEwelink} onSubmitEditing={handleLoginEwelink} returnKeyType="done" />
                  {ewelinkError ? <Text style={styles.errorText}>{ewelinkError}</Text> : null}
                  <Pressable style={styles.primaryBtn} onPress={handleLoginEwelink}
                    disabled={connectingEwelink || !ewelinkEmail || !ewelinkPassword}>
                    <Text style={styles.primaryBtnText}>{connectingEwelink ? 'A conectar...' : 'Entrar'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={() => { /* eWeLink disconnect não implementado */ }}>
                  <Text style={styles.dangerRowText}>Desconectar eWeLink</Text>
                </Pressable>
              )}
            </IntegrationCard>
          </Animated.View>

          {/* ── Smart Life / Tuya ── */}
          <Animated.View entering={FadeInDown.delay(136)}>
            <IntegrationCard
              title="Smart Life / Tuya"
              description={
                tuyaConnected
                  ? `✓ ${tuyaDeviceCount} dispositivo${tuyaDeviceCount !== 1 ? 's' : ''} conectado${tuyaDeviceCount !== 1 ? 's' : ''}`
                  : 'Energeeks, Intelbras, Positivo e mais'
              }
              connected={tuyaConnected}
              expanded={!!expandedIntegrations.tuya}
              onToggle={() => toggleIntegration('tuya')}
              onRefresh={() => { void syncTuyaDevices(); }}
              refreshing={connectingTuya}
            >
              {!tuyaConnected ? (
                <View style={styles.formArea}>
                  <TextInput style={styles.formInput} value={tuyaEmail} onChangeText={setTuyaEmail}
                    placeholder="E-mail Smart Life" placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none" keyboardType="email-address" editable={!connectingTuya} />
                  <TextInput style={styles.formInput} value={tuyaPassword} onChangeText={setTuyaPassword}
                    placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                    editable={!connectingTuya} onSubmitEditing={handleLoginTuya} returnKeyType="done" />
                  {tuyaError ? <Text style={styles.errorText}>{tuyaError}</Text> : null}
                  <Pressable style={styles.primaryBtn} onPress={handleLoginTuya}
                    disabled={connectingTuya || !tuyaEmail || !tuyaPassword}>
                    <Text style={styles.primaryBtnText}>{connectingTuya ? 'A conectar...' : 'Entrar'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={handleDisconnectTuya}>
                  <Text style={styles.dangerRowText}>Desconectar Smart Life</Text>
                </Pressable>
              )}
            </IntegrationCard>
          </Animated.View>

          {/* ── Philips WiZ ── */}
          <Animated.View entering={FadeInDown.delay(137)}>
            <IntegrationCard
              title="Philips WiZ"
              description={
                wizConnected
                  ? `✓ ${wizDeviceCount} lâmpada${wizDeviceCount !== 1 ? 's' : ''} conectada${wizDeviceCount !== 1 ? 's' : ''}`
                  : 'Lâmpadas Wi-Fi sem bridge — usa a conta da app WiZ'
              }
              connected={wizConnected}
              expanded={!!expandedIntegrations.wiz}
              onToggle={() => toggleIntegration('wiz')}
              onRefresh={() => { void syncWizDevices(); }}
              refreshing={connectingWiz}
            >
              {!wizConnected ? (
                <View style={styles.formArea}>
                  <Pressable style={styles.googleBtn} onPress={handleLoginWizGoogle} disabled={connectingWiz}>
                    <Text style={styles.googleBtnText}>{connectingWiz ? 'A conectar...' : 'G  Entrar com Google'}</Text>
                  </Pressable>
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>ou e-mail + senha</Text>
                    <View style={styles.orLine} />
                  </View>
                  <TextInput style={styles.formInput} value={wizEmail} onChangeText={setWizEmail}
                    placeholder="E-mail WiZ" placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none" keyboardType="email-address" editable={!connectingWiz} />
                  <TextInput style={styles.formInput} value={wizPassword} onChangeText={setWizPassword}
                    placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                    editable={!connectingWiz} onSubmitEditing={handleLoginWiz} returnKeyType="done" />
                  {wizError ? <Text style={styles.errorText}>{wizError}</Text> : null}
                  <Pressable style={styles.primaryBtn} onPress={handleLoginWiz}
                    disabled={connectingWiz || !wizEmail || !wizPassword}>
                    <Text style={styles.primaryBtnText}>{connectingWiz ? 'A conectar...' : 'Entrar'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={handleDisconnectWiz}>
                  <Text style={styles.dangerRowText}>Desconectar WiZ</Text>
                </Pressable>
              )}

              {/* ── WiFi Local (UDP direto no nativo; ponte Supabase de reserva na web) ── */}
              <View style={styles.divider} />
              <View style={styles.formArea}>
                <Text style={[styles.settingLabel, { marginBottom: 4 }]}>WiFi Local (sem conta)</Text>
                <Text style={styles.settingDesc}>
                  {Platform.OS !== 'web'
                    ? 'Controla lâmpadas WiZ direto pela rede Wi-Fi — sem conta, sem Google, sem computador ligado. Fica na mesma rede do celular e toca "Descobrir".'
                    : 'Controla lâmpadas WiZ na mesma rede Wi-Fi sem precisar de conta.\n1. No computador, corre:\nnode tools/wiz-bridge.js\n2. Copia o ID de 8 letras que aparecer.\n3. Cola aqui e clica "Descobrir".'}
                </Text>
                {Platform.OS === 'web' && (
                  <TextInput
                    style={[styles.formInput, { marginTop: 8 }]}
                    value={wizBridgeUrl}
                    onChangeText={(v) => setWizBridgeUrlLocal(v.toLowerCase().trim())}
                    placeholder="ex: a1b2c3d4"
                    placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={8}
                    editable={!scanningWizLocal}
                  />
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {Platform.OS === 'web' && (
                    <Pressable
                      style={[styles.primaryBtn, { flex: 1 }]}
                      onPress={handleTestWizBridge}
                      disabled={!wizBridgeUrl || testingWizBridge}
                    >
                      <Text style={styles.primaryBtnText}>{testingWizBridge ? '...' : 'Testar'}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.primaryBtn, { flex: 1 }]}
                    onPress={handleScanWizLocal}
                    disabled={(Platform.OS === 'web' && !wizBridgeUrl) || scanningWizLocal}
                  >
                    <Text style={styles.primaryBtnText}>
                      {scanningWizLocal ? 'A procurar...' : 'Descobrir'}
                    </Text>
                  </Pressable>
                </View>
                {wizLocalError ? (
                  <Text
                    style={[
                      styles.settingDesc,
                      { marginTop: 8, color: wizLocalError.startsWith('✓') ? '#4ade80' : Colors.status.error },
                    ]}
                  >
                    {wizLocalError}
                  </Text>
                ) : null}
                {wizLocalConnected && wizLocalDeviceCount > 0 ? (
                  <Pressable style={[styles.dangerRow, { marginTop: 8 }]} onPress={handleClearWizLocal}>
                    <Text style={styles.dangerRowText}>
                      Remover {wizLocalDeviceCount} lâmpada{wizLocalDeviceCount !== 1 ? 's' : ''} local{wizLocalDeviceCount !== 1 ? 'is' : ''}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </IntegrationCard>
          </Animated.View>

          {/* ── TP-Link Tapo ── */}
          <Animated.View entering={FadeInDown.delay(138)}>
            <IntegrationCard
              title="TP-Link Tapo"
              description={
                tapoConnected
                  ? `✓ ${tapoDeviceCount} dispositivo${tapoDeviceCount !== 1 ? 's' : ''} conectado${tapoDeviceCount !== 1 ? 's' : ''}`
                  : 'Lâmpadas e tomadas Tapo — usa a conta do app Tapo'
              }
              connected={tapoConnected}
              expanded={!!expandedIntegrations.tapo}
              onToggle={() => toggleIntegration('tapo')}
              onRefresh={() => { void syncTapoDevices(); }}
              refreshing={connectingTapo}
            >
              {!tapoConnected ? (
                <View style={styles.formArea}>
                  <TextInput style={styles.formInput} value={tapoEmail} onChangeText={setTapoEmail}
                    placeholder="E-mail Tapo" placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none" keyboardType="email-address" editable={!connectingTapo} />
                  <TextInput style={styles.formInput} value={tapoPassword} onChangeText={setTapoPassword}
                    placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                    editable={!connectingTapo} onSubmitEditing={handleLoginTapo} returnKeyType="done" />
                  {tapoError ? <Text style={styles.errorText}>{tapoError}</Text> : null}
                  <Pressable style={styles.primaryBtn} onPress={handleLoginTapo}
                    disabled={connectingTapo || !tapoEmail || !tapoPassword}>
                    <Text style={styles.primaryBtnText}>{connectingTapo ? 'A conectar...' : 'Entrar'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={handleDisconnectTapo}>
                  <Text style={styles.dangerRowText}>Desconectar Tapo</Text>
                </Pressable>
              )}
            </IntegrationCard>
          </Animated.View>

          {/* ── Xiaomi Mi Home ── */}
          <Animated.View entering={FadeInDown.delay(138)}>
            <IntegrationCard
              title="Xiaomi Mi Home"
              description={
                xiaomiConnected
                  ? `✓ ${xiaomiDeviceCount} ventilador${xiaomiDeviceCount !== 1 ? 'es' : ''} conectado${xiaomiDeviceCount !== 1 ? 's' : ''}`
                  : 'Ventiladores Xiaomi — usa a conta do app Mi Home'
              }
              connected={xiaomiConnected}
              expanded={!!expandedIntegrations.xiaomi}
              onToggle={() => toggleIntegration('xiaomi')}
              onRefresh={() => { void syncXiaomiDevices(); }}
              refreshing={connectingXiaomi}
            >
              {!xiaomiConnected ? (
                <View style={styles.formArea}>
                  <TextInput style={styles.formInput} value={xiaomiEmail} onChangeText={setXiaomiEmail}
                    placeholder="E-mail Mi Home" placeholderTextColor={Colors.text.muted}
                    autoCapitalize="none" keyboardType="email-address" editable={!connectingXiaomi} />
                  <TextInput style={styles.formInput} value={xiaomiPassword} onChangeText={setXiaomiPassword}
                    placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                    editable={!connectingXiaomi} onSubmitEditing={handleLoginXiaomi} returnKeyType="done" />
                  {xiaomiError ? <Text style={styles.errorText}>{xiaomiError}</Text> : null}
                  {xiaomiVerificationUrl ? (
                    <Pressable
                      style={[styles.primaryBtn, { marginBottom: 8 }]}
                      onPress={() => { void Linking.openURL(xiaomiVerificationUrl); }}
                    >
                      <Text style={styles.primaryBtnText}>Abrir verificação de identidade</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.primaryBtn} onPress={handleLoginXiaomi}
                    disabled={connectingXiaomi || !xiaomiEmail || !xiaomiPassword}>
                    <Text style={styles.primaryBtnText}>{connectingXiaomi ? 'A conectar...' : 'Entrar'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={handleDisconnectXiaomi}>
                  <Text style={styles.dangerRowText}>Desconectar Xiaomi</Text>
                </Pressable>
              )}
            </IntegrationCard>
          </Animated.View>

          {/* ── Google Home / Smart Home API ── */}
          <Animated.View entering={FadeInDown.delay(138)}>
            <IntegrationCard
              title="Google Home"
              description={
                chromeConnected
                  ? `✓ ${chromeDeviceCount} dispositivo${chromeDeviceCount !== 1 ? 's' : ''} conectado${chromeDeviceCount !== 1 ? 's' : ''}`
                  : 'Controla todos os dispositivos conectados ao Google Home/Nest'
              }
              connected={chromeConnected}
              expanded={!!expandedIntegrations.chrome}
              onToggle={() => toggleIntegration('chrome')}
              onRefresh={() => { void syncChromeDevices(); }}
              refreshing={connectingChrome}
            >
              {!chromeConnected ? (
                <View style={styles.formArea}>
                  {chromeError ? <Text style={styles.errorText}>{chromeError}</Text> : null}
                  <Text style={styles.settingDesc}>
                    Redireciona para o Google para autorizar o acesso aos teus dispositivos inteligentes.
                  </Text>
                  <Pressable style={styles.primaryBtn} onPress={handleLoginChrome} disabled={connectingChrome}>
                    <Text style={styles.primaryBtnText}>{connectingChrome ? 'A redirecionar...' : 'Entrar com Google'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={handleDisconnectChrome}>
                  <Text style={styles.dangerRowText}>Desconectar Google Home</Text>
                </Pressable>
              )}
            </IntegrationCard>
          </Animated.View>

          {/* ── Amazon Alexa ── */}
          <Animated.View entering={FadeInDown.delay(139)}>
            <IntegrationCard
              title="Amazon Alexa"
              description={
                alexaConnected
                  ? `✓ ${alexaDeviceCount} dispositivo${alexaDeviceCount !== 1 ? 's' : ''} Alexa conectado${alexaDeviceCount !== 1 ? 's' : ''}`
                  : 'Controla todos os dispositivos já ligados à Alexa'
              }
              connected={alexaConnected}
              expanded={!!expandedIntegrations.alexa}
              onToggle={() => toggleIntegration('alexa')}
              onRefresh={() => { void syncAlexaDevices(); }}
              refreshing={connectingAlexa}
            >
              {!alexaConnected ? (
                <View style={styles.formArea}>
                  {alexaError ? <Text style={styles.errorText}>{alexaError}</Text> : null}
                  <Text style={styles.settingDesc}>
                    Redireciona para a página de login da Amazon para autorizar o acesso.
                  </Text>
                  <Pressable style={styles.primaryBtn} onPress={handleConnectAlexa} disabled={connectingAlexa}>
                    <Text style={styles.primaryBtnText}>{connectingAlexa ? 'A redirecionar...' : 'Entrar com Amazon'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.dangerRow} onPress={handleDisconnectAlexa}>
                  <Text style={styles.dangerRowText}>Desconectar Alexa</Text>
                </Pressable>
              )}
            </IntegrationCard>
          </Animated.View>

          {/* ── Home Assistant ── */}
          <Animated.View entering={FadeInDown.delay(139)}>
            <IntegrationCard
              title="Home Assistant"
              description={
                haKey
                  ? '✓ Chave API gerada — conecte o HA ao Argos'
                  : 'Controla o Argos por voz via Home Assistant'
              }
              connected={!!haKey}
              expanded={!!expandedIntegrations.ha}
              onToggle={() => {
                toggleIntegration('ha');
                if (!expandedIntegrations.ha && haKey === null && !haKeyLoading) {
                  void handleLoadHAKey();
                }
              }}
            >
              <View style={styles.formArea}>
                <Text style={styles.settingLabel}>Endpoint</Text>
                <Text style={styles.settingDesc}>
                  Configura este URL no Home Assistant como destino da integração.
                </Text>
                <View style={styles.haRow}>
                  <Text
                    style={[styles.haCode, { flex: 1 }]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {HA_ENDPOINT}
                  </Text>
                  <Pressable
                    style={styles.copyBtn}
                    onPress={() => void copyToClipboard(HA_ENDPOINT, setHaUrlCopied)}
                  >
                    <Text style={styles.copyBtnText}>{haUrlCopied ? '✓' : '⎘'}</Text>
                  </Pressable>
                </View>

                <View style={styles.divider} />
                <Text style={[styles.settingLabel, { marginTop: 4 }]}>Chave API</Text>
                <Text style={styles.settingDesc}>
                  Coloca esta chave no header <Text style={{ fontFamily: 'monospace' }}>x-ha-key</Text> das requisições do HA.
                </Text>

                {haKeyLoading ? (
                  <Text style={styles.settingDesc}>Carregando...</Text>
                ) : haKey ? (
                  <>
                    <View style={styles.haRow}>
                      <Text
                        style={[styles.haCode, { flex: 1 }]}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {haKey}
                      </Text>
                      <Pressable
                        style={styles.copyBtn}
                        onPress={() => void copyToClipboard(haKey, setHaCopied)}
                      >
                        <Text style={styles.copyBtnText}>{haCopied ? '✓' : '⎘'}</Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Pressable
                        style={[styles.primaryBtn, { flex: 1 }]}
                        onPress={() => void handleGenerateHAKey()}
                        disabled={haKeyLoading}
                      >
                        <Text style={styles.primaryBtnText}>Regenerar</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.primaryBtn, { flex: 1, borderColor: 'rgba(239,68,68,0.4)' }]}
                        onPress={() => void handleDeleteHAKey()}
                        disabled={haKeyLoading}
                      >
                        <Text style={[styles.primaryBtnText, { color: Colors.status.error }]}>Remover</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => void handleGenerateHAKey()}
                    disabled={haKeyLoading}
                  >
                    <Text style={styles.primaryBtnText}>Gerar chave API</Text>
                  </Pressable>
                )}

                {haKeyError ? <Text style={styles.errorText}>{haKeyError}</Text> : null}
              </View>
            </IntegrationCard>
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
                label="Verbosidade"
                description="Confirmação mínima, normal ou detalhada por voz — ações críticas sempre confirmam por completo"
              >
                <View style={styles.optionRow}>
                  {verbosityOptions.map(({ id, label }) => (
                    <Pressable
                      key={id}
                      onPress={() => {
                        light();
                        updatePersonality({ verbosity: id });
                      }}
                      style={optionPillStyle(settings.personality.verbosity === id)}
                    >
                      <Text style={optionTextStyle(settings.personality.verbosity === id)}>
                        {label}
                      </Text>
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
              <SettingRow label="Palavra de ativação" description="O que você fala pra chamar o Argos — frases um pouco mais longas costumam ser captadas com mais consistência que uma palavra só">
                <TextInput
                  style={styles.nameInput}
                  value={settings.wakeWord}
                  onChangeText={(v) => updateSettings({ wakeWord: v })}
                  placeholder="Ex: Ei Argos"
                  placeholderTextColor={Colors.text.muted}
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
  section: { marginHorizontal: 24, marginBottom: 10, padding: 0, overflow: 'hidden' },
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
  googleBtn: {
    backgroundColor: 'rgba(66, 133, 244, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.4)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  googleBtnText: { color: '#7EB8FA', fontWeight: '700' as const, fontSize: 15 },
  orRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.glass.border },
  orText: { color: Colors.text.muted, fontSize: 11 },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  integrationHeaderMain: { flex: 1, minWidth: 0 },
  integrationChevron: {
    color: Colors.text.muted,
    fontSize: 14,
    fontWeight: '600',
    width: 18,
    textAlign: 'center',
  },
  formArea: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 10,
  },
  formInput: {
    color: Colors.text.primary,
    fontSize: 16,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  primaryBtn: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.45)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  primaryBtnText: { color: '#C4B5FD', fontWeight: '700' as const, fontSize: 15 },
  iconBtn: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  iconBtnText: { color: '#A78BFA', fontWeight: '700' as const, fontSize: 18 },
  dangerRow: { paddingHorizontal: 16, paddingVertical: 12 },
  dangerRowText: { color: Colors.status.error, fontSize: 13, fontWeight: '500' },
  haRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  haCode: {
    color: Colors.text.primary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  copyBtn: {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyBtnText: { color: '#C4B5FD', fontSize: 16, fontWeight: '700' as const },
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
