import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Memory } from '@/types/memory.types';

interface MemoryCardProps {
  memory: Memory;
  accentColor?: string;
  onDelete?: () => void;
}

export function MemoryCard({ memory, accentColor = Colors.accent.primary, onDelete }: MemoryCardProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accentColor }]}>{memory.title}</Text>
        {onDelete && (
          <Pressable onPress={onDelete}>
            <Text>🗑</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.content}>{memory.content}</Text>
      <Text style={styles.confidence}>{Math.round(memory.confidence * 100)}% confiança</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8, marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '600', flex: 1 },
  content: { color: Colors.text.secondary, fontSize: 14, lineHeight: 20 },
  confidence: { color: Colors.text.muted, fontSize: 11 },
});
