import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Modal,
  TextInput,
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
  { key: 'hoje',       label: 'Hoje',       emoji: '☀️' },
  { key: 'calendario', label: 'Calendário', emoji: '📅' },
  { key: 'lembretes',  label: 'Lembretes',  emoji: '🔔' },
  { key: 'rotinas',    label: 'Rotinas',    emoji: '🔄' },
];

const DAYS_PT   = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface Reminder { id: string; text: string; time: string; }

export default function AgendaScreen() {
  const [activeTab, setActiveTab] = useState('hoje');
  const { routines, toggleRoutine } = useAutomationStore();
  const { sendMessage } = useArgos();
  const { light, medium } = useHaptic();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [reminderTime, setReminderTime] = useState('');

  const now = new Date();
  const dayName   = DAYS_PT[now.getDay()];
  const dayNum    = now.getDate();
  const monthName = MONTHS_PT[now.getMonth()];
  const year      = now.getFullYear();

  const handleAddReminder = () => {
    if (!reminderText.trim()) return;
    medium();
    const newReminder: Reminder = {
      id: `rem-${Date.now()}`,
      text: reminderText.trim(),
      time: reminderTime.trim() || '',
    };
    setReminders((r) => [...r, newReminder]);
    // Envia para o Argos criar notificação
    sendMessage(`Crie um lembrete: ${reminderText.trim()}${reminderTime ? ` às ${reminderTime}` : ''}`);
    setReminderText('');
    setReminderTime('');
    setShowAddReminder(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'hoje':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Data centralizada */}
            <GlassCard style={styles.dateCard}>
              <Text style={styles.dateDay}>{dayName}</Text>
              <Text style={styles.dateNum}>{dayNum}</Text>
              <Text style={styles.dateMonth}>{monthName} {year}</Text>
            </GlassCard>

            <Text style={styles.sectionLabel}>Eventos de hoje</Text>
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyText}>
                Nenhum evento hoje. Conecte seu Google Calendar em Calendário.
              </Text>
            </View>
          </ScrollView>
        );

      case 'calendario':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <GlassCard style={styles.calendarCard}>
              <Text style={styles.calendarTitle}>📅 Google Calendar</Text>
              <Text style={styles.calendarDesc}>
                Conecte seu calendário para ver eventos diretamente no Argos
              </Text>
              <Pressable
                style={styles.connectBtn}
                onPress={() => sendMessage('Como conecto meu Google Calendar com o Argos?')}
              >
                <Text style={styles.connectBtnText}>Conectar com Google Calendar</Text>
              </Pressable>
            </GlassCard>
          </ScrollView>
        );

      case 'lembretes':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Pressable onPress={() => { light(); setShowAddReminder(true); }} style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ Criar lembrete</Text>
            </Pressable>

            {reminders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔔</Text>
                <Text style={styles.emptyText}>
                  Nenhum lembrete. Toque em "+ Criar lembrete" ou peça ao Argos.
                </Text>
              </View>
            ) : (
              reminders.map((rem) => (
                <GlassCard key={rem.id} style={styles.reminderCard}>
                  <View style={styles.reminderRow}>
                    <Text style={styles.reminderText}>{rem.text}</Text>
                    <Pressable onPress={() => { light(); setReminders((r) => r.filter((x) => x.id !== rem.id)); }}>
                      <Text style={styles.reminderDelete}>✕</Text>
                    </Pressable>
                  </View>
                  {rem.time ? <Text style={styles.reminderTime}>🕐 {rem.time}</Text> : null}
                </GlassCard>
              ))
            )}
          </ScrollView>
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
                    <Text style={styles.routineDesc} numberOfLines={1}>{routine.description}</Text>
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
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Agenda</Text>
          <Text style={styles.subtitle}>{dayName}, {dayNum} de {monthName}</Text>
        </View>

        <SubTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <View style={styles.content}>{renderContent()}</View>
      </SafeAreaView>

      {/* Modal criar lembrete */}
      <Modal visible={showAddReminder} transparent animationType="fade" onRequestClose={() => setShowAddReminder(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo lembrete</Text>
            <TextInput
              style={styles.modalInput}
              value={reminderText}
              onChangeText={setReminderText}
              placeholder="O que você quer lembrar?"
              placeholderTextColor={Colors.text.muted}
              autoFocus
              multiline
            />
            <TextInput
              style={styles.modalInput}
              value={reminderTime}
              onChangeText={setReminderTime}
              placeholder="Horário (opcional, ex: 14:30)"
              placeholderTextColor={Colors.text.muted}
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setShowAddReminder(false); setReminderText(''); setReminderTime(''); }} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleAddReminder} style={styles.modalConfirmBtn} disabled={!reminderText.trim()}>
                <Text style={styles.modalConfirmText}>Criar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 100, gap: 12 },
  sectionLabel: {
    color: Colors.text.muted, fontSize: 11, fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },

  // Data card — tudo centralizado
  dateCard: {
    padding: 24,
    alignItems: 'center',
    gap: 4,
  },
  dateDay: {
    color: Colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
  },
  dateNum: {
    color: Colors.text.primary,
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 72,
    textAlign: 'center',
  },
  dateMonth: {
    color: Colors.text.secondary,
    fontSize: 16,
    textAlign: 'center',
  },

  // Calendar
  calendarCard: { padding: 24, alignItems: 'center', gap: 14 },
  calendarTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  calendarDesc: { color: Colors.text.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  connectBtn: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.accent.primary, alignItems: 'center', width: '100%',
  },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Lembretes
  addBtn: {
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.accent.primary + '18', borderWidth: 1,
    borderColor: Colors.accent.primary + '44', alignItems: 'center',
  },
  addBtnText: { color: Colors.accent.primary, fontWeight: '600', fontSize: 14 },
  reminderCard: { padding: 14, gap: 6 },
  reminderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reminderText: { color: Colors.text.primary, fontSize: 14, flex: 1, lineHeight: 20 },
  reminderDelete: { color: Colors.status.error, fontSize: 16, fontWeight: '600' },
  reminderTime: { color: Colors.text.muted, fontSize: 12 },

  // Rotinas
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
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.glass.medium, borderWidth: 1,
    borderColor: Colors.glass.border, alignItems: 'center',
  },
  runBtnText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: Colors.text.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: {
    backgroundColor: Colors.bg.elevated, borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 400, gap: 14, borderWidth: 1, borderColor: Colors.glass.border,
  },
  modalTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  modalInput: {
    color: Colors.text.primary, fontSize: 15, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: Colors.glass.light, borderRadius: 10, borderWidth: 1, borderColor: Colors.glass.border,
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.glass.medium, alignItems: 'center' },
  modalCancelText: { color: Colors.text.secondary, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent.primary, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
});
