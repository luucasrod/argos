import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface SuggestionPillProps {
  text: string;
  onPress: () => void;
}

export function SuggestionPill({ text, onPress }: SuggestionPillProps) {
  return (
    <Pressable onPress={onPress} style={styles.pill}>
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 10,
  },
  text: { color: Colors.text.secondary, fontSize: 13 },
});
