import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { ExecutedAction } from '@/types/ai.types';

interface ActionCardProps {
  actions: ExecutedAction[];
}

export function ActionCard({ actions }: ActionCardProps) {
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>Ações executadas</Text>
      {actions.map((action) => (
        <View key={action.id} style={styles.row}>
          <Text>{action.status === 'success' ? '✅' : '⏳'}</Text>
          <Text style={styles.label}>{action.label}</Text>
        </View>
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8 },
  title: { color: Colors.accent.primary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: Colors.text.primary, fontSize: 14 },
});
