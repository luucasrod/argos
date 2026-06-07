import React from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Automation } from '@/types/automation.types';

interface AutomationCardProps {
  automation: Automation;
  onToggle: () => void;
  onPress?: () => void;
}

export function AutomationCard({ automation, onToggle, onPress }: AutomationCardProps) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={!automation.isActive ? [styles.card, styles.inactive] : styles.card}>
        <View style={styles.header}>
          <Text style={styles.emoji}>{automation.emoji}</Text>
          <View style={styles.info}>
            <Text style={styles.name}>{automation.name}</Text>
            <Text style={styles.desc} numberOfLines={1}>
              {automation.description}
            </Text>
          </View>
          <Switch
            value={automation.isActive}
            onValueChange={onToggle}
            trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Text style={styles.trigger}>⚡ {automation.trigger.label}</Text>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10, marginBottom: 10 },
  inactive: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 28 },
  info: { flex: 1 },
  name: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  desc: { color: Colors.text.muted, fontSize: 13 },
  trigger: { color: Colors.text.muted, fontSize: 12 },
});
