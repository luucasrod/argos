import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.accent.primary,
        tabBarInactiveTintColor: Colors.text.muted,
        lazy: true,
        sceneStyle: {
          backgroundColor: Colors.bg.primary,
          flex: 1,
          overflow: 'hidden',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} /> }}
      />
      <Tabs.Screen
        name="automations"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} /> }}
      />
      <Tabs.Screen
        name="devices"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏡" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg.elevated,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    height: 64,
    paddingBottom: 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  tabIconFocused: { backgroundColor: Colors.glass.medium },
  tabEmoji: { fontSize: 22 },
});
