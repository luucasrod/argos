import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors } from '@/constants/colors';

interface GradientTextProps {
  children: string;
  style?: TextStyle;
}

export function GradientText({ children, style }: GradientTextProps) {
  return <Text style={[style, { color: Colors.accent.primary }]}>{children}</Text>;
}
