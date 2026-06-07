import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { AIStatus } from '@/types/ai.types';

interface StatusBarProps {
  status: AIStatus;
  label?: string;
}

export function StatusBar({ status, label }: StatusBarProps) {
  const color =
    status === 'listening'
      ? Colors.status.listening
      : status === 'thinking'
        ? Colors.status.thinking
        : Colors.accent.primary;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: Colors.text.secondary, fontSize: 12 },
});
