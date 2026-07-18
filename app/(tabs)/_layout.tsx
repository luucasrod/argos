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
  useSupabaseSync();
  const { syncEwelinkDevices, syncAlexaDevices, syncWizDevices, syncTuyaDevices, syncHueLights, syncTapoDevices, syncXiaomiDevices, syncWizLocalDevices } = useDeviceStore();

  useEffect(() => {
    syncEwelinkDevices();
    syncAlexaDevices();
    syncWizDevices();
    syncTuyaDevices();
    syncHueLights();
    syncTapoDevices();
    syncXiaomiDevices();
    syncWizLocalDevices();
    const interval = setInterval(syncEwelinkDevices, 5000);
    return () => clearInterval(interval);
  }, [syncEwelinkDevices, syncAlexaDevices, syncWizDevices, syncTuyaDevices, syncHueLights, syncTapoDevices, syncXiaomiDevices, syncWizLocalDevices]);

  return (
    <Tabs
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: Platform.OS === 'ios' ? () => <TabBarBackground /> : undefined,
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
      {/* === NOVAS 6 ABAS === */}
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="conversar"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inteligencia"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🧠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="casa"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏡" focused={focused} /> }}
      />
      <Tabs.Screen
        name="agenda"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />

      {/* === ANTIGAS (ocultas da tab bar) === */}
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="automations" options={{ href: null }} />
      <Tabs.Screen name="devices" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
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
