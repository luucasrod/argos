import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { useDeviceStore } from '@/stores/useDeviceStore';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabEmoji, focused && styles.tabEmojiFocused]}>{emoji}</Text>
      {focused ? <View style={styles.tabIndicator} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  useSupabaseSync();
  const { syncEwelinkDevices, syncAlexaDevices, syncWizDevices, syncTuyaDevices, syncTapoDevices, syncXiaomiDevices, syncXiaomiPetDevices, syncWizLocalDevices } = useDeviceStore();
  const insets = useSafeAreaInsets();
  const tabBarBottom = Math.max(insets.bottom, 4);
  const tabContentHeight = 52;

  useEffect(() => {
    const syncAll = () => {
      syncEwelinkDevices();
      syncAlexaDevices();
      syncWizDevices();
      syncTuyaDevices();
      syncTapoDevices();
      syncXiaomiDevices();
      syncXiaomiPetDevices();
      syncWizLocalDevices();
    };
    syncAll();
    const interval = setInterval(syncAll, 10_000);
    return () => clearInterval(interval);
  }, [syncEwelinkDevices, syncAlexaDevices, syncWizDevices, syncTuyaDevices, syncTapoDevices, syncXiaomiDevices, syncXiaomiPetDevices, syncWizLocalDevices]);

  return (
    <Tabs
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        title: '',
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabContentHeight + tabBarBottom,
            paddingBottom: tabBarBottom,
          },
        ],
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.accent.primary,
        tabBarInactiveTintColor: Colors.text.muted,
        tabBarItemStyle: [styles.tabBarItem, { height: tabContentHeight }],
        tabBarIconStyle: [styles.tabBarIconSlot, { height: tabContentHeight }],
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
        options={{ title: '', tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="conversar"
        options={{ title: '', tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inteligencia"
        options={{ title: '', tabBarIcon: ({ focused }) => <TabIcon emoji="🧠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="casa"
        options={{ title: '', tabBarIcon: ({ focused }) => <TabIcon emoji="🏡" focused={focused} /> }}
      />
      <Tabs.Screen
        name="agenda"
        options={{ title: '', tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: '', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
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
    backgroundColor: Colors.bg.elevated,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    paddingTop: 0,
  },
  tabBarItem: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
    margin: 0,
  },
  tabBarIconSlot: {
    marginTop: 0,
    marginBottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIcon: {
    width: 48,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabEmoji: {
    fontSize: 22,
    lineHeight: 26,
    opacity: 0.65,
    textAlign: 'center',
  },
  tabEmojiFocused: { opacity: 1 },
  tabIndicator: {
    position: 'absolute',
    bottom: 7,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent.primary,
  },
});
