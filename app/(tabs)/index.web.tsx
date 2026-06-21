import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
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
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Colors } from '@/constants/colors';
import { HOME_SUGGESTIONS } from '@/constants/orb';
import { unlockSpeech } from '@/services/voice/speechUnlock';

export default function HomeScreenWeb() {
  const { sendMessage, status, confirmPendingAction, cancelPendingAction } = useArgos();
  const { messages, showExecutionOverlay, executionSteps, confirmationRequest } = useAIStore();
  const { getActiveInsights } = useMemoryStore();
  const { automations } = useAutomationStore();
  const [textInput, setTextInput] = useState('');
  const chatScrollRef = useRef<ScrollView>(null);

  const recentMessages = messages.slice(-6);

  useEffect(() => {
    if (recentMessages.length > 0) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [recentMessages.length, status]);

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
    setTranscript,
    isSupported: voiceSupported,
  } = useVoice({ onAutoSend: handleVoiceSend });

  const activeInsights = getActiveInsights();
  const recentAutomations = automations.filter((a) => a.runCount > 0).slice(0, 3);

  /* ─── Envio de texto ─── */
  const handleSend = useCallback(() => {
    if (!textInput.trim()) return;
    unlockSpeech();
    sendMessage(textInput);
    setTextInput('');
  }, [textInput, sendMessage]);

  /* ─── Toque no orb ou botão de microfone ─── */
  const handleOrbPress = useCallback(() => {
    unlockSpeech();
    if (isListening) {
      stopListening(true);
    } else {
      startListening();
    }
  }, [isListening, stopListening, startListening]);

  const currentStatus = isListening ? 'listening' : status;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary, Colors.bg.primary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.main}>

          {/* ─── Cabeçalho ─── */}
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

            {/* ─── Sugestões ─── */}
            <View style={styles.suggestions}>
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
          </View>

          {/* ─── Área do Orb ─── */}
          <View style={styles.orbArea}>
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

            <View style={styles.orbSection}>
              <OrbCore status={currentStatus} onPress={handleOrbPress} />
              <OrbStatus status={currentStatus} />

              {isListening && transcript ? (
                <Text style={styles.transcriptText}>"{transcript}"</Text>
              ) : null}

              {voiceError ? (
                <Text style={styles.errorText}>{voiceError}</Text>
              ) : null}
            </View>

            {recentMessages.length > 0 && (
              <ScrollView
                ref={chatScrollRef}
                style={styles.chatFeed}
                contentContainerStyle={styles.chatFeedContent}
                showsVerticalScrollIndicator={false}
              >
                {recentMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </ScrollView>
            )}
          </View>

          {/* ─── Insights ─── */}
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
                      <Text style={styles.insightText}>{insight.message}</Text>
                      {insight.suggestion && (
                        <Text style={styles.insightSuggestion}>{insight.suggestion} →</Text>
                      )}
                    </GlassCard>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ─── Ações rápidas ─── */}
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
                      <Text style={styles.quickName}>{auto.name}</Text>
                      <Text style={styles.quickCount}>{auto.runCount}x</Text>
                    </GlassCard>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ─── Input inferior ─── */}
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

      {/* ─── Modal de Confirmação (Modo Assistido) ─── */}
      <Modal
        visible={!!confirmationRequest}
        transparent
        animationType="fade"
        onRequestClose={cancelPendingAction}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Ícone + título */}
            <Text style={styles.modalIcon}>{confirmationRequest?.icon ?? '🤖'}</Text>
            <Text style={styles.modalTitle}>Confirmar ação</Text>

            {/* Ação principal */}
            <Text style={styles.modalActionLabel}>{confirmationRequest?.actionLabel}</Text>

            {/* Descrição */}
            <Text style={styles.modalDesc}>{confirmationRequest?.description}</Text>

            {/* Botões */}
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelBtn} onPress={cancelPendingAction}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={confirmPendingAction}>
                <Text style={styles.modalConfirmText}>✓ Confirmar</Text>
              </Pressable>
            </View>

            {/* Dica */}
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
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  main: { flex: 1 },

  topSection: { flexShrink: 0, paddingHorizontal: 24 },
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
    marginBottom: 2,
  },
  wakeHintActive: {
    color: Colors.status.listening,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
  },

  suggestions: { marginTop: 10, marginBottom: 8 },
  pill: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
  },
  pillText: { color: '#C4B5FD', fontSize: 14, fontWeight: '500' },

  orbArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  orbSection: { alignItems: 'center' },
  chatFeed: {
    width: '100%',
    maxHeight: 220,
    marginTop: 16,
  },
  chatFeedContent: {
    paddingBottom: 8,
  },
  transcriptText: {
    color: Colors.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 32,
    marginTop: 12,
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
    marginBottom: 16,
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

  insightsSection: { paddingHorizontal: 24, paddingBottom: 16, flexShrink: 0 },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  insightCard: { padding: 14, marginRight: 12, width: 220, gap: 6 },
  insightText: { color: Colors.text.primary, fontSize: 14, lineHeight: 20 },
  insightSuggestion: { color: '#A78BFA', fontSize: 13, fontWeight: '500' },

  quickActions: { paddingHorizontal: 24, paddingBottom: 8, flexShrink: 0 },
  quickGrid: { flexDirection: 'row', gap: 12 },
  quickBtn: { flex: 1 },
  quickCard: { padding: 14, alignItems: 'center', gap: 6 },
  quickEmoji: { fontSize: 24 },
  quickName: { color: Colors.text.primary, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  quickCount: { color: Colors.text.muted, fontSize: 11 },

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

  // ─── Modal de Confirmação ───
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
