/**
 * Badge minimalista que indica o estado de conectividade de rede.
 * Visível apenas quando offline — em estado normal não polui a tela.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useConnectivityStore, startConnectivityMonitor } from '@/stores/useConnectivityStore';

export function ConnectivityBadge() {
  const isOnline = useConnectivityStore((s) => s.isOnline);

  useEffect(() => {
    const stop = startConnectivityMonitor();
    return stop;
  }, []);

  if (isOnline) return null;

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.badge}>
      <View style={styles.dot} />
      <Text style={styles.label}>Offline</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  label: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
});
