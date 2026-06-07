import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { AIStatus } from '@/types/ai.types';
import { Colors } from '@/constants/colors';

interface OrbRingsProps {
  status: AIStatus;
  size?: number;
}

export function OrbRings({ status, size = 180 }: OrbRingsProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (status === 'thinking' || status === 'listening') {
      rotation.value = withRepeat(
        withTiming(360, { duration: status === 'thinking' ? 1200 : 3000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      rotation.value = withTiming(0);
    }
  }, [status, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (status === 'idle' || status === 'offline') return null;

  return (
    <Animated.View
      style={[
        styles.ring,
        { width: size * 1.3, height: size * 1.3, borderRadius: (size * 1.3) / 2 },
        ringStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.glass.borderAccent,
    borderStyle: 'dashed',
  },
});
