import React from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import { useHaptic } from '@/hooks/useHaptic';

interface PressableFeedbackProps extends PressableProps {
  children: React.ReactNode;
  haptic?: 'light' | 'medium' | 'heavy';
}

export function PressableFeedback({
  children,
  haptic = 'light',
  onPress,
  ...props
}: PressableFeedbackProps) {
  const haptics = useHaptic();

  return (
    <Pressable
      {...props}
      onPress={(e) => {
        haptics[haptic]();
        onPress?.(e);
      }}
      style={({ pressed }) => [styles.base, pressed && styles.pressed, props.style as object]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { opacity: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
