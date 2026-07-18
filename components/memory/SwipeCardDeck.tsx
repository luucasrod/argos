import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Memory } from '@/types/memory.types';
import { SwipeCard } from './SwipeCard';
import { Colors } from '@/constants/colors';

interface SwipeCardDeckProps {
  memories: Memory[];
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}

const MAX_VISIBLE = 3;

export function SwipeCardDeck({ memories, onConfirm, onReject }: SwipeCardDeckProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = memories.filter((m) => !dismissed.has(m.id)).slice(0, MAX_VISIBLE);

  const handleConfirm = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    onConfirm(id);
  };

  const handleReject = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    onReject(id);
  };

  if (memories.length === 0 || visible.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>✨</Text>
        <Text style={styles.emptyTitle}>Tudo em dia</Text>
        <Text style={styles.emptySubtitle}>
          Nenhuma memória pendente de revisão
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.deck}>
      <Text style={styles.counter}>
        {memories.filter((m) => !dismissed.has(m.id)).length} pendentes
      </Text>
      <View style={styles.cardStack}>
        {visible
          .slice()
          .reverse()
          .map((memory, reverseIdx) => {
            const stackIndex = visible.length - 1 - reverseIdx;
            const isTop = stackIndex === 0;
            return (
              <SwipeCard
                key={memory.id}
                memory={memory}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isTop={isTop}
                stackIndex={stackIndex}
              />
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  counter: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 20,
    textAlign: 'center',
  },
  cardStack: {
    height: 380,
    position: 'relative',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.text.muted,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
