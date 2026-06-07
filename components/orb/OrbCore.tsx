import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AIStatus } from '@/types/ai.types';
import {
  ORB_SIZE,
  ORB_RING_OUTER,
  ORB_RING_INNER,
  ORB_GRADIENT,
  ORB_GLOW_SHADOW,
} from '@/constants/orb';

interface OrbCoreProps {
  status: AIStatus;
  size?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  showHint?: boolean;
}

const orbShadowNative = {
  shadowColor: '#7C3AED',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.55,
  shadowRadius: 40,
  elevation: 24,
};

const orbShadowWeb = Platform.OS === 'web' ? ({ boxShadow: ORB_GLOW_SHADOW } as object) : {};

function getGradientColors(status: AIStatus): readonly [string, string, ...string[]] {
  switch (status) {
    case 'listening':
      return ['#6D28D9', '#4F46E5', '#06B6D4'];
    case 'thinking':
      return ['#7C3AED', '#6366F1', '#3B82F6'];
    case 'executing':
      return ['#5B21B6', '#4F46E5', '#10B981'];
    case 'speaking':
      return ['#7C3AED', '#4F46E5', '#60A5FA'];
    case 'error':
      return ['#7C3AED', '#DC2626', '#4F46E5'];
    case 'offline':
      return ['#3A3D4A', '#2A2D3A', '#1A1D2A'];
    default:
      return ORB_GRADIENT;
  }
}

function OrbAssembly({
  size,
  status,
  onPress,
  onLongPress,
  showHint = true,
  orbAnimatedStyle,
}: {
  size: number;
  status: AIStatus;
  onPress?: () => void;
  onLongPress?: () => void;
  showHint?: boolean;
  orbAnimatedStyle?: object;
}) {
  const colors = getGradientColors(status);
  const OrbWrapper = orbAnimatedStyle ? Animated.View : View;

  return (
    <View style={[styles.assembly, { width: ORB_RING_OUTER, height: ORB_RING_OUTER }]}>
      <View
        style={[
          styles.radialGlow,
          Platform.OS === 'web'
            ? ({
                backgroundImage:
                  'radial-gradient(circle, rgba(109,40,217,0.18) 0%, rgba(109,40,217,0.06) 45%, transparent 70%)',
              } as object)
            : null,
        ]}
      />

      <View
        style={[
          styles.ring,
          {
            width: ORB_RING_OUTER,
            height: ORB_RING_OUTER,
            borderRadius: ORB_RING_OUTER / 2,
            borderColor: 'rgba(139, 92, 246, 0.25)',
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: ORB_RING_INNER,
            height: ORB_RING_INNER,
            borderRadius: ORB_RING_INNER / 2,
            borderColor: 'rgba(96, 165, 250, 0.15)',
          },
        ]}
      />

      <OrbWrapper style={[styles.orbPressable, orbAnimatedStyle]}>
        <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.pressableHit}>
          <View
            style={[
              styles.orbShadow,
              { width: size, height: size, borderRadius: size / 2 },
              orbShadowNative,
              orbShadowWeb,
            ]}
          >
            <LinearGradient
              colors={[...colors]}
              style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 1, y: 0.9 }}
            />
            <View style={styles.orbContent}>
              <Text style={styles.orbTitle}>ARGOS</Text>
              {showHint && status === 'idle' && (
                <Text style={styles.orbHint}>Toque para falar</Text>
              )}
              {status === 'listening' && <Text style={styles.orbHint}>Ouvindo...</Text>}
              {status === 'thinking' && <Text style={styles.orbHint}>Pensando...</Text>}
              {status === 'executing' && <Text style={styles.orbHint}>Executando...</Text>}
              {status === 'speaking' && <Text style={styles.orbHint}>Falando...</Text>}
            </View>
          </View>
        </Pressable>
      </OrbWrapper>
    </View>
  );
}

function OrbCoreStatic({ status, size = ORB_SIZE, onPress, onLongPress, showHint }: OrbCoreProps) {
  return (
    <OrbAssembly
      size={size}
      status={status}
      onPress={onPress}
      onLongPress={onLongPress}
      showHint={showHint}
    />
  );
}

function OrbCoreAnimated({ status, size = ORB_SIZE, onPress, onLongPress, showHint }: OrbCoreProps) {
  const scale = useSharedValue(1);
  const glowIntensity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = 1;
    glowIntensity.value = 0.6;

    switch (status) {
      case 'idle':
        scale.value = withRepeat(
          withSequence(
            withTiming(1.04, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
            withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        );
        glowIntensity.value = withRepeat(
          withSequence(withTiming(0.85, { duration: 3000 }), withTiming(0.5, { duration: 3000 })),
          -1,
          false
        );
        break;
      case 'listening':
        scale.value = withRepeat(
          withSequence(
            withTiming(1.08, { duration: 400, easing: Easing.out(Easing.quad) }),
            withTiming(1.02, { duration: 400, easing: Easing.in(Easing.quad) })
          ),
          -1,
          false
        );
        break;
      case 'thinking':
        scale.value = withRepeat(
          withSequence(withTiming(1.05, { duration: 600 }), withTiming(1, { duration: 600 })),
          -1,
          false
        );
        break;
      case 'executing':
        scale.value = withRepeat(
          withSequence(
            withTiming(1.1, { duration: 200, easing: Easing.out(Easing.back(2)) }),
            withTiming(1, { duration: 200 })
          ),
          -1,
          false
        );
        break;
      case 'speaking':
        scale.value = withRepeat(
          withSequence(withTiming(1.05, { duration: 500 }), withTiming(1, { duration: 500 })),
          -1,
          false
        );
        break;
      case 'offline':
        scale.value = withTiming(0.92);
        break;
      case 'error':
        scale.value = withRepeat(
          withSequence(withTiming(1.04, { duration: 100 }), withTiming(0.96, { duration: 100 })),
          3,
          false
        );
        break;
    }
  }, [status, scale, glowIntensity]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(glowIntensity.value, [0.4, 1], [0.75, 1]),
  }));

  return (
    <OrbAssembly
      size={size}
      status={status}
      onPress={onPress}
      onLongPress={onLongPress}
      showHint={showHint}
      orbAnimatedStyle={orbStyle}
    />
  );
}

export function OrbCore(props: OrbCoreProps) {
  if (Platform.OS === 'web') {
    return <OrbCoreStatic {...props} />;
  }
  return <OrbCoreAnimated {...props} />;
}

const styles = StyleSheet.create({
  assembly: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialGlow: {
    position: 'absolute',
    width: ORB_RING_OUTER + 80,
    height: ORB_RING_OUTER + 80,
    borderRadius: (ORB_RING_OUTER + 80) / 2,
    backgroundColor: 'rgba(109, 40, 217, 0.18)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  orbPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressableHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbShadow: {
    overflow: 'hidden',
  },
  orbContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  orbTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
  },
  orbHint: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
});
