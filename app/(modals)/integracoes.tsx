import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useDeviceStore } from '@/stores/useDeviceStore';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';

import { loginEwelinkWithPassword } from '@/services/devices/ewelinkService';
import { loginTuya, disconnectTuya } from '@/services/devices/tuyaService';
import { getAmazonAuthorizeUrl, disconnectAmazon } from '@/services/devices/amazonService';
import { loginWiz, loginWizWithGoogle, disconnectWiz } from '@/services/devices/wizService';
import { pingBridge } from '@/services/devices/wizLocalBridgeService';
import { supabase } from '@/services/auth/supabase';
import { loginTapo, disconnectTapo } from '@/services/devices/tapoService';
import { loginXiaomi, disconnectXiaomi, XiaomiVerificationRequiredError } from '@/services/devices/xiaomiService';
import { loginChrome, disconnectChrome } from '@/services/devices/chromeService';
import { generateHAKey, getHAKey, deleteHAKey } from '@/services/ha/haService';

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
    <GlassCard style={styles.card}>
      <Pressable style={styles.cardHeader} onPress={onToggle}>
        <View style={styles.cardHeaderMain}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{description}</Text>
        </View>
        {connected && onRefresh ? (
          <Pressable
            style={styles.iconBtn}
            onPress={(e) => { e.stopPropagation?.(); onRefresh(); }}
            disabled={refreshing}
          >
            <Text style={styles.iconBtnText}>{refreshing ? '...' : '↻'}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
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

export default function IntegracoesScreen() {
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

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const toggle = (id: string) => { light(); setExpanded((p) => ({ ...p, [id]: !p[id] })); };

  // eWeLink
  const [connectingEwelink, setConnectingEwelink] = React.useState(false);
  const [ewelinkEmail, setEwelinkEmail] = React.useState('');
  const [ewelinkPassword, setEwelinkPassword] = React.useState('');
  const [ewelinkError, setEwelinkError] = React.useState<string | null>(null);

  // Tuya
  const [connectingTuya, setConnectingTuya] = React.useState(false);
  const [tuyaEmail, setTuyaEmail] = React.useState('');
  const [tuyaPassword, setTuyaPassword] = React.useState('');
  const [tuyaError, setTuyaError] = React.useState<string | null>(null);

  // WiZ
  const [connectingWiz, setConnectingWiz] = React.useState(false);
  const [wizEmail, setWizEmail] = React.useState('');
  const [wizPassword, setWizPassword] = React.useState('');
  const [wizError, setWizError] = React.useState<string | null>(null);

  // WiZ Local
  const [wizBridgeUrl, setWizBridgeUrlLocal] = React.useState(storedBridgeUrl);
  const [wizLocalError, setWizLocalError] = React.useState<string | null>(null);
  const [testingWizBridge, setTestingWizBridge] = React.useState(false);
  const [scanningWizLocal, setScanningWizLocal] = React.useState(false);

  // Tapo
  const [connectingTapo, setConnectingTapo] = React.useState(false);
  const [tapoEmail, setTapoEmail] = React.useState('');
  const [tapoPassword, setTapoPassword] = React.useState('');
  const [tapoError, setTapoError] = React.useState<string | null>(null);

  // Xiaomi
  const [connectingXiaomi, setConnectingXiaomi] = React.useState(false);
  const [xiaomiEmail, setXiaomiEmail] = React.useState('');
  const [xiaomiPassword, setXiaomiPassword] = React.useState('');
  const [xiaomiError, setXiaomiError] = React.useState<string | null>(null);
  const [xiaomiVerificationUrl, setXiaomiVerificationUrl] = React.useState<string | null>(null);

  // Alexa
  const [connectingAlexa, setConnectingAlexa] = React.useState(false);
  const [alexaError, setAlexaError] = React.useState<string | null>(null);

  // Google Home / Chrome
  const [connectingChrome, setConnectingChrome] = React.useState(false);
  const [chromeError, setChromeError] = React.useState<string | null>(null);

  // Home Assistant
  const [haKey, setHaKey] = React.useState<string | null>(null);
  const [haKeyLoading, setHaKeyLoading] = React.useState(false);
  const [haKeyError, setHaKeyError] = React.useState<string | null>(null);
  const [haCopied, setHaCopied] = React.useState(false);
  const [haUrlCopied, setHaUrlCopied] = React.useState(false);
  const HA_ENDPOINT = 'https://argos-blue.vercel.app/api/ha';

  const ewelinkCount = devices.filter((d) => d.source === 'ewelink').length;
  const tuyaCount = devices.filter((d) => d.source === 'tuya').length;
  const alexaCount = devices.filter((d) => d.source === 'alexa').length;
  const wizCount = devices.filter((d) => d.source === 'wiz').length;
  const tapoCount = devices.filter((d) => d.source === 'tapo').length;
  const xiaomiCount = devices.filter((d) => d.source === 'xiaomi').length;
  const chromeCount = devices.filter((d) => d.source === 'chrome').length;
  const wizLocalCount = devices.filter((d) => d.source === 'wiz-local').length;

  const handleLoginEwelink = async () => {
    medium(); setEwelinkError(null); setConnectingEwelink(true);
    try {
      await loginEwelinkWithPassword(ewelinkEmail.trim(), ewelinkPassword, '+55');
      setEwelinkPassword('');
      await syncEwelinkDevices();
    } catch (err) { setEwelinkError(err instanceof Error ? err.message : 'Falha ao conectar eWeLink.'); }
    finally { setConnectingEwelink(false); }
  };

  const handleLoginTuya = async () => {
    medium(); setTuyaError(null); setConnectingTuya(true);
    try {
      await loginTuya(tuyaEmail.trim(), tuyaPassword);
      setTuyaPassword('');
      await syncTuyaDevices();
    } catch (err) { setTuyaError(err instanceof Error ? err.message : 'Falha ao conectar Smart Life.'); }
    finally { setConnectingTuya(false); }
  };

  const handleDisconnectTuya = async () => {
    medium();
    try { await disconnectTuya(); } catch { /* silent */ }
    await syncTuyaDevices();
  };

  const handleLoginWiz = async () => {
    medium(); setWizError(null); setConnectingWiz(true);
    try {
      await loginWiz(wizEmail.trim(), wizPassword);
      setWizPassword('');
      await syncWizDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao conectar WiZ.';
      setWizError(msg.replace(/^SOCIAL_ACCOUNT:\s*/i, ''));
    }
    finally { setConnectingWiz(false); }
  };

  const handleLoginWizGoogle = async () => {
    medium(); setWizError(null); setConnectingWiz(true);
    try {
      const { data } = await supabase.auth.getSession();
      const googleToken = data.session?.provider_token;
      if (!googleToken) {
        setWizError('Sessão Google expirada. Faz logout e login novamente com Google.');
        return;
      }
      await loginWizWithGoogle(googleToken);
      await syncWizDevices();
    } catch (err) {
      setWizError(err instanceof Error ? err.message : 'Falha ao conectar WiZ com Google.');
    }
    finally { setConnectingWiz(false); }
  };

  const handleDisconnectWiz = async () => {
    medium();
    try { await disconnectWiz(); } catch { /* silent */ }
    await syncWizDevices();
  };

  const handleTestWizBridge = async () => {
    if (!wizBridgeUrl) return;
    medium(); setWizLocalError(null); setTestingWizBridge(true);
    try {
      const result = await pingBridge(wizBridgeUrl);
      setWizLocalError(result.ok ? '✓ Ponte ligada! Clica "Descobrir" para encontrar lâmpadas.' : 'Ponte respondeu mas com erro inesperado.');
    } catch (err) {
      setWizLocalError(`Não foi possível ligar à ponte: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setTestingWizBridge(false); }
  };

  const handleScanWizLocal = async () => {
    if (!wizBridgeUrl) return;
    medium(); setWizLocalError(null); setScanningWizLocal(true);
    setWizLocalBridgeUrl(wizBridgeUrl);
    try {
      const result = await syncWizLocalDevices();
      setWizLocalError(result.count === 0
        ? 'Nenhuma lâmpada WiZ encontrada. Certifica-te que estás na mesma rede Wi-Fi.'
        : `✓ ${result.count} lâmpada${result.count !== 1 ? 's' : ''} encontrada${result.count !== 1 ? 's' : ''}!`
      );
    } catch (err) {
      setWizLocalError(`Erro ao procurar: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setScanningWizLocal(false); }
  };

  const handleLoginTapo = async () => {
    medium(); setTapoError(null); setConnectingTapo(true);
    try {
      await loginTapo(tapoEmail.trim(), tapoPassword);
      setTapoPassword('');
      await syncTapoDevices();
    } catch (err) { setTapoError(err instanceof Error ? err.message : 'Falha ao conectar Tapo.'); }
    finally { setConnectingTapo(false); }
  };

  const handleDisconnectTapo = async () => {
    medium();
    try { await disconnectTapo(); } catch { /* silent */ }
    await syncTapoDevices();
  };

  const handleLoginXiaomi = async () => {
    medium(); setXiaomiError(null); setXiaomiVerificationUrl(null); setConnectingXiaomi(true);
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
    }
    finally { setConnectingXiaomi(false); }
  };

  const handleDisconnectXiaomi = async () => {
    medium();
    try { await disconnectXiaomi(); } catch { /* silent */ }
    await syncXiaomiDevices();
  };

  const handleConnectAlexa = async () => {
    medium(); setAlexaError(null); setConnectingAlexa(true);
    try {
      const url = await getAmazonAuthorizeUrl();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(url);
    } catch (err) {
      setAlexaError(err instanceof Error ? err.message : 'Falha ao conectar Amazon.');
      setConnectingAlexa(false);
    }
  };

  const handleDisconnectAlexa = async () => {
    medium();
    try { await disconnectAmazon(); } catch { /* silent */ }
  };

  const handleConnectChrome = async () => {
    medium(); setChromeError(null); setConnectingChrome(true);
    try {
      const url = await loginChrome();
      await Linking.openURL(url);
    } catch (err) {
      setChromeError(err instanceof Error ? err.message : 'Falha ao conectar Google Home.');
    } finally {
      setConnectingChrome(false);
    }
  };

  const handleDisconnectChrome = async () => {
    medium(); setChromeError(null); setConnectingChrome(true);
    try {
      await disconnectChrome();
      await syncChromeDevices();
    } catch (err) {
      setChromeError(err instanceof Error ? err.message : 'Falha ao desconectar Google Home.');
    } finally {
      setConnectingChrome(false);
    }
  };

  const handleLoadHAKey = React.useCallback(async () => {
    setHaKeyLoading(true); setHaKeyError(null);
    try { const data = await getHAKey(); setHaKey(data?.api_key ?? null); }
    catch (err) { setHaKeyError(err instanceof Error ? err.message : 'Erro ao carregar chave.'); }
    finally { setHaKeyLoading(false); }
  }, []);

  const handleGenerateHAKey = async () => {
    medium(); setHaKeyLoading(true); setHaKeyError(null);
    try { setHaKey(await generateHAKey()); }
    catch (err) { setHaKeyError(err instanceof Error ? err.message : 'Erro ao gerar chave.'); }
    finally { setHaKeyLoading(false); }
  };

  const handleDeleteHAKey = async () => {
    medium(); setHaKeyLoading(true); setHaKeyError(null);
    try { await deleteHAKey(); setHaKey(null); }
    catch (err) { setHaKeyError(err instanceof Error ? err.message : 'Erro ao remover chave.'); }
    finally { setHaKeyLoading(false); }
  };

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Voltar</Text>
          </Pressable>
          <Text style={styles.title}>Integrações</Text>
          <Text style={styles.subtitle}>Conecte seus dispositivos ao Argos</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* eWeLink */}
          <IntegrationCard
            title="eWeLink"
            description={ewelinkConnected
              ? `✓ ${ewelinkCount} dispositivo${ewelinkCount !== 1 ? 's' : ''} conectado${ewelinkCount !== 1 ? 's' : ''}`
              : 'Tomadas e interruptores inteligentes'}
            connected={ewelinkConnected}
            expanded={!!expanded.ewelink}
            onToggle={() => toggle('ewelink')}
            onRefresh={() => { void syncEwelinkDevices(); }}
            refreshing={connectingEwelink}
          >
            {!ewelinkConnected ? (
              <View style={styles.form}>
                <TextInput style={styles.input} value={ewelinkEmail} onChangeText={setEwelinkEmail}
                  placeholder="E-mail eWeLink" placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none" keyboardType="email-address" editable={!connectingEwelink} />
                <TextInput style={styles.input} value={ewelinkPassword} onChangeText={setEwelinkPassword}
                  placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                  editable={!connectingEwelink} onSubmitEditing={handleLoginEwelink} returnKeyType="done" />
                {ewelinkError ? <Text style={styles.error}>{ewelinkError}</Text> : null}
                <Pressable style={styles.primaryBtn} onPress={handleLoginEwelink}
                  disabled={connectingEwelink || !ewelinkEmail || !ewelinkPassword}>
                  <Text style={styles.primaryBtnText}>{connectingEwelink ? 'A conectar...' : 'Entrar'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.dangerRow}>
                <Text style={styles.dangerText}>Desconectar eWeLink</Text>
              </Pressable>
            )}
          </IntegrationCard>

          {/* Smart Life / Tuya */}
          <IntegrationCard
            title="Smart Life / Tuya"
            description={tuyaConnected
              ? `✓ ${tuyaCount} dispositivo${tuyaCount !== 1 ? 's' : ''} conectado${tuyaCount !== 1 ? 's' : ''}`
              : 'Energeeks, Intelbras, Positivo e mais'}
            connected={tuyaConnected}
            expanded={!!expanded.tuya}
            onToggle={() => toggle('tuya')}
            onRefresh={() => { void syncTuyaDevices(); }}
            refreshing={connectingTuya}
          >
            {!tuyaConnected ? (
              <View style={styles.form}>
                <TextInput style={styles.input} value={tuyaEmail} onChangeText={setTuyaEmail}
                  placeholder="E-mail Smart Life" placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none" keyboardType="email-address" editable={!connectingTuya} />
                <TextInput style={styles.input} value={tuyaPassword} onChangeText={setTuyaPassword}
                  placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                  editable={!connectingTuya} onSubmitEditing={handleLoginTuya} returnKeyType="done" />
                {tuyaError ? <Text style={styles.error}>{tuyaError}</Text> : null}
                <Pressable style={styles.primaryBtn} onPress={handleLoginTuya}
                  disabled={connectingTuya || !tuyaEmail || !tuyaPassword}>
                  <Text style={styles.primaryBtnText}>{connectingTuya ? 'A conectar...' : 'Entrar'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.dangerRow} onPress={handleDisconnectTuya}>
                <Text style={styles.dangerText}>Desconectar Smart Life</Text>
              </Pressable>
            )}
          </IntegrationCard>

          {/* Philips WiZ */}
          <IntegrationCard
            title="Philips WiZ"
            description={wizConnected
              ? `✓ ${wizCount} lâmpada${wizCount !== 1 ? 's' : ''} conectada${wizCount !== 1 ? 's' : ''}`
              : 'Lâmpadas Wi-Fi sem bridge — usa a conta da app WiZ'}
            connected={wizConnected}
            expanded={!!expanded.wiz}
            onToggle={() => toggle('wiz')}
            onRefresh={() => { void syncWizDevices(); }}
            refreshing={connectingWiz}
          >
            {!wizConnected ? (
              <View style={styles.form}>
                <Pressable style={styles.googleBtn} onPress={handleLoginWizGoogle} disabled={connectingWiz}>
                  <Text style={styles.googleBtnText}>{connectingWiz ? 'A conectar...' : 'G  Entrar com Google'}</Text>
                </Pressable>
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>ou e-mail + senha</Text>
                  <View style={styles.orLine} />
                </View>
                <TextInput style={styles.input} value={wizEmail} onChangeText={setWizEmail}
                  placeholder="E-mail WiZ" placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none" keyboardType="email-address" editable={!connectingWiz} />
                <TextInput style={styles.input} value={wizPassword} onChangeText={setWizPassword}
                  placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                  editable={!connectingWiz} onSubmitEditing={handleLoginWiz} returnKeyType="done" />
                {wizError ? <Text style={styles.error}>{wizError}</Text> : null}
                <Pressable style={styles.primaryBtn} onPress={handleLoginWiz}
                  disabled={connectingWiz || !wizEmail || !wizPassword}>
                  <Text style={styles.primaryBtnText}>{connectingWiz ? 'A conectar...' : 'Entrar'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.dangerRow} onPress={handleDisconnectWiz}>
                <Text style={styles.dangerText}>Desconectar WiZ</Text>
              </Pressable>
            )}

            <View style={styles.divider} />
            <View style={styles.form}>
              <Text style={[styles.cardTitle, { marginBottom: 4 }]}>WiFi Local (sem conta)</Text>
              <Text style={styles.cardDesc}>
                Controla lâmpadas WiZ na mesma rede Wi-Fi sem precisar de conta.{'\n'}
                1. No computador, corre:{'\n'}
                <Text style={{ fontFamily: 'monospace', color: Colors.text.primary }}>node tools/wiz-bridge.js</Text>
                {'\n'}2. Copia o ID de 8 letras que aparecer.{'\n'}
                3. Cola aqui e clica "Descobrir".
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={wizBridgeUrl}
                onChangeText={(v) => setWizBridgeUrlLocal(v.toLowerCase().trim())}
                placeholder="ex: a1b2c3d4"
                placeholderTextColor={Colors.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={8}
                editable={!scanningWizLocal}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={[styles.primaryBtn, { flex: 1 }]} onPress={handleTestWizBridge}
                  disabled={!wizBridgeUrl || testingWizBridge}>
                  <Text style={styles.primaryBtnText}>{testingWizBridge ? '...' : 'Testar'}</Text>
                </Pressable>
                <Pressable style={[styles.primaryBtn, { flex: 1 }]} onPress={handleScanWizLocal}
                  disabled={!wizBridgeUrl || scanningWizLocal}>
                  <Text style={styles.primaryBtnText}>{scanningWizLocal ? 'A procurar...' : 'Descobrir'}</Text>
                </Pressable>
              </View>
              {wizLocalError ? (
                <Text style={[styles.cardDesc, { color: wizLocalError.startsWith('✓') ? '#4ade80' : Colors.status.error }]}>
                  {wizLocalError}
                </Text>
              ) : null}
              {wizLocalConnected && wizLocalCount > 0 ? (
                <Pressable style={styles.dangerRow} onPress={() => { medium(); clearWizLocalDevices(); setWizLocalError(null); }}>
                  <Text style={styles.dangerText}>Remover {wizLocalCount} lâmpada{wizLocalCount !== 1 ? 's' : ''} local{wizLocalCount !== 1 ? 'is' : ''}</Text>
                </Pressable>
              ) : null}
            </View>
          </IntegrationCard>

          {/* TP-Link Tapo */}
          <IntegrationCard
            title="TP-Link Tapo"
            description={tapoConnected
              ? `✓ ${tapoCount} dispositivo${tapoCount !== 1 ? 's' : ''} conectado${tapoCount !== 1 ? 's' : ''}`
              : 'Lâmpadas e tomadas Tapo — usa a conta do app Tapo'}
            connected={tapoConnected}
            expanded={!!expanded.tapo}
            onToggle={() => toggle('tapo')}
            onRefresh={() => { void syncTapoDevices(); }}
            refreshing={connectingTapo}
          >
            {!tapoConnected ? (
              <View style={styles.form}>
                <TextInput style={styles.input} value={tapoEmail} onChangeText={setTapoEmail}
                  placeholder="E-mail Tapo" placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none" keyboardType="email-address" editable={!connectingTapo} />
                <TextInput style={styles.input} value={tapoPassword} onChangeText={setTapoPassword}
                  placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                  editable={!connectingTapo} onSubmitEditing={handleLoginTapo} returnKeyType="done" />
                {tapoError ? <Text style={styles.error}>{tapoError}</Text> : null}
                <Pressable style={styles.primaryBtn} onPress={handleLoginTapo}
                  disabled={connectingTapo || !tapoEmail || !tapoPassword}>
                  <Text style={styles.primaryBtnText}>{connectingTapo ? 'A conectar...' : 'Entrar'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.dangerRow} onPress={handleDisconnectTapo}>
                <Text style={styles.dangerText}>Desconectar Tapo</Text>
              </Pressable>
            )}
          </IntegrationCard>

          {/* Xiaomi Mi Home */}
          <IntegrationCard
            title="Xiaomi Mi Home"
            description={xiaomiConnected
              ? `✓ ${xiaomiCount} ventilador${xiaomiCount !== 1 ? 'es' : ''} conectado${xiaomiCount !== 1 ? 's' : ''}`
              : 'Ventiladores Xiaomi — usa a conta do app Mi Home'}
            connected={xiaomiConnected}
            expanded={!!expanded.xiaomi}
            onToggle={() => toggle('xiaomi')}
            onRefresh={() => { void syncXiaomiDevices(); }}
            refreshing={connectingXiaomi}
          >
            {!xiaomiConnected ? (
              <View style={styles.form}>
                <TextInput style={styles.input} value={xiaomiEmail} onChangeText={setXiaomiEmail}
                  placeholder="E-mail Mi Home" placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none" keyboardType="email-address" editable={!connectingXiaomi} />
                <TextInput style={styles.input} value={xiaomiPassword} onChangeText={setXiaomiPassword}
                  placeholder="Senha" placeholderTextColor={Colors.text.muted} secureTextEntry
                  editable={!connectingXiaomi} onSubmitEditing={handleLoginXiaomi} returnKeyType="done" />
                {xiaomiError ? <Text style={styles.error}>{xiaomiError}</Text> : null}
                {xiaomiVerificationUrl ? (
                  <Pressable style={[styles.primaryBtn, { marginBottom: 4 }]}
                    onPress={() => { void Linking.openURL(xiaomiVerificationUrl); }}>
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
                <Text style={styles.dangerText}>Desconectar Xiaomi</Text>
              </Pressable>
            )}
          </IntegrationCard>

          {/* Amazon Alexa */}
          <IntegrationCard
            title="Amazon Alexa"
            description={alexaConnected
              ? `✓ ${alexaCount} dispositivo${alexaCount !== 1 ? 's' : ''} Alexa conectado${alexaCount !== 1 ? 's' : ''}`
              : 'Controla todos os dispositivos já ligados à Alexa'}
            connected={alexaConnected}
            expanded={!!expanded.alexa}
            onToggle={() => toggle('alexa')}
            onRefresh={() => { void syncAlexaDevices(); }}
            refreshing={connectingAlexa}
          >
            {!alexaConnected ? (
              <View style={styles.form}>
                {alexaError ? <Text style={styles.error}>{alexaError}</Text> : null}
                <Text style={styles.cardDesc}>Redireciona para a página de login da Amazon para autorizar o acesso.</Text>
                <Pressable style={styles.primaryBtn} onPress={handleConnectAlexa} disabled={connectingAlexa}>
                  <Text style={styles.primaryBtnText}>{connectingAlexa ? 'A redirecionar...' : 'Entrar com Amazon'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.dangerRow} onPress={handleDisconnectAlexa}>
                <Text style={styles.dangerText}>Desconectar Alexa</Text>
              </Pressable>
            )}
          </IntegrationCard>

          {/* Google Home / Chrome */}
          <IntegrationCard
            title="Google Home"
            description={chromeConnected
              ? `✓ ${chromeCount} dispositivo${chromeCount !== 1 ? 's' : ''} conectado${chromeCount !== 1 ? 's' : ''}`
              : 'Dispositivos ligados à sua casa do Google'}
            connected={chromeConnected}
            expanded={!!expanded.chrome}
            onToggle={() => toggle('chrome')}
            onRefresh={() => { void syncChromeDevices(); }}
            refreshing={connectingChrome}
          >
            {!chromeConnected ? (
              <View style={styles.form}>
                {chromeError ? <Text style={styles.error}>{chromeError}</Text> : null}
                <Text style={styles.cardDesc}>
                  Abre o Google para autorizar o acesso aos dispositivos da sua casa.
                  Depois de concluir, volte ao Argos e toque em atualizar.
                </Text>
                <Pressable style={styles.googleBtn} onPress={handleConnectChrome} disabled={connectingChrome}>
                  <Text style={styles.googleBtnText}>{connectingChrome ? 'A redirecionar...' : 'Entrar com Google'}</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {chromeError ? <Text style={[styles.error, { marginHorizontal: 16, marginTop: 12 }]}>{chromeError}</Text> : null}
                <Pressable style={styles.dangerRow} onPress={handleDisconnectChrome} disabled={connectingChrome}>
                  <Text style={styles.dangerText}>{connectingChrome ? 'A desconectar...' : 'Desconectar Google Home'}</Text>
                </Pressable>
              </View>
            )}
          </IntegrationCard>

          {/* Home Assistant */}
          <IntegrationCard
            title="Home Assistant"
            description={haKey ? '✓ Chave API gerada — conecte o HA ao Argos' : 'Controla o Argos por voz via Home Assistant'}
            connected={!!haKey}
            expanded={!!expanded.ha}
            onToggle={() => {
              toggle('ha');
              if (!expanded.ha && haKey === null && !haKeyLoading) void handleLoadHAKey();
            }}
          >
            <View style={styles.form}>
              <Text style={styles.cardTitle}>Endpoint</Text>
              <Text style={styles.cardDesc}>Configura este URL no Home Assistant como destino da integração.</Text>
              <View style={styles.haRow}>
                <Text style={[styles.haCode, { flex: 1 }]} numberOfLines={1} ellipsizeMode="middle">{HA_ENDPOINT}</Text>
                <Pressable style={styles.copyBtn} onPress={() => void copy(HA_ENDPOINT, setHaUrlCopied)}>
                  <Text style={styles.copyBtnText}>{haUrlCopied ? '✓' : '⎘'}</Text>
                </Pressable>
              </View>
              <View style={styles.divider} />
              <Text style={[styles.cardTitle, { marginTop: 4 }]}>Chave API</Text>
              <Text style={styles.cardDesc}>
                Coloca esta chave no header <Text style={{ fontFamily: 'monospace' }}>x-ha-key</Text> das requisições do HA.
              </Text>
              {haKeyLoading ? (
                <Text style={styles.cardDesc}>Carregando...</Text>
              ) : haKey ? (
                <>
                  <View style={styles.haRow}>
                    <Text style={[styles.haCode, { flex: 1 }]} numberOfLines={1} ellipsizeMode="middle">{haKey}</Text>
                    <Pressable style={styles.copyBtn} onPress={() => void copy(haKey, setHaCopied)}>
                      <Text style={styles.copyBtnText}>{haCopied ? '✓' : '⎘'}</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable style={[styles.primaryBtn, { flex: 1 }]} onPress={() => void handleGenerateHAKey()} disabled={haKeyLoading}>
                      <Text style={styles.primaryBtnText}>Regenerar</Text>
                    </Pressable>
                    <Pressable style={[styles.primaryBtn, { flex: 1, borderColor: 'rgba(239,68,68,0.4)' }]} onPress={() => void handleDeleteHAKey()} disabled={haKeyLoading}>
                      <Text style={[styles.primaryBtnText, { color: Colors.status.error }]}>Remover</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable style={styles.primaryBtn} onPress={() => void handleGenerateHAKey()} disabled={haKeyLoading}>
                  <Text style={styles.primaryBtnText}>Gerar chave API</Text>
                </Pressable>
              )}
              {haKeyError ? <Text style={styles.error}>{haKeyError}</Text> : null}
            </View>
          </IntegrationCard>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  backBtn: { marginBottom: 10 },
  backText: { color: Colors.accent.primary, fontSize: 15, fontWeight: '500' },
  title: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 3 },
  scroll: { paddingHorizontal: 16, paddingBottom: 60, gap: 10 },

  card: { padding: 0, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  cardHeaderMain: { flex: 1, minWidth: 0 },
  cardTitle: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  cardDesc: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  chevron: { color: Colors.text.muted, fontSize: 14, fontWeight: '600', width: 18, textAlign: 'center' },
  divider: { height: 1, backgroundColor: Colors.glass.border, marginHorizontal: 16 },

  form: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, gap: 10 },
  input: {
    color: Colors.text.primary, fontSize: 16,
    backgroundColor: Colors.glass.light, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.glass.border,
  },
  primaryBtn: {
    backgroundColor: 'rgba(124,58,237,0.2)', borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.45)', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnText: { color: '#C4B5FD', fontWeight: '700', fontSize: 15 },
  dangerRow: { paddingHorizontal: 16, paddingVertical: 12 },
  dangerText: { color: Colors.status.error, fontSize: 13, fontWeight: '500' },
  error: { color: Colors.status.error, fontSize: 12 },
  iconBtn: {
    backgroundColor: 'rgba(124,58,237,0.15)', borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  iconBtnText: { color: '#A78BFA', fontWeight: '700', fontSize: 18 },
  googleBtn: {
    backgroundColor: 'rgba(66,133,244,0.15)', borderWidth: 1,
    borderColor: 'rgba(66,133,244,0.4)', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  googleBtnText: { color: '#7EB8FA', fontWeight: '700', fontSize: 15 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.glass.border },
  orText: { color: Colors.text.muted, fontSize: 11 },
  haRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.glass.light, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.glass.border,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  haCode: { color: Colors.text.primary, fontSize: 12, fontFamily: 'monospace' },
  copyBtn: { backgroundColor: 'rgba(124,58,237,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { color: '#C4B5FD', fontSize: 16, fontWeight: '700' },
});
