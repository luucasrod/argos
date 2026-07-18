import React, { useState, useCallback } from 'react';
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

import { useDeviceStore } from '@/stores/useDeviceStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useArgos } from '@/hooks/useArgos';
import { useHaptic } from '@/hooks/useHaptic';
import { SubTabBar, SubTab } from '@/components/ui/SubTabBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';

const TABS: SubTab[] = [
  { key: 'dispositivos', label: 'Dispositivos', emoji: '💡' },
  { key: 'automacoes', label: 'Automações', emoji: '⚡' },
  { key: 'comodos', label: 'Cômodos', emoji: '🏠' },
  { key: 'eventos', label: 'Eventos', emoji: '📅' },
];

const STATUS_COLOR: Record<string, string> = {
  online: Colors.status.success,
  offline: Colors.status.offline,
  on: Colors.status.success,
  off: Colors.status.offline,
};

export default function CasaScreen() {
  const [activeTab, setActiveTab] = useState('dispositivos');
  const { devices, toggleDevice } = useDeviceStore();
  const { automations, routines, toggleAutomation, toggleRoutine } = useAutomationStore();
  const { sendMessage } = useArgos();
  const { light } = useHaptic();

  const onlineDevices = devices.filter((d) => d.status === 'online' || d.status === 'on');

  const renderContent = () => {
    switch (activeTab) {
      case 'dispositivos':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>
              {onlineDevices.length}/{devices.length} dispositivos ativos
            </Text>
            {devices.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>💡</Text>
                <Text style={styles.emptyTitle}>Nenhum dispositivo</Text>
                <Text style={styles.emptyText}>
                  Configure suas integrações em Perfil para controlar dispositivos
                </Text>
              </View>
            ) : (
              devices.map((device) => {
                const isOn = device.status === 'online' || device.status === 'on';
                return (
                  <GlassCard key={device.id} style={styles.deviceCard}>
                    <View style={styles.deviceRow}>
                      <Text style={styles.deviceIcon}>{device.icon ?? '💡'}</Text>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{device.name}</Text>
                        <View style={styles.deviceStatusRow}>
                          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[device.status] ?? Colors.text.muted }]} />
                          <Text style={styles.deviceStatus}>{device.status}</Text>
                          {device.room ? <Text style={styles.deviceRoom}>· {device.room}</Text> : null}
                        </View>
                      </View>
                      <Switch
                        value={isOn}
                        onValueChange={() => { light(); toggleDevice(device.id); }}
                        trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                        thumbColor="#fff"
                      />
                    </View>
                  </GlassCard>
                );
              })
            )}
          </ScrollView>
        );

      case 'automacoes':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>
              {automations.filter((a) => a.isActive).length} ativas
            </Text>
            {automations.map((auto) => (
              <GlassCard key={auto.id} style={[styles.autoCard, !auto.isActive && styles.autoInactive]}>
                <View style={styles.autoRow}>
                  <Text style={styles.autoEmoji}>{auto.emoji}</Text>
                  <View style={styles.autoInfo}>
                    <Text style={styles.autoName}>{auto.name}</Text>
                    <Text style={styles.autoDesc} numberOfLines={1}>{auto.description}</Text>
                    <Text style={styles.autoTrigger}>⚡ {auto.trigger.label}</Text>
                  </View>
                  <Switch
                    value={auto.isActive}
                    onValueChange={() => { light(); toggleAutomation(auto.id); }}
                    trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                    thumbColor="#fff"
                  />
                </View>
              </GlassCard>
            ))}
          </ScrollView>
        );

      case 'comodos':
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏠</Text>
            <Text style={styles.emptyTitle}>Cômodos</Text>
            <Text style={styles.emptyText}>
              Organize seus dispositivos por cômodo para controle mais fácil
            </Text>
          </View>
        );

      case 'eventos':
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>Eventos da Casa</Text>
            <Text style={styles.emptyText}>
              Histórico de eventos dos seus dispositivos aparecerá aqui
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Casa</Text>
          <Text style={styles.subtitle}>
            {onlineDevices.length} dispositivo{onlineDevices.length !== 1 ? 's' : ''} ativo{onlineDevices.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <SubTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <View style={styles.content}>{renderContent()}</View>
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

  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 10 },
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  deviceCard: { padding: 14 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon: { fontSize: 28, width: 36, textAlign: 'center', flexShrink: 0 },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  deviceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  deviceStatus: { color: Colors.text.muted, fontSize: 12 },
  deviceRoom: { color: Colors.text.muted, fontSize: 12 },

  autoCard: { padding: 14 },
  autoInactive: { opacity: 0.5 },
  autoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  autoEmoji: { fontSize: 26, width: 34, textAlign: 'center', flexShrink: 0, lineHeight: 32 },
  autoInfo: { flex: 1, gap: 3 },
  autoName: { color: Colors.text.primary, fontSize: 14, fontWeight: '600' },
  autoDesc: { color: Colors.text.muted, fontSize: 12 },
  autoTrigger: { color: Colors.text.accent, fontSize: 11, marginTop: 2 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 80,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: Colors.text.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
