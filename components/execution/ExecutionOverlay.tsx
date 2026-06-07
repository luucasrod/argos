import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { GlassCard } from '@/components/ui/GlassCard';
import { ExecutionStep } from './ExecutionStep';
import { Colors } from '@/constants/colors';
import { useAIStore } from '@/stores/useAIStore';

export function ExecutionOverlay() {
  const { showExecutionOverlay, executionSteps } = useAIStore();

  if (!showExecutionOverlay || executionSteps.length === 0) return null;

  return (
    <Animated.View entering={SlideInDown.springify()} style={styles.container}>
      <GlassCard style={styles.card} borderColor={Colors.glass.borderAccent}>
        <Text style={styles.title}>Executando ações</Text>
        {executionSteps.map((step, i) => (
          <ExecutionStep key={i} label={step.label} status={step.status} />
        ))}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, marginBottom: 16 },
  card: { padding: 16, gap: 10 },
  title: {
    color: Colors.accent.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
