import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { AIStatus } from '@/types/ai.types';

interface OrbStatusProps {
  status: AIStatus;
}

const STATUS_CONFIG: Record<
  AIStatus,
  { label: string; color: string; dot: string; dotGlow: string }
> = {
  idle: {
    label: 'PRONTO',
    color: 'rgba(255, 255, 255, 0.4)',
    dot: '#22C55E',
    dotGlow: 'rgba(34, 197, 94, 0.8)',
  },
  listening: {
    label: 'OUVINDO',
    color: 'rgba(0, 212, 255, 0.85)',
    dot: '#00D4FF',
    dotGlow: 'rgba(0, 212, 255, 0.8)',
  },
  thinking: {
    label: 'PENSANDO',
    color: 'rgba(167, 139, 250, 0.85)',
    dot: '#A78BFA',
    dotGlow: 'rgba(167, 139, 250, 0.8)',
  },
  executing: {
    label: 'EXECUTANDO',
    color: 'rgba(96, 165, 250, 0.85)',
    dot: '#60A5FA',
    dotGlow: 'rgba(96, 165, 250, 0.8)',
  },
  speaking: {
    label: 'FALANDO',
    color: 'rgba(196, 181, 253, 0.85)',
    dot: '#C4B5FD',
    dotGlow: 'rgba(196, 181, 253, 0.8)',
  },
  offline: {
    label: 'OFFLINE',
    color: 'rgba(255, 255, 255, 0.35)',
    dot: '#3A3D4A',
    dotGlow: 'transparent',
  },
  error: {
    label: 'ERRO',
    color: 'rgba(255, 75, 110, 0.85)',
    dot: '#FF4B6E',
    dotGlow: 'rgba(255, 75, 110, 0.8)',
  },
};

export function OrbStatus({ status }: OrbStatusProps) {
  const config = STATUS_CONFIG[status];

  const Wrapper = Platform.OS === 'web' ? View : Animated.View;
  const animProps =
    Platform.OS === 'web'
      ? {}
      : { entering: FadeIn.duration(300), exiting: FadeOut.duration(200) };

  const dotShadowWeb =
    Platform.OS === 'web'
      ? ({ boxShadow: `0 0 8px ${config.dotGlow}, 0 0 16px ${config.dotGlow}` } as object)
      : {};

  return (
    <Wrapper {...animProps} style={styles.container}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: config.dot,
            shadowColor: config.dot,
          },
          dotShadowWeb,
        ]}
      />
      <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  statusText: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
