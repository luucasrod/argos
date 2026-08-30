import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useDeviceStore } from '@/stores/useDeviceStore';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { DraggableDeviceList } from '@/components/devices/DraggableDeviceList';
import { Colors } from '@/constants/colors';
import { Device, DeviceCategory } from '@/types/device.types';
import { getSpeakableDeviceAlias } from '@/services/voice/deviceVoiceAliases';

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  lights: '💡 Luzes',
  tv: '📺 TV',
  ac: '❄️ Ar-condicionado',
  fans: '🌀 Ventiladores',
  outlets: '🔌 Tomadas',
  cameras: '📷 Câmeras',
  sensors: '📡 Sensores',
  speakers: '🔊 Speakers',
  thermostat: '🌡️ Termostatos',
  other: '📦 Outros',
};

const BRIGHTNESS_STEPS = [20, 40, 60, 80, 100];

const COLOR_PRESETS = [
  { label: 'Branco', hex: '#FFFFFF', display: '#F5F0E8' },
  { label: 'Amarelo', hex: '#FFB300', display: '#FFB300' },
  { label: 'Laranja', hex: '#FF6000', display: '#FF6000' },
  { label: 'Vermelho', hex: '#FF1A1A', display: '#FF1A1A' },
  { label: 'Rosa', hex: '#FF4DA6', display: '#FF4DA6' },
  { label: 'Roxo', hex: '#9B30FF', display: '#9B30FF' },
  { label: 'Azul', hex: '#1A8CFF', display: '#1A8CFF' },
  { label: 'Verde', hex: '#00CC66', display: '#00CC66' },
];

function stateNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

const FAN_SPEED_STEPS = [25, 50, 75, 100];

