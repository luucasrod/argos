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
import { useVoice } from '@/hooks/useVoice.web';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Colors } from '@/constants/colors';
import { HOME_SUGGESTIONS, ORB_RING_OUTER } from '@/constants/orb';
import { unlockSpeech } from '@/services/voice/speechUnlock';
import { OpenAppBanner } from '@/components/apps/OpenAppBanner';
import { handleInsightPress } from '@/services/insights/handleInsightPress';

const ORB_SIZE = 164;

function StatusHint({
  voiceSupported,
  isListening,
  status,
  isWakeListening,
  showMicPrompt,
  onActivateVoice,
}: {
  voiceSupported: boolean;
  isListening: boolean;
  status: string;
  isWakeListening: boolean;
  showMicPrompt: boolean;
  onActivateVoice: () => void;
}) {
  if (!voiceSupported && status === 'idle') return null;

  if (isListening) {
    return <Text style={styles.statusHintActive}>Ouvindo — pare de falar para enviar</Text>;
  }
  if (status === 'thinking') {
    return <Text style={styles.statusHintActive}>Pensando...</Text>;
  }
  if (status === 'executing') {
    return <Text style={styles.statusHintActive}>Executando...</Text>;
  }
  if (status === 'speaking') {
    return <Text style={styles.statusHintActive}>Falando...</Text>;
  }
  if (isWakeListening) {
    return <Text style={styles.statusHint}>Diga "Argos" ou toque no orb</Text>;
  }
  if (showMicPrompt) {
    return (
      <Pressable onPress={onActivateVoice} hitSlop={8}>
        <Text style={styles.statusHintLink}>Ativar escuta contínua</Text>
      </Pressable>
    );
  }
  return <Text style={styles.statusHint}>Toque no orb para falar</Text>;
}

export default function HomeScreenWeb() {
  const { sendMessage, status, confirmPendingAction, cancelPendingAction } = useArgos();
  const { showExecutionOverlay, executionSteps, confirmationRequest } = useAIStore();
  const { getActiveInsights, dismissInsight } = useMemoryStore();
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
    isWakeListening,
    transcript,
    error: voiceError,
    startListening,
    stopListening,
    startWakeWordDetection,
    isSupported: voiceSupported,
  } = useVoice({ onAutoSend: handleVoiceSend });

  const { settings } = useSettingsStore();
  const [micPromptDismissed, setMicPromptDismissed] = useState(false);
  const activatingRef = useRef(false);

  useEffect(() => {
    if (isWakeListening) setMicPromptDismissed(true);
  }, [isWakeListening]);

  const showMicPrompt =
    voiceSupported &&
    settings.autoListen &&
    !isWakeListening &&
    !isListening &&
    status === 'idle' &&
    !micPromptDismissed;

  const handleActivateVoice = useCallback(async () => {
    if (activatingRef.current) return;
    activatingRef.current = true;
    unlockSpeech();
    try {
      const { requestMicPermission } = await import('@/services/voice/micPermission');
      const granted = await requestMicPermission();
      if (granted) {
        void startWakeWordDetection();
      } else {
        setMicPromptDismissed(true);
      }
    } finally {
      activatingRef.current = false;
    }
  }, [startWakeWordDetection]);

  const activeInsights = getActiveInsights();

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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary, Colors.bg.primary]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.headerSafe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Argos</Text>
        </View>
        <StatusHint
          voiceSupported={voiceSupported}
          isListening={isListening}
          status={status}
          isWakeListening={isWakeListening}
          showMicPrompt={showMicPrompt}
          onActivateVoice={handleActivateVoice}
        />
      </SafeAreaView>

      <View style={styles.hero}>
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

        <View style={styles.orbWrap}>
          <OrbCore status={currentStatus} onPress={handleOrbPress} size={ORB_SIZE} />
          <OrbStatus status={currentStatus} compact />

          {isListening && transcript ? (
            <Text style={styles.transcriptText} numberOfLines={2}>
              "{transcript}"
            </Text>
          ) : null}

          {voiceError ? <Text style={styles.errorText}>{voiceError}</Text> : null}
        </View>
      </View>

      <View style={styles.footerDock}>
        {activeInsights.length > 0 && (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Insights</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {activeInsights.map((insight) => (
                <Pressable
                  key={insight.id}
                  onPress={() => handleInsightPress(insight, sendMessage, dismissInsight)}
                >
                  <GlassCard style={styles.insightCard}>
                    <Text style={styles.insightText} numberOfLines={2}>
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
      </View>

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
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    overflow: 'hidden',
  },

  headerSafe: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#C4B5FD',
    letterSpacing: 0.5,
  },
  memoryBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryBtnText: { fontSize: 18 },

  statusHint: {
    color: Colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  statusHintActive: {
    color: Colors.status.listening,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '500',
  },
  statusHintLink: {
    color: '#A78BFA',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  hero: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  orbWrap: {
    alignItems: 'center',
    width: '100%',
    maxWidth: ORB_RING_OUTER + 40,
  },

  transcriptText: {
    color: Colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 16,
    marginTop: 6,
  },
  errorText: {
    color: Colors.status.error,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },

  execBox: {
    position: 'absolute',
    top: 8,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    gap: 4,
    zIndex: 2,
  },
  execTitle: {
    color: Colors.accent.primary,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  execStep: { color: Colors.text.primary, fontSize: 12 },

  footerDock: {
    flexShrink: 0,
    backgroundColor: Colors.bg.elevated,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    paddingTop: 10,
    gap: 8,
  },

  insightsSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  insightCard: {
    padding: 12,
    marginRight: 10,
    width: 220,
    minHeight: 68,
    gap: 4,
  },
  insightText: { color: Colors.text.primary, fontSize: 13, lineHeight: 18 },
  insightSuggestion: { color: '#A78BFA', fontSize: 12, fontWeight: '500' },

  suggestionsSection: {
    paddingHorizontal: 16,
  },
  pill: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  pillText: { color: '#C4B5FD', fontSize: 13, fontWeight: '500' },

  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
