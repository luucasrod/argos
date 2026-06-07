import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ExecutionOverlay } from '@/components/execution/ExecutionOverlay';
import { Colors } from '@/constants/colors';

export default function ExecutionModal() {
  return (
    <Pressable style={styles.overlay} onPress={() => router.back()}>
      <View style={styles.content}>
        <ExecutionOverlay />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 16, 0.85)',
    justifyContent: 'center',
    paddingTop: 120,
  },
  content: { flex: 1 },
});