function DeviceCard({
  device,
  displayName,
  onToggle,
  onRename,
  onBrightness,
  onColor,
  onSetState,
}: {
  device: Device;
  displayName: string;
  onToggle: () => void;
  onRename: (name: string) => void;
  onBrightness: (value: number) => void;
  onColor: (hex: string) => void;
  onSetState: (property: string, value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);

  const isLight = device.category === 'lights';
  const isFan = device.category === 'fans';
  const hasColor = device.capabilities.some((c) => c.property === 'color');
  const hasBrightness = device.capabilities.some((c) => c.property === 'brightness');
  const brightness = stateNumber(device.state.brightness, 100);
  const speedCap = device.capabilities.find((c) => c.property === 'speed');
  const hasSwing = device.capabilities.some((c) => c.property === 'swing');
  const angleCap = device.capabilities.find((c) => c.property === 'angle');
  const modeCap = device.capabilities.find((c) => c.property === 'mode');
  const speedValue = stateNumber(device.state.speed, speedCap?.min ?? 0);
  const swingOn = Boolean(device.state.swing);
  const angleValue = device.state.angle;
  const modeValue = device.state.mode;
  const voiceAlias = getSpeakableDeviceAlias(device.name);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== displayName) onRename(trimmed);
    setEditing(false);
  };

  return (
    <GlassCard style={StyleSheet.flatten([styles.card, !device.isOn && styles.cardOff])}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>{device.icon}</Text>
          <View style={styles.nameBlock}>
            {editing ? (
              <TextInput
                style={styles.nameInput}
                value={editValue}
                onChangeText={setEditValue}
                onBlur={commitRename}
                onSubmitEditing={commitRename}
                autoFocus
                returnKeyType="done"
                selectTextOnFocus
              />
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                <Pressable
                  onPress={() => { setEditValue(displayName); setEditing(true); }}
                  hitSlop={8}
                  style={styles.editBtn}
                >
                  <Text style={styles.editIcon}>✏️</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.room}>{device.room} · {device.brand}</Text>
            {voiceAlias && <Text style={styles.room}>Por voz: {voiceAlias}</Text>}
          </View>
        </View>

        <Pressable
          onPress={onToggle}
          style={StyleSheet.flatten([styles.toggle, device.isOn && styles.toggleOn])}
        >
          <Text style={styles.toggleText}>{device.isOn ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>

      {/* Brilho — só para luzes, quando ligada */}
      {isLight && hasBrightness && device.isOn && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>☀️ Brilho</Text>
          <View style={styles.brightnessRow}>
            {BRIGHTNESS_STEPS.map((step) => {
              const active = Math.abs(brightness - step) < 12;
              return (
                <Pressable
                  key={step}
                  onPress={() => onBrightness(step)}
                  style={StyleSheet.flatten([styles.brightnessBtn, active && styles.brightnessBtnActive])}
                >
                  <Text style={StyleSheet.flatten([styles.brightnessBtnText, active && styles.brightnessBtnTextActive])}>
                    {step}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Cores pré-definidas — só para luzes com cor, quando ligada */}
      {isLight && hasColor && device.isOn && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🎨 Cor</Text>
          <View style={styles.colorRow}>
            {COLOR_PRESETS.map((preset) => (
              <Pressable
                key={preset.hex}
                onPress={() => onColor(preset.hex)}
                style={[styles.colorDot, { backgroundColor: preset.display }]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Força — só para ventiladores, quando ligado */}
      {isFan && speedCap && device.isOn && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>💨 Força</Text>
          <View style={styles.brightnessRow}>
            {FAN_SPEED_STEPS.map((step) => {
              const active = Math.abs(speedValue - step) < 12;
              return (
                <Pressable
                  key={step}
                  onPress={() => onSetState('speed', step)}
                  style={StyleSheet.flatten([styles.brightnessBtn, active && styles.brightnessBtnActive])}
                >
                  <Text style={StyleSheet.flatten([styles.brightnessBtnText, active && styles.brightnessBtnTextActive])}>
                    {step}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Oscilar — só para ventiladores, quando ligado */}
      {isFan && hasSwing && device.isOn && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🔄 Oscilar</Text>
          <Pressable
            onPress={() => onSetState('swing', !swingOn)}
            style={StyleSheet.flatten([styles.toggle, swingOn && styles.toggleOn])}
          >
            <Text style={styles.toggleText}>{swingOn ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>
      )}

      {/* Ângulo de oscilação — só para ventiladores, quando ligado */}
      {isFan && angleCap && device.isOn && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📐 Ângulo</Text>
          <View style={styles.brightnessRow}>
            {angleCap.options?.map((opt) => {
              const active = angleValue === parseInt(opt, 10);
              return (
                <Pressable
                  key={opt}
                  onPress={() => onSetState('angle', opt)}
                  style={StyleSheet.flatten([styles.brightnessBtn, active && styles.brightnessBtnActive])}
                >
                  <Text style={StyleSheet.flatten([styles.brightnessBtnText, active && styles.brightnessBtnTextActive])}>
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Modo de vento — só para ventiladores, quando ligado */}
      {isFan && modeCap && device.isOn && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🍃 Modo</Text>
          <View style={styles.brightnessRow}>
            {modeCap.options?.map((opt) => {
              const active = modeValue === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => onSetState('mode', opt)}
                  style={StyleSheet.flatten([styles.brightnessBtn, active && styles.brightnessBtnActive])}
                >
                  <Text style={StyleSheet.flatten([styles.brightnessBtnText, active && styles.brightnessBtnTextActive])}>
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Status badge */}
      <View style={[
        styles.statusBadge,
        { backgroundColor: device.status === 'online' ? 'rgba(0,229,160,0.12)' : 'rgba(58,61,74,0.4)' },
      ]}>
        <View style={[
          styles.statusDot,
          { backgroundColor: device.status === 'online' ? Colors.status.success : Colors.status.offline },
        ]} />
        <Text style={[
          styles.statusText,
          { color: device.status === 'online' ? Colors.status.success : Colors.text.muted },
        ]}>
          {device.status === 'online' ? 'Online' : 'Offline'}
        </Text>
      </View>
    </GlassCard>
  );
}

function byCustomOrder(customOrder: Record<string, number>) {
  return (a: Device, b: Device) => {
    const aOrder = customOrder[a.id] ?? Number.MAX_SAFE_INTEGER;
    const bOrder = customOrder[b.id] ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.id.localeCompare(b.id);
  };
}

export default function DevicesScreen() {
  const { devices, customNames, customOrder, setDeviceOrder, toggleDevice, updateDeviceState, renameDevice } = useDeviceStore();
  const { light } = useHaptic();

  const [selectedCategory, setSelectedCategory] = useState<DeviceCategory | 'all'>('all');

  const categories = ['all', ...new Set(devices.map((d) => d.category))] as (DeviceCategory | 'all')[];

  // Online e offline são duas listas separadas — cada uma só reordena quando
  // o usuário arrasta pela alça. Uma atualização de estado nunca troca um
  // dispositivo de grupo a não ser que ele realmente mude de status.
  const { onlineDevices, offlineDevices } = React.useMemo(() => {
    const list = selectedCategory === 'all'
      ? devices
      : devices.filter((d) => d.category === selectedCategory);
    const sorter = byCustomOrder(customOrder);
    return {
      onlineDevices: list.filter((d) => d.status === 'online').sort(sorter),
      offlineDevices: list.filter((d) => d.status !== 'online').sort(sorter),
    };
  }, [devices, selectedCategory, customOrder]);
  const onlineCount = devices.filter((d) => d.status === 'online').length;

  const renderDeviceCard = (device: Device) => (
    <DeviceCard
      device={device}
      displayName={customNames[device.id] ?? device.name}
      onToggle={() => { light(); toggleDevice(device.id); }}
      onRename={(name) => { light(); renameDevice(device.id, name); }}
      onBrightness={(val) => { light(); updateDeviceState(device.id, 'brightness', val); }}
      onColor={(hex) => { light(); updateDeviceState(device.id, 'color', hex); }}
      onSetState={(property, val) => { light(); updateDeviceState(device.id, property, val); }}
    />
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View entering={FadeInDown.delay(100)} style={styles.headerBlock}>
            <Text style={styles.title}>Dispositivos</Text>
            <Text style={styles.subtitle}>{onlineCount}/{devices.length} online</Text>
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
                  onPress={() => { light(); setSelectedCategory(cat); }}
                  style={StyleSheet.flatten([
                    styles.categoryPill,
                    selectedCategory === cat && styles.categoryPillActive,
                  ])}
                >
                  <Text style={StyleSheet.flatten([
                    styles.categoryText,
                    selectedCategory === cat && styles.categoryTextActive,
                  ])}>
                    {cat === 'all' ? '🏠 Todos' : CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>

          {onlineDevices.length > 0 && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.grid}>
              {offlineDevices.length > 0 && <Text style={styles.groupLabel}>🟢 Online</Text>}
              <DraggableDeviceList
                devices={onlineDevices}
                renderItem={renderDeviceCard}
                onReorder={setDeviceOrder}
              />
            </Animated.View>
          )}

          {offlineDevices.length > 0 && (
            <Animated.View entering={FadeInDown.delay(220)} style={styles.grid}>
              {onlineDevices.length > 0 && <Text style={styles.groupLabel}>⚪ Offline</Text>}
              <DraggableDeviceList
                devices={offlineDevices}
                renderItem={renderDeviceCard}
                onReorder={setDeviceOrder}
              />
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  scroll: { paddingBottom: 40 },
  headerBlock: { paddingHorizontal: 24, paddingVertical: 16 },
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
  grid: { paddingHorizontal: 24, gap: 12 },
  groupLabel: { color: Colors.text.muted, fontSize: 13, fontWeight: '700', marginBottom: -4 },

  // Card
  card: { padding: 16, gap: 12 },
  cardOff: { opacity: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  icon: { fontSize: 28 },
  nameBlock: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: Colors.text.primary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  editBtn: { padding: 2 },
  editIcon: { fontSize: 12 },
  nameInput: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: Colors.glass.light,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.accent.primary,
  },
  room: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  toggle: {
    backgroundColor: Colors.glass.heavy,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleOn: { backgroundColor: Colors.accent.primary },
  toggleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  // Sections
  section: { gap: 8 },
  sectionLabel: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },

  // Brightness
  brightnessRow: { flexDirection: 'row', gap: 8 },
  brightnessBtn: {
    flex: 1,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  brightnessBtnActive: {
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderColor: Colors.accent.primary,
  },
  brightnessBtnText: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },
  brightnessBtnTextActive: { color: '#C4B5FD', fontWeight: '700' },

  // Colors
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },

  // Status
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
