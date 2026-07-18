import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAutomationStore } from '@/stores/useAutomationStore';
import { useArgos } from '@/hooks/useArgos';
import { useHaptic } from '@/hooks/useHaptic';
import { SubTabBar, SubTab } from '@/components/ui/SubTabBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';

const TABS: SubTab[] = [
  { key: 'hoje', label: 'Hoje', emoji: '☀️' },
  { key: 'calendario', label: 'Calendário', emoji: '📅' },
  { key: 'lembretes', label: 'Lembretes', emoji: '🔔' },
  { key: 'rotinas', label: 'Rotinas', emoji: '🔄' },
];

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function AgendaScreen() {
  const [activeTab, setActiveTab] = useState('hoje');
  const { routines, toggleRoutine } = useAutomationStore();
  const { sendMessage } = useArgos();
  const { light } = useHaptic();

  const now = new Date();
  const dayName = DAYS_PT[now.getDay()];
  const monthName = MONTHS_PT[now.getMonth()];

  const renderContent = () => {
    switch (activeTab) {
      case 'hoje':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <GlassCard style={styles.dateCard}>
              <Text style={styles.dateDay}>{dayName}</Text>
              <Text style={styles.dateNumber}>{now.getDate()}</Text>
              <Text style={styles.dateMonth}>{monthName} {now.getFullYear()}</Text>
            </GlassCard>

            <Text style={styles.sectionLabel}>Eventos de hoje</Text>
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyText}>
                Nenhum evento hoje. Conecte seu Google Calendar em Perfil.
              </Text>
            </View>
          </ScrollView>
        );

      case 'calendario':
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>Calendário</Text>
            <Text style={styles.emptyText}>
              Integração com Google Calendar em breve
            </Text>
            <Pressable
              style={styles.actionBtn}
              onPress={() => sendMessage('Como posso integrar meu calendário com o Argos?')}
            >
              <Text style={styles.actionBtnText}>Saiba mais</Text>
            </Pressable>
          </View>
        );

      case 'lembretes':
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>Lembretes</Text>
            <Text style={styles.emptyText}>
              Peça ao Argos para criar lembretes para você
            </Text>
            <Pressable
              style={styles.actionBtn}
              onPress={() => sendMessage('Crie um lembrete para mim')}
            >
              <Text style={styles.actionBtnText}>Criar lembrete</Text>
            </Pressable>
          </View>
        );

      case 'rotinas':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>
              {routines.filter((r) => r.isActive).length}/{routines.length} ativas
            </Text>
            {routines.map((routine) => (
              <GlassCard key={routine.id} style={styles.routineCard}>
                <View style={styles.routineHeader}>
                  <Text style={styles.routineEmoji}>{routine.emoji}</Text>
                  <View style={styles.routineInfo}>
                    <Text style={styles.routineName}>{routine.name}</Text>
                    <Text style={styles.routineDesc} numberOfLines={1}>
                      {routine.description}
                    </Text>
                  </View>
                  <Switch
                    value={routine.isActive}
                    onValueChange={() => { light(); toggleRoutine(routine.id); }}
                    trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={styles.routineSteps}>
                  {routine.steps.slice(0, 3).map((step, i) => (
                    <View key={i} style={styles.routineStep}>
                      <View style={styles.stepDot} />
                      <Text style={styles.stepLabel} numberOfLines={1}>{step.label}</Text>
                    </View>
                  ))}
                  {routine.steps.length > 3 && (
                    <Text style={styles.stepsMore}>+{routine.steps.length - 3} passos</Text>
                  )}
                </View>
                <Pressable
                  style={styles.runBtn}
                  onPress={() => { light(); sendMessage(`Executar rotina ${routine.name}`); }}
                >
                  <Text style={styles.runBtnText}>▶ Executar agora</Text>
                </Pressable>
              </GlassCard>
            ))}
          </ScrollView>
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
          <Text style={styles.title}>Agenda</Text>
          <Text style={styles.subtitle}>{dayName}, {now.getDate()} de {monthName}</Text>
        </View>

        <SubTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <View style={styles.content}>{renderContent()}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },

  header: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 3 },

  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 12 },
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  dateCard: {
    padding: 20,
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  dateDay: { color: Colors.text.muted, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 2 },
  dateNumber: { color: Colors.text.primary, fontSize: 56, fontWeight: '800', lineHeight: 64 },
  dateMonth: { color: Colors.text.secondary, fontSize: 16 },

  routineCard: { padding: 16, gap: 12 },
  routineHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routineEmoji: { fontSize: 26, width: 34, textAlign: 'center', lineHeight: 32, flexShrink: 0 },
  routineInfo: { flex: 1, gap: 3 },
  routineName: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  routineDesc: { color: Colors.text.muted, fontSize: 12 },
  routineSteps: { gap: 6, paddingLeft: 4 },
  routineStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.accent.primary, flexShrink: 0 },
  stepLabel: { color: Colors.text.secondary, fontSize: 13, flex: 1 },
  stepsMore: { color: Colors.text.muted, fontSize: 12, paddingLeft: 13 },
  runBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
  },
  runBtnText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '600' },

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
  actionBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary + '22',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '55',
  },
  actionBtnText: { color: Colors.accent.primary, fontWeight: '600', fontSize: 14 },
});
