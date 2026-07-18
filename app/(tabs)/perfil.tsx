import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAIStore } from '@/stores/useAIStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';

function Row({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <GlassCard style={styles.sectionCard}>{children}</GlassCard>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function PerfilScreen() {
  const { settings, updateSettings } = useSettingsStore();
  const { user, signOut } = useAuthStore();
  const { clearMessages } = useAIStore();
  const { memories, clearDismissedInsights } = useMemoryStore();
  const { devices } = useDeviceStore();
  const { light, medium } = useHaptic();

  const confirmedMemories = memories.filter((m) => m.status === 'confirmed' && m.isActive).length;
  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.status === 'online' || d.status === 'on').length;

  const providerLabel =
    user?.app_metadata?.provider === 'google'
      ? 'Google'
      : user?.app_metadata?.provider === 'email'
        ? 'E-mail'
        : 'Anônimo';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.email?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={styles.userName}>
              {user?.user_metadata?.full_name ?? user?.email ?? 'Usuário'}
            </Text>
            <Text style={styles.userProv}>{providerLabel}</Text>
          </View>

          {/* Estatísticas */}
          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{confirmedMemories}</Text>
              <Text style={styles.statLabel}>Memórias</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{totalDevices}</Text>
              <Text style={styles.statLabel}>Dispositivos</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{onlineDevices}</Text>
              <Text style={styles.statLabel}>Online</Text>
            </View>
          </View>

          {/* Voz */}
          <Section title="Voz">
            <Row
              label="Escuta automática"
              sub="Argos fica sempre ouvindo por 'Argos'"
              right={
                <Switch
                  value={settings.autoListen}
                  onValueChange={(v) => { light(); updateSettings({ autoListen: v }); }}
                  trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                  thumbColor="#fff"
                />
              }
            />
            <Divider />
            <Row
              label="Velocidade da fala"
              sub={`${settings.voiceSpeed === 1 ? 'Normal' : settings.voiceSpeed > 1 ? 'Rápido' : 'Lento'}`}
              right={
                <View style={styles.speedBtns}>
                  {[0.8, 1, 1.2, 1.5].map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => { light(); updateSettings({ voiceSpeed: s }); }}
                      style={[styles.speedBtn, settings.voiceSpeed === s && styles.speedBtnActive]}
                    >
                      <Text style={[styles.speedBtnText, settings.voiceSpeed === s && styles.speedBtnTextActive]}>
                        {s}x
                      </Text>
                    </Pressable>
                  ))}
                </View>
              }
            />
          </Section>

          {/* Assistente */}
          <Section title="Assistente">
            <Row
              label="Modo autônomo"
              sub="Argos pode agir sem confirmação"
              right={
                <Switch
                  value={settings.autonomyLevel === 'autonomous'}
                  onValueChange={(v) => {
                    light();
                    updateSettings({ autonomyLevel: v ? 'autonomous' : 'assisted' });
                  }}
                  trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                  thumbColor="#fff"
                />
              }
            />
            <Divider />
            <Row
              label="Modelo de IA"
              sub={settings.model ?? 'Padrão'}
              right={
                <Pressable
                  onPress={() => router.push('/(modals)/memory')}
                  style={styles.linkBtn}
                >
                  <Text style={styles.linkBtnText}>Configurar →</Text>
                </Pressable>
              }
            />
          </Section>

          {/* Integrações */}
          <Section title="Integrações">
            <Pressable
              style={styles.integrationRow}
              onPress={() => router.push('/(tabs)/settings' as any)}
            >
              <Text style={styles.integrationIcon}>🔌</Text>
              <View style={styles.integrationInfo}>
                <Text style={styles.integrationLabel}>Gerenciar integrações</Text>
                <Text style={styles.integrationSub}>eWeLink · WiZ · Tuya · Amazon · Hue · Tapo · Xiaomi</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Section>

          {/* Dados */}
          <Section title="Dados">
            <Pressable
              style={styles.actionRow}
              onPress={() => { medium(); clearMessages(); }}
            >
              <Text style={styles.actionLabel}>Limpar histórico de conversas</Text>
            </Pressable>
            <Divider />
            <Pressable
              style={styles.actionRow}
              onPress={() => { light(); clearDismissedInsights(); }}
            >
              <Text style={styles.actionLabel}>Limpar insights dispensados</Text>
            </Pressable>
          </Section>

          {/* Conta */}
          <Section title="Conta">
            <Pressable
              style={styles.actionRow}
              onPress={() => { medium(); signOut(); }}
            >
              <Text style={[styles.actionLabel, styles.actionDanger]}>Sair da conta</Text>
            </Pressable>
          </Section>

          <Text style={styles.version}>Argos · experimento-grande</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  scroll: { paddingBottom: 100 },

  header: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent.secondary + '44',
    borderWidth: 2,
    borderColor: Colors.accent.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { color: Colors.text.primary, fontSize: 28, fontWeight: '700' },
  userName: { color: Colors.text.primary, fontSize: 20, fontWeight: '700' },
  userProv: { color: Colors.text.muted, fontSize: 13 },

  stats: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: Colors.glass.light,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  statLabel: { color: Colors.text.muted, fontSize: 12 },
  statSep: { width: 1, backgroundColor: Colors.glass.border, marginVertical: 4 },

  section: { marginHorizontal: 20, marginBottom: 20 },
  sectionTitle: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionCard: { padding: 0, overflow: 'hidden' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: { flex: 1 },
  rowLabel: { color: Colors.text.primary, fontSize: 15, fontWeight: '500' },
  rowSub: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },

  divider: { height: 1, backgroundColor: Colors.glass.border, marginHorizontal: 16 },

  speedBtns: { flexDirection: 'row', gap: 4 },
  speedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  speedBtnActive: {
    backgroundColor: Colors.accent.primary + '33',
    borderColor: Colors.accent.primary,
  },
  speedBtnText: { color: Colors.text.muted, fontSize: 12, fontWeight: '600' },
  speedBtnTextActive: { color: Colors.accent.primary },

  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.glass.medium,
  },
  linkBtnText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '500' },

  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  integrationIcon: { fontSize: 22 },
  integrationInfo: { flex: 1 },
  integrationLabel: { color: Colors.text.primary, fontSize: 15, fontWeight: '500' },
  integrationSub: { color: Colors.text.muted, fontSize: 11, marginTop: 2 },
  chevron: { color: Colors.text.muted, fontSize: 20 },

  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionLabel: { color: Colors.text.secondary, fontSize: 15 },
  actionDanger: { color: Colors.status.error },

  version: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 8,
  },
});
