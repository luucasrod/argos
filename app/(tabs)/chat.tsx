import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useAIStore } from '@/stores/useAIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useArgos } from '@/hooks/useArgos';
import { useVoice } from '@/hooks/useVoice';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Colors } from '@/constants/colors';
import { unlockSpeech } from '@/services/voice/speechUnlock';

export default function ChatScreen() {
  const { messages, clearMessages, currentInput, setCurrentInput } = useAIStore();
  const { settings } = useSettingsStore();
  const { sendMessage, status } = useArgos();
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoice();
  const { light, medium } = useHaptic();
  const listRef = useRef<FlatList>(null);

  const handleSend = useCallback(() => {
    if (!currentInput.trim() || status === 'thinking') return;
    medium();
    unlockSpeech();
    sendMessage(currentInput);
    setCurrentInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [currentInput, status, medium, sendMessage, setCurrentInput]);

  const handleVoiceToggle = useCallback(() => {
    light();
    unlockSpeech();
    if (isListening) {
      stopListening();
      if (transcript) {
        sendMessage(transcript);
        setTranscript('');
      }
    } else {
      startListening();
    }
  }, [isListening, transcript, light, stopListening, sendMessage, setTranscript, startListening]);

  const statusLabel =
    status === 'idle'
      ? `${messages.length} mensagens`
      : status === 'thinking'
        ? 'Pensando...'
        : status === 'executing'
          ? 'Executando...'
          : 'Pronto';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{settings.personality.name}</Text>
            <Text style={styles.headerSubtitle}>{statusLabel}</Text>
          </View>
          <Pressable
            onPress={() => {
              medium();
              clearMessages();
            }}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Limpar</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={100}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>Nenhuma conversa ainda</Text>
                <Text style={styles.emptySubtitle}>
                  Fale com {settings.personality.name} por texto ou voz
                </Text>
              </View>
            }
          />

          {isListening && transcript ? (
            <Animated.View entering={FadeInDown} style={styles.liveTranscript}>
              <Text style={styles.liveTranscriptText}>🎙 "{transcript}"</Text>
            </Animated.View>
          ) : null}

          <GlassCard style={styles.inputContainer}>
            <Pressable
              onPress={handleVoiceToggle}
              style={StyleSheet.flatten([
                styles.voiceButton,
                isListening ? styles.voiceButtonActive : {},
              ])}
            >
              <Text style={styles.voiceIcon}>{isListening ? '⏹' : '🎙'}</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder={`Mensagem para ${settings.personality.name}...`}
              placeholderTextColor={Colors.text.muted}
              value={currentInput}
              onChangeText={setCurrentInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline
              maxLength={500}
            />
            <Pressable
              onPress={handleSend}
              style={[styles.sendButton, { opacity: currentInput.trim() ? 1 : 0.3 }]}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </Pressable>
          </GlassCard>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: { color: Colors.text.primary, fontSize: 20, fontWeight: '700' },
  headerSubtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 2 },
  clearButton: {
    backgroundColor: Colors.glass.medium,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: { color: Colors.text.secondary, fontSize: 13 },
  messageList: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  liveTranscript: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.glass.medium,
    borderRadius: 12,
    padding: 10,
  },
  liveTranscriptText: { color: Colors.text.secondary, fontSize: 14, fontStyle: 'italic' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '600' },
  emptySubtitle: {
    color: Colors.text.muted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    margin: 16,
    marginBottom: 8,
    gap: 8,
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glass.heavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonActive: { backgroundColor: Colors.accent.primary },
  voiceIcon: { fontSize: 18 },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 15,
    paddingVertical: 8,
    maxHeight: 120,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
