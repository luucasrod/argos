import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { AutomationTrigger } from '@/types/automation.types';

interface TriggerBadgeProps {
  trigger: AutomationTrigger;
}

export function TriggerBadge({ trigger }: TriggerBadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>⚡ {trigger.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.glass.light,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { color: Colors.text.secondary, fontSize: 12 },
});
