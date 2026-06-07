import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Device } from '@/types/device.types';

interface DeviceCardProps {
  device: Device;
  onToggle: () => void;
}

export function DeviceCard({ device, onToggle }: DeviceCardProps) {
  return (
    <GlassCard style={!device.isOn ? [styles.card, styles.off] : styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{device.icon}</Text>
        <View style={styles.info}>
          <Text style={styles.name}>{device.name}</Text>
          <Text style={styles.room}>{device.room}</Text>
        </View>
        <Pressable onPress={onToggle} style={[styles.toggle, device.isOn && styles.toggleOn]}>
          <Text style={styles.toggleText}>{device.isOn ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 12 },
  off: { opacity: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 28 },
  info: { flex: 1 },
  name: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  room: { color: Colors.text.muted, fontSize: 12 },
  toggle: { backgroundColor: Colors.glass.heavy, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  toggleOn: { backgroundColor: Colors.accent.primary },
  toggleText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
