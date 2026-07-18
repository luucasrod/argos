import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

export interface SubTab {
  key: string;
  label: string;
  emoji?: string;
}

interface SubTabBarProps {
  tabs: SubTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function SubTabBar({ tabs, activeTab, onTabChange }: SubTabBarProps) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              {tab.emoji ? <Text style={styles.emoji}>{tab.emoji}</Text> : null}
              <Text style={[styles.label, active && styles.labelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
    backgroundColor: Colors.bg.elevated,
  },
  scroll: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 2,
  },
  tabActive: {
    borderBottomColor: Colors.accent.primary,
  },
  emoji: { fontSize: 14 },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.muted,
  },
  labelActive: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
});
