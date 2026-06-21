import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { useAIStore } from '@/stores/useAIStore';
import {
  openNativeApp,
  openWebUrl,
  prepareAppOpen,
  type AppOpenTarget,
} from '@/services/browser/browserActions';

function targetFromPending(pending: NonNullable<ReturnType<typeof useAIStore.getState>['pendingAppOpen']>): AppOpenTarget {
  return prepareAppOpen(pending.input);
}

export function OpenAppBanner() {
  const { pendingAppOpen, setPendingAppOpen } = useAIStore();

  if (!pendingAppOpen) return null;

  const target = targetFromPending(pendingAppOpen);

  const handleNative = () => {
    if (target.nativeUrl) openNativeApp(target);
    setPendingAppOpen(null);
  };

  const handleWeb = () => {
    openWebUrl(target.webUrl);
    setPendingAppOpen(null);
  };

  const dismiss = () => setPendingAppOpen(null);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Abrir {pendingAppOpen.label}</Text>
        <Text style={styles.desc}>
          No iPhone, toque abaixo para abrir o aplicativo. O sistema exige um toque seu.
        </Text>

        {target.nativeUrl ? (
          <Pressable style={styles.primaryBtn} onPress={handleNative}>
            <Text style={styles.primaryText}>📱 Abrir {pendingAppOpen.label}</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.secondaryBtn} onPress={handleWeb}>
          <Text style={styles.secondaryText}>🌐 Abrir no navegador</Text>
        </Pressable>

        <Pressable onPress={dismiss}>
          <Text style={styles.dismiss}>Agora não</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
    zIndex: 100,
  },
  card: {
    backgroundColor: '#1A1035',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.45)',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  title: { color: '#C4B5FD', fontSize: 17, fontWeight: '700' },
  desc: { color: Colors.text.muted, fontSize: 13, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  secondaryText: { color: Colors.text.secondary, fontWeight: '600', fontSize: 14 },
  dismiss: {
    color: Colors.text.muted,
    textAlign: 'center',
    fontSize: 13,
    paddingTop: 4,
  },
});
