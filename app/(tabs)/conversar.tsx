import React, { useRef, useCallback, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';

import { useAIStore } from '@/stores/useAIStore';
import { useArgos } from '@/hooks/useArgos';
import { useVoice } from '@/hooks/useVoice';
import { useHaptic } from '@/hooks/useHaptic';
import { GlassCard } from '@/components/ui/GlassCard';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Colors } from '@/constants/colors';
import { unlockSpeech } from '@/services/voice/speechUnlock';

export default function ConversarScreen() {
  const { messages, clearMessages, currentInput, setCurrentInput, setLastInputMode } = useAIStore();
  const { sendMessage, status } = useArgos();
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoice();
  const { light, medium } = useHaptic();
  const listRef = useRef<FlatList>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');

  const handleSend = useCallback(() => {
    if (!currentInput.trim() || status === 'thinking') return;
    medium();
    unlockSpeech();
    setLastInputMode('text');
    setInputMode('text');
    sendMessage(currentInput);
    setCurrentInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [currentInput, status, medium, sendMessage, setCurrentInput, setLastInputMode]);

  const handleVoiceToggle = useCallback(() => {
    light();
    unlockSpeech();
    if (isListening) {
      stopListening();
      if (transcript) {
        setLastInputMode('voice');
        setInputMode('voice');
        sendMessage(transcript);
        setTranscript('');
      }
    } else {
      startListening();
    }
  }, [isListening, transcript, light, stopListening, sendMessage, setTranscript, startListening, setLastInputMode]);

  const statusLabel =
    status === 'idle'
      ? `${messages.length} mensagem${messages.length !== 1 ? 's' : ''}`
      : status === 'thinking'
        ? 'Pensando...'
        : status === 'executing'
          ? 'Executando...'
          : status === 'speaking'
            ? 'Falando...'
            : 'Pronto';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Conversar</Text>
              <Text style={styles.headerSub}>{statusLabel}</Text>
            </View>
            <Pressable
              onPress={() => { medium(); clearMessages(); }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Limpar</Text>
            </Pressable>
          </View>

          {isListening && (
            <View style={styles.listeningBanner}>
              <Text style={styles.listeningDot}>●</Text>
              <Text style={styles.listeningText}>
                {transcript ? `"${transcript}"` : 'Ouvindo...'}
              </Text>
            </View>
          )}

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyText}>Diga algo ou escreva abaixo</Text>
              </View>
            }
          />

          <GlassCard style={styles.inputCard} borderColor={Colors.glass.border}>
            <View style={styles.modeIndicator}>
              <Text style={[styles.modeText, inputMode === 'text' && styles.modeActive]}>⌨ Texto</Text>
              <Text style={styles.modeSep}>·</Text>
              <Text style={[styles.modeText, inputMode === 'voice' && styles.modeActive]}>🎙 Voz</Text>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Mensagem..."
                placeholderTextColor={Colors.text.muted}
                value={currentInput}
                onChangeText={setCurrentInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                multiline={false}
                onFocus={() => setInputMode('text')}
              />
              <Pressable
                style={[styles.micBtn, isListening && styles.micBtnActive]}
                onPress={handleVoiceToggle}
              >
                <Text style={styles.micIcon}>{isListening ? '⏹' : '🎙'}</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, { opacity: currentInput.trim() ? 1 : 0.35 }]}
                onPress={handleSend}
                disabled={!currentInput.trim() || status === 'thinking'}
              >
                <Text style={styles.sendIcon}>↑</Text>
              </Pressable>
            </View>
          </GlassCard>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  keyboard: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  headerTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700' },
  headerSub: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.glass.medium,
  },
  clearBtnText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '500' },

  listeningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.status.listening + '15',
    borderBottomWidth: 1,
    borderBottomColor: Colors.status.listening + '30',
  },
  listeningDot: { color: Colors.status.listening, fontSize: 10 },
  listeningText: { color: Colors.status.listening, fontSize: 13, fontStyle: 'italic', flex: 1 },

  list: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: Colors.text.muted, fontSize: 14 },

  inputCard: {
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 8 : 20,
    gap: 6,
  },
  modeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  modeText: { color: Colors.text.muted, fontSize: 11, fontWeight: '500' },
  modeSep: { color: Colors.text.muted, fontSize: 11 },
  modeActive: { color: Colors.accent.primary, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: Colors.glass.light,
    borderRadius: 10,
    minHeight: 42,
  },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.glass.heavy,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: Colors.status.listening + '30',
    borderColor: Colors.status.listening,
  },
  micIcon: { fontSize: 18 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
