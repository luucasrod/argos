import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { ActionList } from '@/components/automation/ActionList';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';

export default function RoutineDetailModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { routines } = useAutomationStore();
  const routine = routines.find((r) => r.id === id);

  if (!routine) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Rotina não encontrada</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {routine.emoji} {routine.name}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <ScrollView>
          <Text style={styles.desc}>{routine.description}</Text>
          <GlassCard style={styles.card}>
            {routine.steps.map((step) => (
              <View key={step.id} style={styles.step}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                {step.narration && <Text style={styles.narration}>{step.narration}</Text>}
              </View>
            ))}
          </GlassCard>
          <ActionList actions={routine.steps.map((s) => s.action)} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: Colors.text.primary, fontSize: 22, fontWeight: '700' },
  close: { color: Colors.text.secondary, fontSize: 20 },
  desc: { color: Colors.text.muted, marginBottom: 16 },
  card: { padding: 16, gap: 12, marginBottom: 16 },
  step: { gap: 4 },
  stepLabel: { color: Colors.text.primary, fontWeight: '600' },
  narration: { color: Colors.text.secondary, fontSize: 13 },
  error: { color: Colors.status.error, padding: 24 },
});
