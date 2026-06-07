import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useMemoryStore } from '@/stores/useMemoryStore';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Memory, MemoryCategory } from '@/types/memory.types';

const CATEGORY_CONFIG: Record<
  MemoryCategory,
  { label: string; emoji: string; color: string }
> = {
  routine: { label: 'Rotina', emoji: '🔄', color: Colors.accent.primary },
  preference: { label: 'Preferência', emoji: '❤️', color: '#FF6B8A' },
  person: { label: 'Pessoa', emoji: '👤', color: '#00D4FF' },
  location: { label: 'Local', emoji: '📍', color: '#00E5A0' },
  habit: { label: 'Hábito', emoji: '📊', color: '#7B5CEA' },
  context: { label: 'Contexto', emoji: '💡', color: Colors.accent.tertiary },
};

export default function MemoryScreen() {
  const { memories, deleteMemory, dismissInsight, getActiveInsights } = useMemoryStore();
  const activeInsights = getActiveInsights();

  const groupedMemories = memories.reduce(
    (acc, mem) => {
      if (!acc[mem.category]) acc[mem.category] = [];
      acc[mem.category].push(mem);
      return acc;
    },
    {} as Record<MemoryCategory, Memory[]>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>🧠 Memória do Argos</Text>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {activeInsights.length > 0 && (
            <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
              <Text style={styles.sectionTitle}>💡 Insights recentes</Text>
              {activeInsights.map((insight) => (
                <GlassCard
                  key={insight.id}
                  style={styles.insightCard}
                  borderColor={Colors.glass.borderAccent}
                >
                  <View style={styles.insightRow}>
                    <Text style={styles.insightMessage}>{insight.message}</Text>
                    <Pressable onPress={() => dismissInsight(insight.id)}>
                      <Text style={styles.dismissText}>✕</Text>
                    </Pressable>
                  </View>
                  {insight.suggestion ? (
                    <Text style={styles.insightSuggestion}>{insight.suggestion}</Text>
                  ) : null}
                  <View style={styles.confidenceBar}>
                    <View
                      style={[
                        styles.confidenceFill,
                        { width: `${Math.round(insight.confidence * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.confidenceText}>
                    Confiança: {Math.round(insight.confidence * 100)}%
                  </Text>
                </GlassCard>
              ))}
            </Animated.View>
          )}

          {(Object.entries(groupedMemories) as [MemoryCategory, Memory[]][]).map(
            ([category, mems], groupIndex) => {
              const config = CATEGORY_CONFIG[category];
              return (
                <Animated.View
                  key={category}
                  entering={FadeInDown.delay(200 + groupIndex * 80)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>
                    {config.emoji} {config.label}
                  </Text>
                  {mems
                    .filter((m) => m.isActive)
                    .map((memory) => (
                      <GlassCard key={memory.id} style={styles.memoryCard}>
                        <View style={styles.memoryHeader}>
                          <Text style={[styles.memoryTitle, { color: config.color }]}>
                            {memory.title}
                          </Text>
                          <Pressable onPress={() => deleteMemory(memory.id)}>
                            <Text style={styles.deleteText}>🗑</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.memoryContent}>{memory.content}</Text>
                        <View style={styles.memoryFooter}>
                          <Text style={styles.memorySource}>
                            {memory.source === 'user_explicit'
                              ? '✋ Você disse'
                              : memory.source === 'ai_inferred'
                                ? '🤖 Argos aprendeu'
                                : '📊 Comportamento'}
                          </Text>
                          <View style={styles.confidenceBadge}>
                            <Text style={styles.confidenceBadgeText}>
                              {Math.round(memory.confidence * 100)}% confiança
                            </Text>
                          </View>
                        </View>
                      </GlassCard>
                    ))}
                </Animated.View>
              );
            }
          )}

          {memories.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🧠</Text>
              <Text style={styles.emptyTitle}>Nenhuma memória ainda</Text>
              <Text style={styles.emptySubtitle}>
                O Argos vai aprendendo seus hábitos conforme você usa o app
              </Text>
            </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: { color: Colors.text.primary, fontSize: 22, fontWeight: '700' },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glass.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: Colors.text.secondary, fontSize: 16 },
  section: { paddingHorizontal: 24, marginBottom: 24, gap: 10 },
  sectionTitle: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  insightCard: { padding: 14, gap: 8 },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  insightMessage: { color: Colors.text.primary, fontSize: 14, flex: 1, lineHeight: 20 },
  dismissText: { color: Colors.text.muted, fontSize: 14, paddingLeft: 8 },
  insightSuggestion: { color: Colors.accent.primary, fontSize: 13, fontWeight: '500' },
  confidenceBar: {
    height: 4,
    backgroundColor: Colors.glass.heavy,
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: { height: 4, backgroundColor: Colors.accent.primary, borderRadius: 2 },
  confidenceText: { color: Colors.text.muted, fontSize: 11 },
  memoryCard: { padding: 14, gap: 8 },
  memoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memoryTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  deleteText: { fontSize: 16 },
  memoryContent: { color: Colors.text.secondary, fontSize: 14, lineHeight: 20 },
  memoryFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memorySource: { color: Colors.text.muted, fontSize: 12 },
  confidenceBadge: {
    backgroundColor: Colors.glass.light,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confidenceBadgeText: { color: Colors.text.muted, fontSize: 11 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.text.primary, fontSize: 20, fontWeight: '700' },
  emptySubtitle: {
    color: Colors.text.muted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
});
