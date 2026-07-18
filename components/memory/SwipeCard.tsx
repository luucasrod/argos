import React, { useRef } from 'react';
import {
  View,
  Text,
  PanResponder,
  Animated,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { Memory } from '@/types/memory.types';
import { Colors } from '@/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.22;

const CATEGORY_COLORS: Record<string, string> = {
  routine: '#4F6EF7',
  preference: '#7B5CEA',
  person: '#00E5A0',
  location: '#00D4FF',
  habit: '#F59E0B',
  context: '#8A94B2',
};

const CATEGORY_LABELS: Record<string, string> = {
  routine: 'Rotina',
  preference: 'Preferência',
  person: 'Pessoa',
  location: 'Local',
  habit: 'Hábito',
  context: 'Contexto',
};

interface SwipeCardProps {
  memory: Memory;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  isTop: boolean;
  stackIndex: number;
}

export function SwipeCard({ memory, onConfirm, onReject, isTop, stackIndex }: SwipeCardProps) {
  const position = useRef(new Animated.ValueXY()).current;

  const swipeOut = (direction: 'right' | 'left', cb: (id: string) => void) => {
    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      cb(memory.id);
    });
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: (_, g) => isTop && Math.abs(g.dx) > 5,
      onPanResponderMove: (_, g) => {
        position.setValue({ x: g.dx, y: g.dy * 0.3 });
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          swipeOut('right', onConfirm);
        } else if (g.dx < -SWIPE_THRESHOLD) {
          swipeOut('left', onReject);
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  const confirmOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD * 0.6],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const rejectOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD * 0.6, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const color = CATEGORY_COLORS[memory.category] ?? Colors.accent.primary;

  const cardAnimStyle = isTop
    ? {
        transform: [
          { translateX: position.x },
          { translateY: position.y },
          { rotate },
        ],
      }
    : {
        transform: [
          { scale: 1 - stackIndex * 0.04 },
          { translateY: stackIndex * -10 },
        ],
        opacity: 1 - stackIndex * 0.18,
      };

  return (
    <Animated.View
      style={[styles.card, cardAnimStyle]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      {isTop && (
        <>
          <Animated.View style={[styles.overlay, styles.overlayConfirm, { opacity: confirmOpacity }]}>
            <Text style={styles.overlayText}>✓ Lembrar</Text>
          </Animated.View>
          <Animated.View style={[styles.overlay, styles.overlayReject, { opacity: rejectOpacity }]}>
            <Text style={styles.overlayText}>✕ Esquecer</Text>
          </Animated.View>
        </>
      )}

      <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Text style={[styles.badgeText, { color }]}>
          {CATEGORY_LABELS[memory.category] ?? memory.category}
        </Text>
      </View>

      <Text style={styles.title}>{memory.title}</Text>
      <Text style={styles.content}>{memory.content}</Text>

      {memory.tags.length > 0 && (
        <View style={styles.tags}>
          {memory.tags.slice(0, 4).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.confidenceRow}>
        <View style={styles.confidenceTrack}>
          <View style={[styles.confidenceFill, { width: `${memory.confidence * 100}%` as any, backgroundColor: color }]} />
        </View>
        <Text style={styles.confidenceLabel}>{Math.round(memory.confidence * 100)}%</Text>
      </View>

      {isTop && (
        <View style={styles.actions}>
          <Pressable style={styles.rejectBtn} onPress={() => swipeOut('left', onReject)}>
            <Text style={styles.rejectBtnText}>✕ Esquecer</Text>
          </Pressable>
          <Pressable style={styles.confirmBtn} onPress={() => swipeOut('right', onConfirm)}>
            <Text style={styles.confirmBtnText}>✓ Lembrar</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: '100%',
    backgroundColor: Colors.bg.elevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  overlay: {
    position: 'absolute',
    top: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    zIndex: 10,
  },
  overlayConfirm: {
    right: 20,
    borderColor: Colors.status.success,
    backgroundColor: Colors.status.success + '22',
  },
  overlayReject: {
    left: 20,
    borderColor: Colors.status.error,
    backgroundColor: Colors.status.error + '22',
  },
  overlayText: {
    fontWeight: '700',
    fontSize: 15,
    color: Colors.text.primary,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    lineHeight: 26,
  },
  content: {
    fontSize: 15,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: Colors.glass.medium,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confidenceTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.glass.heavy,
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  confidenceLabel: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '500',
    width: 32,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.status.error + '18',
    borderWidth: 1,
    borderColor: Colors.status.error + '44',
    alignItems: 'center',
  },
  rejectBtnText: {
    color: Colors.status.error,
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.status.success + '18',
    borderWidth: 1,
    borderColor: Colors.status.success + '44',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: Colors.status.success,
    fontWeight: '600',
    fontSize: 14,
  },
});
