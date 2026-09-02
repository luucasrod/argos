import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useMemoryStore } from '@/stores/useMemoryStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useGoalsStore, type Goal, type UpdateGoalInput } from '@/stores/useGoalsStore';
import { SwipeCardDeck } from '@/components/memory/SwipeCardDeck';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Memory } from '@/types/memory.types';

// ─── Grid de sub-abas 3+3 ─────────────────────────────────────────────────────

type TabKey = 'memoria' | 'aprendizados' | 'insights' | 'sugestoes' | 'objetivos' | 'preferencias';

const TABS: { key: TabKey; label: string; emoji: string }[] = [
  { key: 'memoria',      label: 'Memória',      emoji: '🧠' },
  { key: 'aprendizados', label: 'Aprendizados', emoji: '📚' },
  { key: 'insights',     label: 'Insights',     emoji: '💡' },
  { key: 'sugestoes',    label: 'Sugestões',    emoji: '✨' },
  { key: 'objetivos',    label: 'Objetivos',    emoji: '🎯' },
  { key: 'preferencias', label: 'Preferências', emoji: '⚙️' },
];

function TabGrid({
  activeTab,
  onTabChange,
  pendingMemoryCount,
}: {
  activeTab: TabKey;
  onTabChange: (k: TabKey) => void;
  /** A-053: memórias com status 'pending' — mostra um badge na aba Memória. */
  pendingMemoryCount: number;
}) {
  const rows = [TABS.slice(0, 3), TABS.slice(3, 6)];
  return (
    <View style={styles.tabGrid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.tabRow}>
          {row.map((tab) => {
            const active = tab.key === activeTab;
            const badgeCount = tab.key === 'memoria' ? pendingMemoryCount : 0;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onTabChange(tab.key)}
                style={[styles.tabCell, active && styles.tabCellActive]}
              >
                {badgeCount > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                  </View>
                )}
                <Text style={styles.tabEmoji}>{tab.emoji}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      <View style={styles.memRow}>
        <View style={[styles.memDot, { backgroundColor: color }]} />
        <View style={styles.memContent}>
          <Text style={styles.memTitle}>{memory.title}</Text>
          <Text style={styles.memBody} numberOfLines={2}>{memory.content}</Text>
        </View>
        <Text style={styles.memConf}>{Math.round(memory.confidence * 100)}%</Text>
      </View>
    </GlassCard>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InteligenciaScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('memoria');
  const {
    memories,
    getPendingMemories,
    confirmMemory,
    rejectMemory,
    getActiveInsights,
    dismissInsight,
  } = useMemoryStore();
  const { settings, updateUserProfile } = useSettingsStore();
  const { getActiveGoals, createGoal, updateGoal, deleteGoal, completeGoal } = useGoalsStore();
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const activeGoals = getActiveGoals();

  const handleCreateGoal = () => {
    const title = newGoalTitle.trim();
    if (!title) return;
    void createGoal({ title });
    setNewGoalTitle('');
  };

  const confirmedMemories = memories.filter((m) => m.status === 'confirmed' && m.isActive);
  const pendingMemories = getPendingMemories();
  const insights = getActiveInsights();
  // A-054: preferências de verdade APRENDIDAS (memória confirmada pela IA),
  // distintas do formulário manual de perfil abaixo. Só leitura — gerenciar
  // (rejeitar etc.) continua na sub-aba Memória.
  const learnedPreferences = confirmedMemories.filter((m) => m.category === 'preference');

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
              {confirmedMemories.length} memória{confirmedMemories.length !== 1 ? 's' : ''} confirmada{confirmedMemories.length !== 1 ? 's' : ''}
            </Text>
            {confirmedMemories.length === 0 ? (
              <EmptyState emoji="📚" text="Nenhuma memória confirmada ainda" />
            ) : (
              confirmedMemories.map((m) => <MemoryItem key={m.id} memory={m} />)
            )}
          </ScrollView>
        );

      case 'insights':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>{insights.length} ativo{insights.length !== 1 ? 's' : ''}</Text>
            {insights.length === 0 ? (
              <EmptyState emoji="💡" text="Nenhum insight ativo" />
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
        return <EmptyState emoji="✨" title="Sugestões" text="Argos vai gerar sugestões com base no que aprender sobre você" />;

      case 'objetivos':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>Novo objetivo</Text>
            <GlassCard style={styles.prefCard}>
              <View style={styles.goalAddRow}>
                <TextInput
                  style={styles.goalAddInput}
                  value={newGoalTitle}
                  onChangeText={setNewGoalTitle}
                  placeholder="Ex: Dormir mais cedo"
                  placeholderTextColor={Colors.text.muted}
                  onSubmitEditing={handleCreateGoal}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleCreateGoal}
                  disabled={!newGoalTitle.trim()}
                  style={[styles.goalAddBtn, { opacity: newGoalTitle.trim() ? 1 : 0.4 }]}
                >
                  <Text style={styles.goalAddBtnText}>+</Text>
                </Pressable>
              </View>
            </GlassCard>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
              {activeGoals.length} objetivo{activeGoals.length !== 1 ? 's' : ''}
            </Text>
            {activeGoals.length === 0 ? (
              <EmptyState
                emoji="🎯"
                title="Objetivos"
                text="Defina seus objetivos e Argos vai te ajudar a alcançá-los"
              />
            ) : (
              activeGoals.map((goal) => (
                <GoalItem
                  key={goal.id}
                  goal={goal}
                  editing={editingGoalId === goal.id}
                  onStartEdit={() => setEditingGoalId(goal.id)}
                  onSave={(input) => {
                    void updateGoal(goal.id, input);
                    setEditingGoalId(null);
                  }}
                  onCancelEdit={() => setEditingGoalId(null)}
                  onComplete={() => void completeGoal(goal.id)}
                  onDelete={() => void deleteGoal(goal.id)}
                />
              ))
            )}
          </ScrollView>
        );

      case 'preferencias':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>Seu perfil</Text>
            <GlassCard style={styles.prefCard}>
              <PrefRow label="Seu nome" value={settings.userProfile?.name ?? ''} placeholder="Ex: João"
                onChangeText={(v) => updateUserProfile({ name: v })} />
              <View style={styles.prefDivider} />
              <PrefRow label="Sua cidade" value={settings.userProfile?.city ?? ''} placeholder="Ex: São Paulo"
                onChangeText={(v) => updateUserProfile({ city: v })} />
              <View style={styles.prefDivider} />
              <PrefRow label="Profissão" value={settings.userProfile?.profession ?? ''} placeholder="Ex: Designer"
                onChangeText={(v) => updateUserProfile({ profession: v })} />
            </GlassCard>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Personalidade do assistente</Text>
            <GlassCard style={styles.prefCard}>
              <PrefRow label="Nome do assistente" value={settings.personality?.name ?? 'Argos'} placeholder="Argos"
                onChangeText={(v) => updateUserProfile({ name: v })} />
            </GlassCard>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
              O que o Argos aprendeu sobre você
            </Text>
            {learnedPreferences.length === 0 ? (
              <Text style={styles.learnedEmptyText}>
                Nenhuma preferência aprendida ainda — confirme memórias na sub-aba Memória
                para elas aparecerem aqui.
              </Text>
            ) : (
              learnedPreferences.map((m) => <MemoryItem key={m.id} memory={m} />)
            )}
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Inteligência</Text>
          <Text style={styles.subtitle}>
            {pendingMemories.length > 0
              ? `${pendingMemories.length} memória${pendingMemories.length > 1 ? 's' : ''} para revisar`
              : 'Tudo revisado'}
          </Text>
        </View>

        <TabGrid
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingMemoryCount={pendingMemories.length}
        />

        <View style={styles.content}>{renderContent()}</View>
      </SafeAreaView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ emoji, title, text }: { emoji: string; title?: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function PrefRow({ label, value, placeholder, onChangeText }: {
  label: string; value: string; placeholder: string; onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <TextInput
        style={styles.prefInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.muted}
      />
    </View>
  );
}

/** A-056: um objetivo, em modo leitura ou edição. CRUD real via useGoalsStore. */
function GoalItem({
  goal,
  editing,
  onStartEdit,
  onSave,
  onCancelEdit,
  onComplete,
  onDelete,
}: {
  goal: Goal;
  editing: boolean;
  onStartEdit: () => void;
  onSave: (input: UpdateGoalInput) => void;
  onCancelEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? '');

  // Resincroniza o rascunho com o dado real toda vez que a edição é aberta —
  // sem isto, cancelar uma edição e abrir de novo mostraria o texto digitado
  // antes do cancelamento, não o valor salvo de verdade.
  useEffect(() => {
    if (editing) {
      setTitle(goal.title);
      setDescription(goal.description ?? '');
    }
  }, [editing, goal.title, goal.description]);

  if (editing) {
    return (
      <GlassCard style={styles.goalCard}>
        <TextInput
          style={styles.goalEditInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Título do objetivo"
          placeholderTextColor={Colors.text.muted}
        />
        <TextInput
          style={styles.goalEditInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Descrição (opcional)"
          placeholderTextColor={Colors.text.muted}
          multiline
        />
        <View style={styles.goalActions}>
          <Pressable onPress={onCancelEdit}>
            <Text style={styles.goalActionText}>Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={() => title.trim() && onSave({ title, description })}
          >
            <Text style={[styles.goalActionText, styles.goalActionPrimary]}>Salvar</Text>
          </Pressable>
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.goalCard}>
      <Pressable onPress={onStartEdit}>
        <Text style={styles.goalTitle}>{goal.title}</Text>
        {goal.description ? (
          <Text style={styles.goalDescription}>{goal.description}</Text>
        ) : null}
      </Pressable>
      <View style={styles.goalActions}>
        <Pressable onPress={onComplete}>
          <Text style={styles.goalActionText}>✓ Concluir</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={[styles.goalActionText, styles.goalActionDanger]}>Excluir</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },

  header: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 3 },

  // Grid 3+3
  tabGrid: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
    backgroundColor: Colors.bg.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tabRow: { flexDirection: 'row', gap: 6 },
  tabCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  tabCellActive: {
    backgroundColor: Colors.accent.primary + '22',
    borderColor: Colors.accent.primary + '66',
  },
  tabEmoji: { fontSize: 13 },
  tabLabel: { fontSize: 12, fontWeight: '500', color: Colors.text.muted },
  tabLabelActive: { color: Colors.accent.primary, fontWeight: '700' },
  // A-053: badge de memórias pendentes na aba Memória — o subtítulo do
  // header já avisa em texto, mas isto é visível sem precisar ler.
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.status.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    zIndex: 1,
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 10 },

  sectionLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  memItem: { padding: 14 },
  memRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  memDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  memContent: { flex: 1, gap: 3 },
  memTitle: { color: Colors.text.primary, fontSize: 14, fontWeight: '600' },
  memBody: { color: Colors.text.muted, fontSize: 13, lineHeight: 18 },
  memConf: { color: Colors.text.muted, fontSize: 12, fontWeight: '500', flexShrink: 0 },

  insightCard: { padding: 16, gap: 10 },
  insightMsg: { color: Colors.text.primary, fontSize: 14, lineHeight: 20 },
  insightSug: { color: Colors.accent.primary, fontSize: 13, fontWeight: '500' },
  insightFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  insightType: { color: Colors.text.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  insightDismiss: { color: Colors.text.muted, fontSize: 12 },

  prefCard: { padding: 0, overflow: 'hidden' },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  prefLabel: { color: Colors.text.secondary, fontSize: 14, width: 120, flexShrink: 0 },
  prefInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    paddingVertical: 4,
    textAlign: 'right',
  },
  prefDivider: { height: 1, backgroundColor: Colors.glass.border, marginHorizontal: 16 },
  learnedEmptyText: { color: Colors.text.muted, fontSize: 13, lineHeight: 18 },

  goalAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  goalAddInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
  },
  goalAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalAddBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  goalCard: { padding: 14, gap: 10 },
  goalTitle: { color: Colors.text.primary, fontSize: 14, fontWeight: '600' },
  goalDescription: { color: Colors.text.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  goalEditInput: {
    color: Colors.text.primary,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.glass.light,
    borderRadius: 8,
  },
  goalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  goalActionText: { color: Colors.text.muted, fontSize: 12, fontWeight: '600' },
  goalActionPrimary: { color: Colors.accent.primary },
  goalActionDanger: { color: Colors.status.error },

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
  emptyText: { color: Colors.text.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
