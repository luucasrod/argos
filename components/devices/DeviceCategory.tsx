import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { DeviceCategory as DeviceCategoryType } from '@/types/device.types';

const LABELS: Record<DeviceCategoryType | 'all', string> = {
  all: '🏠 Todos',
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

interface DeviceCategoryProps {
  category: DeviceCategoryType | 'all';
  active: boolean;
  onPress: () => void;
}

export function DeviceCategory({ category, active, onPress }: DeviceCategoryProps) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.active]}>
      <Text style={[styles.text, active && styles.textActive]}>{LABELS[category]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 10,
  },
  active: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  text: { color: Colors.text.muted, fontSize: 13 },
  textActive: { color: '#fff', fontWeight: '600' },
});
