import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/colors';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { useDeviceStore } from '@/stores/useDeviceStore';

function TabBarBackground() {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bg.elevated }]} />;
}

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      {focused && <View style={styles.tabActiveDot} />}
    </View>
  );
}

export default function TabsLayout() {
  useSupabaseSync(); // sincroniza memórias do Supabase ao entrar nos tabs
  const { syncEwelinkDevices } = useDeviceStore();

  useEffect(() => {
    syncEwelinkDevices();
  }, [syncEwelinkDevices]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: Platform.OS === 'ios' ? () => <TabBarBackground /> : undefined,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.accent.primary,
        tabBarInactiveTintColor: Colors.text.muted,
        sceneStyle: {
          backgroundColor: Colors.bg.primary,
          flex: 1,
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
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    backgroundColor: Platform.OS === 'web' ? Colors.bg.elevated : 'transparent',
    height: 80,
    paddingBottom: 20,
  },
  tabIcon: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 24 },
  tabIconFocused: { backgroundColor: Colors.glass.medium },
  tabEmoji: { fontSize: 22 },
  tabActiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent.primary,
    position: 'absolute',
    bottom: 4,
  },
});
