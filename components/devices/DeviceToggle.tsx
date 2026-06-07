import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface DeviceToggleProps {
  isOn: boolean;
  onToggle: () => void;
}

export function DeviceToggle({ isOn, onToggle }: DeviceToggleProps) {
  return (
    <Pressable onPress={onToggle} style={[styles.toggle, isOn && styles.on]}>
      <Text style={styles.text}>{isOn ? 'On' : 'Off'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { backgroundColor: Colors.glass.heavy, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  on: { backgroundColor: Colors.accent.primary },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
