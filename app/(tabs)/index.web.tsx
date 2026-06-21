import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { OrbCore } from '@/components/orb/OrbCore';
import { OrbStatus } from '@/components/orb/OrbStatus';
import { GlassCard } from '@/components/ui/GlassCard';
import { useArgos } from '@/hooks/useArgos';
import { useAIStore } from '@/stores/useAIStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useVoice } from '@/hooks/useVoice.web';
import { Colors } from '@/constants/colors';
import { HOME_SUGGESTIONS } from '@/constants/orb';
import { unlockSpeech } from '@/services/voice/speechUnlock';
import { OpenAppBanner } from '@/components/apps/OpenAppBanner';

export default function HomeScreenWeb() {
  const { width, height } = useWindowDimensions();
  const compact = height < 740 || width < 390;

  const { sendMessage, status, confirmPendingAction, cancelPendingAction } = useArgos();
  const { showExecutionOverlay, executionSteps, confirmationRequest } = useAIStore();
  const { getActiveInsights } = useMemoryStore();
  const { automations } = useAutomationStore();
  const [textInput, setTextInput] = useState('');

  const handleVoiceSend = useCallback(
    (text: string) => {
      unlockSpeech();
      sendMessage(text);
    },
    [sendMessage]
  );

  const {
    isListening,
    transcript,
    error: voiceError,
    startListening,
    stopListening,
    isSupported: voiceSupported,
  } = useVoice({ onAutoSend: handleVoiceSend });

  const activeInsights = getActiveInsights();
  const recentAutomations = automations.filter((a) => a.runCount > 0).slice(0, 3);
  const hasBottomPanel = activeInsights.length > 0 || recentAutomations.length > 0;

  const handleSend = useCallback(() => {
    if (!textInput.trim()) return;
    unlockSpeech();
    sendMessage(textInput);
    setTextInput('');
  }, [textInput, sendMessage]);

  const handleOrbPress = useCallback(() => {
    unlockSpeech();
    if (isListening) {
      stopListening(true);
    } else {
      startListening();
    }
  }, [isListening, stopListening, startListening]);

  const currentStatus = isListening ? 'listening' : status;
  const orbSize = compact ? 136 : 164;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary, Colors.bg.primary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.main}>
          <View style={styles.topSection}>
            <View style={styles.header}>
              <Text style={styles.greeting}>Argos</Text>
              <Pressable onPress={() => router.push('/(modals)/memory')} style={styles.memoryBtn}>
                <Text style={styles.memoryBtnText}>🧠</Text>
              </Pressable>
            </View>

            {voiceSupported && !isListening && status === 'idle' && (
              <Text style={styles.wakeHint}>🎙 Toque no orb para falar</Text>
            )}
            {isListening && (
              <Text style={styles.wakeHintActive}>🔴 Ouvindo... Pare de falar para enviar</Text>
            )}
            {status === 'thinking' && !isListening && (
              <Text style={styles.wakeHintActive}>🧠 Pensando...</Text>
            )}
            {status === 'executing' && (
              <Text style={styles.wakeHintActive}>⚡ Executando...</Text>
            )}
            {status === 'speaking' && (
              <Text style={styles.wakeHintActive}>🔊 Falando...</Text>
            )}
          </View>

          <View style={[styles.orbArea, compact && styles.orbAreaCompact]}>
            {showExecutionOverlay && executionSteps.length > 0 && (
              <View style={styles.execBox}>
                <Text style={styles.execTitle}>Executando ações</Text>
                {executionSteps.map((s, i) => (
                  <Text key={i} style={styles.execStep}>
                    {s.status === 'pending' ? '⏳' : s.status === 'running' ? '⚡' : s.status === 'success' ? '✅' : '❌'}{' '}
                    {s.label}
                  </Text>
                ))}
              </View>
            )}

            <View style={[styles.orbSection, compact && styles.orbSectionCompact]}>
              <OrbCore status={currentStatus} onPress={handleOrbPress} size={orbSize} />
              <OrbStatus status={currentStatus} />

              {isListening && transcript ? (
                <Text style={styles.transcriptText} numberOfLines={2}>
                  "{transcript}"
                </Text>
              ) : null}

              {voiceError ? (
                <Text style={styles.errorText}>{voiceError}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.suggestionsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {HOME_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion.label}
                  style={styles.pill}
                  onPress={() => {
                    unlockSpeech();
                    sendMessage(suggestion.message);
                  }}
                >
                  <Text style={styles.pillText}>{suggestion.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {hasBottomPanel ? (
            <View style={styles.bottomPanel}>
              {activeInsights.length > 0 && (
                <View style={styles.insightsSection}>
                  <Text style={styles.sectionTitle}>Insights</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {activeInsights.map((insight) => (
                      <Pressable
                        key={insight.id}
                        onPress={() => insight.suggestion && sendMessage(insight.suggestion)}
                      >
                        <GlassCard style={styles.insightCard}>
                          <Text style={styles.insightText} numberOfLines={3}>
                            {insight.message}
                          </Text>
                          {insight.suggestion ? (
                            <Text style={styles.insightSuggestion} numberOfLines={1}>
                              {insight.suggestion} →
                            </Text>
                          ) : null}
                        </GlassCard>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {recentAutomations.length > 0 && (
                <View style={styles.quickActions}>
                  <Text style={styles.sectionTitle}>Ações Rápidas</Text>
                  <View style={styles.quickGrid}>
                    {recentAutomations.map((auto) => (
                      <Pressable
                        key={auto.id}
                        style={styles.quickBtn}
                        onPress={() => sendMessage(auto.name)}
                      >
                        <GlassCard style={styles.quickCard}>
                          <Text style={styles.quickEmoji}>{auto.emoji}</Text>
                          <Text style={styles.quickName} numberOfLines={2}>
                            {auto.name}
                          </Text>
                          <Text style={styles.quickCount}>{auto.runCount}x</Text>
                        </GlassCard>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Mensagem para Argos..."
            placeholderTextColor={Colors.text.muted}
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={handleSend}
          />
          <Pressable
            style={[styles.micBtn, isListening && styles.micBtnActive]}
            onPress={handleOrbPress}
          >
            <Text style={styles.micBtnText}>{isListening ? '⏹' : '🎙'}</Text>
          </Pressable>
          <Pressable style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <OpenAppBanner />

      <Modal
        visible={!!confirmationRequest}
        transparent
        animationType="fade"
        onRequestClose={cancelPendingAction}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>{confirmationRequest?.icon ?? '🤖'}</Text>
            <Text style={styles.modalTitle}>Confirmar ação</Text>
            <Text style={styles.modalActionLabel}>{confirmationRequest?.actionLabel}</Text>
            <Text style={styles.modalDesc}>{confirmationRequest?.description}</Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelBtn} onPress={cancelPendingAction}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={confirmPendingAction}>
                <Text style={styles.modalConfirmText}>✓ Confirmar</Text>
              </Pressable>
            </View>
            <Text style={styles.modalHint}>
              Modo assistido ativo — configure em Configurações
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary, overflow: 'hidden' },
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  main: { flex: 1, overflow: 'hidden', backgroundColor: Colors.bg.primary },

  topSection: {
    flexShrink: 0,
    paddingHorizontal: 24,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  greeting: { fontSize: 26, fontWeight: '700', color: '#C4B5FD', letterSpacing: 0.5 },
  memoryBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryBtnText: { fontSize: 20 },

  wakeHint: {
    color: Colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  wakeHintActive: {
    color: Colors.status.listening,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },

  orbArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    minHeight: 236,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
  },
  orbAreaCompact: {
    minHeight: 200,
    paddingVertical: 4,
  },
  orbSection: { alignItems: 'center', width: '100%' },
  orbSectionCompact: { transform: [{ scale: 0.82 }] },

  transcriptText: {
    color: Colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 32,
    marginTop: 10,
  },
  errorText: {
    color: Colors.status.error,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
  },

  execBox: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    width: '100%',
    gap: 8,
  },
  execTitle: {
    color: Colors.accent.primary,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  execStep: { color: Colors.text.primary, fontSize: 14 },

  suggestionsSection: {
    flexShrink: 0,
    paddingLeft: 24,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: Colors.bg.primary,
  },
  pill: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 10,
  },
  pillText: { color: '#C4B5FD', fontSize: 13, fontWeight: '500' },

  bottomPanel: {
    flexShrink: 0,
    backgroundColor: Colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 10,
  },
  insightsSection: { paddingHorizontal: 24, paddingBottom: 10 },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  insightCard: { padding: 14, marginRight: 12, width: 220, minHeight: 88, gap: 6 },
  insightText: { color: Colors.text.primary, fontSize: 14, lineHeight: 20 },
  insightSuggestion: { color: '#A78BFA', fontSize: 13, fontWeight: '500' },

  quickActions: { paddingHorizontal: 24, paddingBottom: 10 },
  quickGrid: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  quickBtn: { flex: 1, minWidth: 0 },
  quickCard: {
    flex: 1,
    height: 100,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickEmoji: { fontSize: 22, lineHeight: 28, height: 28 },
  quickName: {
    color: Colors.text.primary,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
    width: '100%',
  },
  quickCount: { color: Colors.text.muted, fontSize: 10 },

  inputRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    backgroundColor: Colors.bg.elevated,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 16,
    padding: 12,
    backgroundColor: Colors.glass.light,
    borderRadius: 12,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.glass.heavy,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: Colors.status.listening,
    borderColor: Colors.status.listening,
  },
  micBtnText: { fontSize: 20 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1A1035',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
    gap: 12,
  },
  modalIcon: { fontSize: 40 },
  modalTitle: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modalActionLabel: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalDesc: {
    color: Colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  modalCancelText: { color: Colors.text.secondary, fontWeight: '600', fontSize: 15 },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalHint: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
