import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, SlideInDown } from 'react-native-reanimated';
import { router } from 'expo-router';

const isWeb = Platform.OS === 'web';
const enter = {
  down: (ms = 0) => (isWeb ? undefined : FadeInDown.delay(ms)),
  up: (ms = 0) => (isWeb ? undefined : FadeInUp.delay(ms)),
  slide: isWeb ? undefined : SlideInDown.springify(),
  downPlain: isWeb ? undefined : FadeInDown,
};

import { OrbCore } from '@/components/orb/OrbCore';
import { OrbStatus } from '@/components/orb/OrbStatus';
import { GlassCard } from '@/components/ui/GlassCard';
import { useArgos } from '@/hooks/useArgos';
import { useAIStore } from '@/stores/useAIStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useVoice } from '@/hooks/useVoice';
import { useHaptic } from '@/hooks/useHaptic';
import { Colors } from '@/constants/colors';
import { HOME_SUGGESTIONS } from '@/constants/orb';

export default function HomeScreen() {
  const { sendMessage, status } = useArgos();
  const { showExecutionOverlay, executionSteps } = useAIStore();
  const { getActiveInsights } = useMemoryStore();
  const { automations } = useAutomationStore();
  const handleVoiceSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoice({
    onAutoSend: handleVoiceSend,
  });
  const { light, medium } = useHaptic();

  const [textInput, setTextInput] = useState('');
  const [isInputFocused, setInputFocused] = useState(false);

  const activeInsights = getActiveInsights();
  const recentAutomations = automations.filter((a) => a.runCount > 0).slice(0, 3);
  const handleOrbPress = useCallback(() => {
    light();
    if (isListening) {
      stopListening(true);
    } else {
      startListening();
    }
  }, [isListening, light, stopListening, startListening]);

  const handleSend = useCallback(() => {
    if (!textInput.trim()) return;
    medium();
    sendMessage(textInput);
    setTextInput('');
  }, [textInput, medium, sendMessage]);

  const handleSuggestion = useCallback(
    (text: string) => {
      light();
      sendMessage(text);
    },
    [light, sendMessage]
  );

  const inputCardStyle = StyleSheet.flatten([
    styles.inputCard,
    isInputFocused ? { borderColor: Colors.glass.borderAccent } : {},
  ]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary, Colors.bg.primary]}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.main}>
            <View style={styles.topSection}>
              <Animated.View entering={enter.down(100)} style={styles.header}>
                <Text style={styles.greeting}>Argos</Text>
                <Pressable
                  onPress={() => router.push('/(modals)/memory')}
                  style={styles.memoryButton}
                >
                  <Text style={styles.memoryButtonText}>🧠</Text>
                </Pressable>
              </Animated.View>

              <Animated.View entering={enter.down(150)} style={styles.suggestions}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {HOME_SUGGESTIONS.map((suggestion) => (
                    <Pressable
                      key={suggestion.label}
                      onPress={() => handleSuggestion(suggestion.message)}
                      style={styles.suggestionPill}
                    >
                      <Text style={styles.suggestionText}>{suggestion.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Animated.View>
            </View>

            <View style={styles.orbArea}>
              {showExecutionOverlay && executionSteps.length > 0 && (
                <Animated.View entering={enter.slide} style={styles.executionContainer}>
                  <GlassCard style={styles.executionCard} borderColor={Colors.glass.borderAccent}>
                    <Text style={styles.executionTitle}>Executando ações</Text>
                    {executionSteps.map((step, i) => (
                      <View key={i} style={styles.executionStep}>
                        <Text style={styles.executionStepIcon}>
                          {step.status === 'pending'
                            ? '⏳'
                            : step.status === 'running'
                              ? '⚡'
                              : step.status === 'success'
                                ? '✅'
                                : '❌'}
                        </Text>
                        <Text
                          style={[
                            styles.executionStepLabel,
                            {
                              color:
                                step.status === 'success'
                                  ? Colors.status.success
                                  : step.status === 'error'
                                    ? Colors.status.error
                                    : Colors.text.primary,
                            },
                          ]}
                        >
                          {step.label}
                        </Text>
                      </View>
                    ))}
                  </GlassCard>
                </Animated.View>
              )}

              <Animated.View entering={enter.down(300)} style={styles.orbContainer}>
                <OrbCore
                  status={isListening ? 'listening' : status}
                  onPress={handleOrbPress}
                  onLongPress={() => {
                    medium();
                    startListening();
                  }}
                />
                <OrbStatus status={isListening ? 'listening' : status} />
                {isListening && transcript ? (
                  <Animated.Text entering={enter.downPlain} style={styles.transcriptText}>
                    "{transcript}"
                  </Animated.Text>
                ) : null}
              </Animated.View>
            </View>

            {activeInsights.length > 0 && (
              <Animated.View entering={enter.down(350)} style={styles.insightsSection}>
                <Text style={styles.sectionTitle}>Insights</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {activeInsights.map((insight) => (
                    <Pressable
                      key={insight.id}
                      onPress={() => insight.suggestion && handleSuggestion(insight.suggestion)}
                    >
                      <GlassCard style={styles.insightCard}>
                        <Text style={styles.insightText}>{insight.message}</Text>
                        {insight.suggestion && (
                          <Text style={styles.insightSuggestion}>{insight.suggestion} →</Text>
                        )}
                      </GlassCard>
                    </Pressable>
                  ))}
                </ScrollView>
              </Animated.View>
            )}

            {recentAutomations.length > 0 && (
              <Animated.View entering={enter.down(400)} style={styles.quickActions}>
                <Text style={styles.sectionTitle}>Ações Rápidas</Text>
                <View style={styles.quickActionsGrid}>
                  {recentAutomations.map((auto) => (
                    <Pressable
                      key={auto.id}
                      style={styles.quickActionButton}
                      onPress={() => handleSuggestion(auto.name)}
                    >
                      <GlassCard style={styles.quickActionCard}>
                        <Text style={styles.quickActionEmoji}>{auto.emoji}</Text>
                        <Text style={styles.quickActionName}>{auto.name}</Text>
                        <Text style={styles.quickActionCount}>{auto.runCount}x</Text>
                      </GlassCard>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}
          </View>

          <Animated.View entering={enter.up(300)} style={styles.inputContainer}>
            <GlassCard
              style={inputCardStyle}
              borderColor={isInputFocused ? Colors.glass.borderAccent : Colors.glass.border}
            >
              <TextInput
                style={styles.input}
                placeholder="Digite uma mensagem ou comando..."
                placeholderTextColor={Colors.text.muted}
                value={textInput}
                onChangeText={setTextInput}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                multiline={false}
              />
              <Pressable
                onPress={handleSend}
                style={[styles.sendButton, { opacity: textInput.trim() ? 1 : 0.3 }]}
              >
                <Text style={styles.sendIcon}>↑</Text>
              </Pressable>
            </GlassCard>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  main: { flex: 1 },
  topSection: { flexShrink: 0 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  greeting: { fontSize: 26, fontWeight: '700', color: '#C4B5FD', letterSpacing: 0.5 },
  memoryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glass.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryButtonText: { fontSize: 20 },
  orbArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptText: {
    marginTop: 12,
    color: Colors.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    fontStyle: 'italic',
  },
  executionContainer: { width: '100%', marginBottom: 16 },
  executionCard: { padding: 16, gap: 10 },
  executionTitle: {
    color: Colors.accent.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  executionStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  executionStepIcon: { fontSize: 16 },
  executionStepLabel: { fontSize: 14, flex: 1 },
  insightsSection: { paddingLeft: 24, paddingBottom: 16, flexShrink: 0 },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingRight: 24,
  },
  insightCard: { padding: 14, marginRight: 12, width: 220, gap: 6 },
  insightText: { color: Colors.text.primary, fontSize: 14, lineHeight: 20 },
  insightSuggestion: { color: '#A78BFA', fontSize: 13, fontWeight: '500' },
  quickActions: { paddingHorizontal: 24, paddingBottom: 8, flexShrink: 0 },
  quickActionsGrid: { flexDirection: 'row', gap: 12 },
  quickActionButton: { flex: 1 },
  quickActionCard: { padding: 14, alignItems: 'center', gap: 6 },
  quickActionEmoji: { fontSize: 24 },
  quickActionName: { color: Colors.text.primary, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  quickActionCount: { color: Colors.text.muted, fontSize: 11 },
  suggestions: { paddingLeft: 24, marginTop: 12, marginBottom: 8 },
  suggestionPill: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
  },
  suggestionText: { color: '#C4B5FD', fontSize: 14, fontWeight: '500' },
  inputContainer: { padding: 16, paddingBottom: 32 },
  inputCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  input: { flex: 1, color: Colors.text.primary, fontSize: 16, paddingVertical: 12, minHeight: 44 },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
