import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useMemoryStore } from '@/stores/useMemoryStore';
import { SubTabBar, SubTab } from '@/components/ui/SubTabBar';
import { SwipeCardDeck } from '@/components/memory/SwipeCardDeck';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Memory } from '@/types/memory.types';

const TABS: SubTab[] = [
  { key: 'memoria', label: 'Memória', emoji: '🧠' },
  { key: 'aprendizados', label: 'Aprendizados', emoji: '📚' },
  { key: 'insights', label: 'Insights', emoji: '💡' },
  { key: 'sugestoes', label: 'Sugestões', emoji: '✨' },
  { key: 'objetivos', label: 'Objetivos', emoji: '🎯' },
];

const CATEGORY_COLORS: Record<string, string> = {
  routine: '#4F6EF7',
  preference: '#7B5CEA',
  person: '#00E5A0',
  location: '#00D4FF',
  habit: '#F59E0B',
  context: '#8A94B2',
};

function MemoryItem({ memory }: { memory: Memory }) {
  const color = CATEGORY_COLORS[memory.category] ?? Colors.accent.primary;
  return (
    <GlassCard style={styles.memItem}>
      <View style={styles.memItemRow}>
        <View style={[styles.memDot, { backgroundColor: color }]} />
        <View style={styles.memItemContent}>
          <Text style={styles.memItemTitle}>{memory.title}</Text>
          <Text style={styles.memItemContent2} numberOfLines={2}>{memory.content}</Text>
        </View>
        <Text style={styles.memItemConf}>{Math.round(memory.confidence * 100)}%</Text>
      </View>
    </GlassCard>
  );
}

export default function InteligenciaScreen() {
  const [activeTab, setActiveTab] = useState('memoria');
  const {
    memories,
    getPendingMemories,
    confirmMemory,
    rejectMemory,
    getActiveInsights,
    dismissInsight,
  } = useMemoryStore();

  const confirmedMemories = memories.filter((m) => m.status === 'confirmed' && m.isActive);
  const pendingMemories = getPendingMemories();
  const insights = getActiveInsights();

  const renderContent = () => {
    switch (activeTab) {
      case 'memoria':
        return (
          <SwipeCardDeck
            memories={pendingMemories}
            onConfirm={confirmMemory}
            onReject={rejectMemory}
          />
        );

      case 'aprendizados':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>
              {confirmedMemories.length} memórias confirmadas
            </Text>
            {confirmedMemories.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📚</Text>
                <Text style={styles.emptyText}>Nenhuma memória confirmada ainda</Text>
              </View>
            ) : (
              confirmedMemories.map((m) => <MemoryItem key={m.id} memory={m} />)
            )}
          </ScrollView>
        );

      case 'insights':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>{insights.length} ativos</Text>
            {insights.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>💡</Text>
                <Text style={styles.emptyText}>Nenhum insight ativo</Text>
              </View>
            ) : (
              insights.map((insight) => (
                <GlassCard key={insight.id} style={styles.insightCard}>
                  <Text style={styles.insightMsg}>{insight.message}</Text>
                  {insight.suggestion && (
                    <Text style={styles.insightSug}>{insight.suggestion} →</Text>
                  )}
                  <View style={styles.insightFooter}>
                    <Text style={styles.insightType}>{insight.type.toUpperCase()}</Text>
                    <Pressable onPress={() => dismissInsight(insight.id)}>
                      <Text style={styles.insightDismiss}>Dispensar</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              ))
            )}
          </ScrollView>
        );

      case 'sugestoes':
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyTitle}>Sugestões</Text>
            <Text style={styles.emptyText}>
              Argos vai gerar sugestões com base no que aprender sobre você
            </Text>
          </View>
        );

      case 'objetivos':
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>Objetivos</Text>
            <Text style={styles.emptyText}>
              Defina seus objetivos e Argos vai te ajudar a alcançá-los
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Inteligência</Text>
          <Text style={styles.subtitle}>
            {pendingMemories.length > 0
              ? `${pendingMemories.length} memória${pendingMemories.length > 1 ? 's' : ''} para revisar`
              : 'Tudo revisado'}
          </Text>
        </View>

        <SubTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <View style={styles.content}>
          {renderContent()}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 3 },

  content: { flex: 1 },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
    gap: 10,
  },
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  memItem: { padding: 14 },
  memItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  memDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  memItemContent: { flex: 1, gap: 3 },
  memItemTitle: { color: Colors.text.primary, fontSize: 14, fontWeight: '600' },
  memItemContent2: { color: Colors.text.muted, fontSize: 13, lineHeight: 18 },
  memItemConf: { color: Colors.text.muted, fontSize: 12, fontWeight: '500', flexShrink: 0 },

  insightCard: { padding: 16, gap: 10 },
  insightMsg: { color: Colors.text.primary, fontSize: 14, lineHeight: 20 },
  insightSug: { color: Colors.accent.primary, fontSize: 13, fontWeight: '500' },
  insightFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  insightType: { color: Colors.text.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  insightDismiss: { color: Colors.text.muted, fontSize: 12 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 80,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700' },
  emptyText: {
    color: Colors.text.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
