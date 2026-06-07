import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { AutomationAction } from '@/types/automation.types';

interface ActionListProps {
  actions: AutomationAction[];
}

export function ActionList({ actions }: ActionListProps) {
  return (
    <View style={styles.list}>
      {actions.map((action, i) => (
        <View key={action.id} style={styles.step}>
          <View style={styles.dot} />
          <Text style={styles.label}>{action.label}</Text>
          {i < actions.length - 1 && <View style={styles.line} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, paddingLeft: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent.primary },
  label: { color: Colors.text.secondary, fontSize: 13 },
  line: { display: 'none' },
});
