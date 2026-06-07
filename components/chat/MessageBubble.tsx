import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Message } from '@/types/ai.types';
import { Colors } from '@/constants/colors';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Animated.View
      entering={isUser ? FadeInRight.delay(50) : FadeInLeft.delay(50)}
      style={[styles.container, isUser ? styles.user : styles.assistant]}
    >
      {!isUser && <View style={styles.avatar} />}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {message.type === 'action' && message.metadata?.executedActions && (
          <View style={styles.actions}>
            {message.metadata.executedActions.map((action, i) => (
              <Text key={i} style={styles.actionText}>
                ✅ {action.label}
              </Text>
            ))}
          </View>
        )}
        {message.type === 'automation' && (
          <Text style={styles.badge}>⚡ Automação criada</Text>
        )}
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
        <Text style={styles.time}>
          {format(new Date(message.timestamp), 'HH:mm', { locale: ptBR })}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  user: { justifyContent: 'flex-end' },
  assistant: { justifyContent: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent.primary },
  bubble: { maxWidth: '78%', borderRadius: 16, padding: 12, gap: 6 },
  userBubble: { backgroundColor: Colors.accent.primary, borderBottomRightRadius: 4 },
  assistantBubble: {
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  assistantText: { color: Colors.text.primary },
  time: { color: 'rgba(255,255,255,0.4)', fontSize: 11, alignSelf: 'flex-end' },
  actions: { gap: 4 },
  actionText: { color: Colors.status.success, fontSize: 12 },
  badge: { color: Colors.accent.primary, fontSize: 11, fontWeight: '600' },
});
