import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useDeviceStore } from '@/stores/useDeviceStore';
import { useArgos } from '@/hooks/useArgos';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Device, DeviceCategory } from '@/types/device.types';

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  lights: '💡 Luzes',
  tv: '📺 TV',
  ac: '❄️ Ar-condicionado',
  outlets: '🔌 Tomadas',
  cameras: '📷 Câmeras',
  sensors: '📡 Sensores',
  speakers: '🔊 Speakers',
  other: '📦 Outros',
};

function stateNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function deviceCardStyle(isOn: boolean) {
  return StyleSheet.flatten([styles.deviceCard, !isOn ? styles.deviceCardOff : {}]);
}

function DeviceCard({
  device,
  onToggle,
  onVoiceControl,
}: {
  device: Device;
  onToggle: () => void;
  onVoiceControl: (text: string) => void;
}) {
  const brightnessCapability = device.capabilities.find((c) => c.property === 'brightness');
  const temperatureCapability = device.capabilities.find((c) => c.property === 'temperature');
  const brightness = stateNumber(device.state.brightness, 80);
  const temperature = stateNumber(device.state.temperature, 22);
  const volume = device.state.volume !== undefined ? stateNumber(device.state.volume, 0) : null;

  return (
    <GlassCard style={deviceCardStyle(device.isOn)}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceLeft}>
          <Text style={styles.deviceIcon}>{device.icon}</Text>
          <View>
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.deviceRoom}>
              {device.room} · {device.brand}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onToggle}
          style={StyleSheet.flatten([
            styles.toggleButton,
            device.isOn ? styles.toggleButtonOn : {},
          ])}
        >
          <Text style={styles.toggleText}>{device.isOn ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>

      {device.isOn && (
        <View style={styles.deviceState}>
          {brightnessCapability && (
            <Text style={styles.deviceStateText}>☀️ Brilho: {String(brightness)}%</Text>
          )}
          {temperatureCapability && (
            <Text style={styles.deviceStateText}>🌡️ {String(temperature)}°C</Text>
          )}
          {volume !== null && (
            <Text style={styles.deviceStateText}>🔊 {String(volume)}%</Text>
          )}
        </View>
      )}

      <Pressable
        onPress={() => onVoiceControl(`Controlar ${device.name}`)}
        style={styles.voiceControlButton}
      >
        <Text style={styles.voiceControlText}>🎙 Controlar por voz</Text>
      </Pressable>

      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor:
              device.status === 'online' ? 'rgba(0, 229, 160, 0.15)' : 'rgba(58, 61, 74, 0.4)',
          },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                device.status === 'online' ? Colors.status.success : Colors.status.offline,
            },
          ]}
        />
        <Text
          style={[
            styles.statusText,
            { color: device.status === 'online' ? Colors.status.success : Colors.text.muted },
          ]}
        >
          {device.status === 'online' ? 'Online' : 'Offline'}
        </Text>
      </View>
    </GlassCard>
  );
}

export default function DevicesScreen() {
  const { devices, toggleDevice } = useDeviceStore();
  const { sendMessage } = useArgos();
  const { light } = useHaptic();

  const [selectedCategory, setSelectedCategory] = useState<DeviceCategory | 'all'>('all');

  const categories = ['all', ...new Set(devices.map((d) => d.category))] as (DeviceCategory | 'all')[];
  const filteredDevices =
    selectedCategory === 'all' ? devices : devices.filter((d) => d.category === selectedCategory);
  const onlineCount = devices.filter((d) => d.status === 'online').length;

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
            <Text style={styles.title}>Dispositivos</Text>
            <Text style={styles.subtitle}>
              {onlineCount}/{devices.length} online
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => {
                    light();
                    setSelectedCategory(cat);
                  }}
                  style={StyleSheet.flatten([
                    styles.categoryPill,
                    selectedCategory === cat ? styles.categoryPillActive : {},
                  ])}
                >
                  <Text
                    style={StyleSheet.flatten([
                      styles.categoryText,
                      selectedCategory === cat ? styles.categoryTextActive : {},
                    ])}
                  >
                    {cat === 'all' ? '🏠 Todos' : CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200)} style={styles.devicesGrid}>
            {filteredDevices.map((device, i) => (
              <Animated.View key={device.id} entering={FadeInDown.delay(250 + i * 40)}>
                <DeviceCard
                  device={device}
                  onToggle={() => {
                    light();
                    toggleDevice(device.id);
                  }}
                  onVoiceControl={sendMessage}
                />
              </Animated.View>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  scroll: { paddingBottom: 40 },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { color: Colors.text.primary, fontSize: 28, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 14, marginTop: 4 },
  categoryScroll: { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  categoryPill: {
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryPillActive: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  categoryText: { color: Colors.text.muted, fontSize: 13 },
  categoryTextActive: { color: '#FFFFFF', fontWeight: '600' },
  devicesGrid: { paddingHorizontal: 24, gap: 12 },
  deviceCard: { padding: 16, gap: 12 },
  deviceCardOff: { opacity: 0.6 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  deviceIcon: { fontSize: 28 },
  deviceName: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  deviceRoom: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  toggleButton: {
    backgroundColor: Colors.glass.heavy,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleButtonOn: { backgroundColor: Colors.accent.primary },
  toggleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  deviceState: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  deviceStateText: { color: Colors.text.secondary, fontSize: 13 },
  voiceControlButton: {
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  voiceControlText: { color: Colors.text.muted, fontSize: 12 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '500' },
});
