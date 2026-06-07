import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface ExecutionStepProps {
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
}

const ICONS = {
  pending: '⏳',
  running: '⚡',
  success: '✅',
  error: '❌',
};

export function ExecutionStep({ label, status }: ExecutionStepProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.icon}>{ICONS[status]}</Text>
      <Text
        style={[
          styles.label,
          status === 'success' && { color: Colors.status.success },
          status === 'error' && { color: Colors.status.error },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 16 },
  label: { color: Colors.text.primary, fontSize: 14, flex: 1 },
});
