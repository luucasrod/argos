import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Insight } from '@/types/memory.types';

interface HabitInsightProps {
  insight: Insight;
  onDismiss?: () => void;
  onAction?: () => void;
}

export function HabitInsight({ insight, onDismiss, onAction }: HabitInsightProps) {
  return (
    <GlassCard style={styles.card} borderColor={Colors.glass.borderAccent}>
      <View style={styles.row}>
        <Text style={styles.message}>{insight.message}</Text>
        {onDismiss && (
          <Pressable onPress={onDismiss}>
            <Text style={styles.dismiss}>✕</Text>
          </Pressable>
        )}
      </View>
      {insight.suggestion && (
        <Pressable onPress={onAction}>
          <Text style={styles.suggestion}>{insight.suggestion} →</Text>
        </Pressable>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  message: { color: Colors.text.primary, fontSize: 14, flex: 1 },
  dismiss: { color: Colors.text.muted },
  suggestion: { color: Colors.accent.primary, fontSize: 13, fontWeight: '500' },
});
