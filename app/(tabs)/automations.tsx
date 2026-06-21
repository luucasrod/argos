import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useAutomationStore } from '@/stores/useAutomationStore';
import { useArgos } from '@/hooks/useArgos';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Automation } from '@/types/automation.types';

function automationCardStyle(isActive: boolean) {
  return StyleSheet.flatten([
    styles.automationCard,
    !isActive ? styles.automationCardInactive : {},
  ]);
}

function AutomationCard({
  automation,
  onToggle,
  onPress,
}: {
  automation: Automation;
  onToggle: () => void;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={automationCardStyle(automation.isActive)}>
        <View style={styles.automationHeader}>
          <Text style={styles.automationEmoji}>{automation.emoji}</Text>
          <View style={styles.automationTextCol}>
            <Text style={styles.automationName} numberOfLines={1}>
              {automation.name}
            </Text>
            <Text style={styles.automationDesc} numberOfLines={2} ellipsizeMode="tail">
              {automation.description}
            </Text>
          </View>
          <View style={styles.automationSwitch}>
            <Switch
              value={automation.isActive}
              onValueChange={onToggle}
              trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
        <View style={styles.automationFooter}>
          <Text style={styles.automationTrigger} numberOfLines={1}>
            ⚡ {automation.trigger.label}
          </Text>
          {automation.runCount > 0 ? (
            <Text style={styles.automationCount}>{automation.runCount}x executado</Text>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}

export default function AutomationsScreen() {
  const { automations, routines, toggleAutomation, toggleRoutine } = useAutomationStore();
  const { sendMessage } = useArgos();
  const { light, medium } = useHaptic();

  const [createInput, setCreateInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'automations' | 'routines'>('automations');

  const presetAutos = automations.filter((a) => a.isPreset);
  const customAutos = automations.filter((a) => !a.isPreset);

  const handleCreateAI = useCallback(async () => {
    if (!createInput.trim()) return;
    medium();
    setIsCreating(true);
    await sendMessage(`Crie uma automação: ${createInput}`);
    setCreateInput('');
    setIsCreating(false);
  }, [createInput, medium, sendMessage]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>Automações</Text>
                <Text style={styles.subtitle}>
                  {automations.filter((a) => a.isActive).length} ativas
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  light();
                  router.push('/(modals)/create-automation');
                }}
                style={styles.addButton}
              >
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150)} style={styles.tabs}>
            {(['automations', 'routines'] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => {
                  light();
                  setActiveTab(tab);
                }}
                style={StyleSheet.flatten([styles.tab, activeTab === tab ? styles.tabActive : {}])}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.tabText,
                    activeTab === tab ? styles.tabTextActive : {},
                  ])}
                >
                  {tab === 'automations' ? '⚡ Automações' : '🔄 Rotinas'}
                </Text>
              </Pressable>
            ))}
          </Animated.View>

          {activeTab === 'automations' && (
            <>
              <Animated.View entering={FadeInDown.delay(200)} style={styles.createSection}>
                <Text style={styles.sectionTitle}>Criar com IA</Text>
                <GlassCard style={styles.createCard} borderColor={Colors.glass.borderAccent}>
                  <Text style={styles.createLabel}>Descreva o que você quer automatizar</Text>
                  <TextInput
                    style={styles.createInput}
                    placeholder="Ex: Ao conectar no Bluetooth do carro, abrir o Spotify"
                    placeholderTextColor={Colors.text.muted}
                    value={createInput}
                    onChangeText={setCreateInput}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <Pressable
                    onPress={handleCreateAI}
                    style={StyleSheet.flatten([
                      styles.createButton,
                      isCreating ? styles.createButtonLoading : {},
                    ])}
                    disabled={isCreating || !createInput.trim()}
                  >
                    <Text style={styles.createButtonText}>
                      {isCreating ? 'Criando...' : '✨ Criar Automação'}
                    </Text>
                  </Pressable>
                </GlassCard>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
                <Text style={styles.sectionTitle}>Prontas</Text>
                {presetAutos.map((auto, i) => (
                  <Animated.View key={auto.id} entering={FadeInRight.delay(350 + i * 50)} style={styles.cardWrap}>
                    <AutomationCard
                      automation={auto}
                      onToggle={() => {
                        light();
                        toggleAutomation(auto.id);
                      }}
                      onPress={() => {}}
                    />
                  </Animated.View>
                ))}
              </Animated.View>

              {customAutos.length > 0 && (
                <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
                  <Text style={styles.sectionTitle}>Criadas por você</Text>
                  {customAutos.map((auto, i) => (
                    <Animated.View key={auto.id} entering={FadeInRight.delay(450 + i * 50)} style={styles.cardWrap}>
                      <AutomationCard
                        automation={auto}
                        onToggle={() => {
                          light();
                          toggleAutomation(auto.id);
                        }}
                        onPress={() => {}}
                      />
                    </Animated.View>
                  ))}
                </Animated.View>
              )}
            </>
          )}

          {activeTab === 'routines' && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
              {routines.map((routine, i) => (
                <Animated.View key={routine.id} entering={FadeInRight.delay(250 + i * 50)} style={styles.cardWrap}>
                  <Pressable
                    onPress={() => {
                      light();
                      sendMessage(`Executar rotina ${routine.name}`);
                    }}
                  >
                    <GlassCard style={styles.routineCard}>
                      <View style={styles.routineHeader}>
                        <Text style={styles.routineEmoji}>{routine.emoji}</Text>
                        <View style={styles.routineTextCol}>
                          <Text style={styles.routineName} numberOfLines={1}>
                            {routine.name}
                          </Text>
                          <Text style={styles.routineDesc} numberOfLines={2} ellipsizeMode="tail">
                            {routine.description}
                          </Text>
                        </View>
                        <View style={styles.routineSwitch}>
                          <Switch
                            value={routine.isActive}
                            onValueChange={() => {
                              light();
                              toggleRoutine(routine.id);
                            }}
                            trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                      </View>
                      <View style={styles.routineSteps}>
                        {routine.steps.map((step, j) => (
                          <View key={j} style={styles.routineStep}>
                            <View style={styles.routineStepDot} />
                            <Text style={styles.routineStepLabel} numberOfLines={1}>
                              {step.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </GlassCard>
                  </Pressable>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary, overflow: 'hidden' },
  safe: { flex: 1 },
  scroll: { paddingBottom: 100 },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: Colors.text.primary, fontSize: 28, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 14, marginTop: 4 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 24, fontWeight: '300' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 20,
    backgroundColor: Colors.glass.light,
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: Colors.glass.heavy },
  tabText: { color: Colors.text.muted, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: Colors.text.primary, fontWeight: '600' },
  createSection: { paddingHorizontal: 24, marginBottom: 24 },
  sectionTitle: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  createCard: { padding: 16 },
  createLabel: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
  },
  createInput: {
    color: Colors.text.primary,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 88,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  createButton: {
    backgroundColor: Colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createButtonLoading: { opacity: 0.6 },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  section: { paddingHorizontal: 24, marginBottom: 24 },
  cardWrap: { marginBottom: 10 },
  automationCard: { padding: 14, gap: 10 },
  automationCardInactive: { opacity: 0.5 },
  automationHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  automationEmoji: {
    fontSize: 28,
    width: 40,
    lineHeight: 32,
    textAlign: 'center',
    flexShrink: 0,
  },
  automationTextCol: { flex: 1, minWidth: 0, paddingRight: 8 },
  automationSwitch: { flexShrink: 0, paddingTop: 2 },
  automationName: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  automationDesc: { color: Colors.text.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  automationFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  automationTrigger: { color: Colors.text.muted, fontSize: 12, flex: 1 },
  automationCount: { color: Colors.accent.primary, fontSize: 12, fontWeight: '500', flexShrink: 0 },
  routineCard: { padding: 16, gap: 12 },
  routineHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  routineEmoji: {
    fontSize: 28,
    width: 40,
    lineHeight: 32,
    textAlign: 'center',
    flexShrink: 0,
  },
  routineTextCol: { flex: 1, minWidth: 0, paddingRight: 8 },
  routineSwitch: { flexShrink: 0, paddingTop: 2 },
  routineName: { color: Colors.text.primary, fontSize: 16, fontWeight: '600' },
  routineDesc: { color: Colors.text.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  routineSteps: { gap: 8, paddingLeft: 8 },
  routineStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routineStepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent.primary },
  routineStepLabel: { color: Colors.text.secondary, fontSize: 13, flex: 1 },
});
