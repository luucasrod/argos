/**
 * Lista de dispositivos com reordenação manual por arrastar-soltar.
 *
 * Só é interativa na web (onde o app roda de verdade, como PWA) — usa Pointer
 * Events do DOM diretamente em vez de uma lib de drag-and-drop pronta, porque
 * as libs existentes (ex: react-native-draggable-flatlist) têm bugs conhecidos
 * e não funcionam de forma confiável no React Native Web.
 *
 * A ordem só muda quando o usuário arrasta pelo "alça" (⠿) — nunca sozinha
 * numa atualização de estado. Outros itens deslizam pro lugar usando o layout
 * animation do reanimated (funciona em web via transições CSS).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Text, StyleSheet, Platform } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Device } from '@/types/device.types';
import { Colors } from '@/constants/colors';

interface LayoutInfo {
  y: number;
  height: number;
}

interface DraggableDeviceListProps {
  devices: Device[];
  renderItem: (device: Device) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}

export function DraggableDeviceList({ devices, renderItem, onReorder }: DraggableDeviceListProps) {
  const orderRef = useRef<Device[]>(devices);
  const [renderOrder, setRenderOrder] = useState<Device[]>(devices);
  const layoutsRef = useRef<Record<string, LayoutInfo>>({});
  const draggingIdRef = useRef<string | null>(null);
  const startPointerYRef = useRef(0);
  const startItemYRef = useRef(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState(0);

  // Ressincroniza com a lista de fora (novo dispositivo, mudou online/offline)
  // — mas nunca durante um arraste em andamento.
  useEffect(() => {
    if (draggingIdRef.current) return;
    orderRef.current = devices;
    setRenderOrder(devices);
  }, [devices]);

  const commitOrder = useCallback(
    (next: Device[]) => {
      orderRef.current = next;
      setRenderOrder(next);
    },
    []
  );

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const id = draggingIdRef.current;
    if (!id) return;
    const delta = e.clientY - startPointerYRef.current;
    setDragDelta(delta);

    const draggedLayout = layoutsRef.current[id];
    if (!draggedLayout) return;
    const draggedCenter = startItemYRef.current + delta + draggedLayout.height / 2;

    const current = orderRef.current;
    const others = current.filter((d) => d.id !== id);
    let insertAt = others.length;
    for (let i = 0; i < others.length; i++) {
      const l = layoutsRef.current[others[i].id];
      if (!l) continue;
      if (draggedCenter < l.y + l.height / 2) {
        insertAt = i;
        break;
      }
    }
    const draggedItem = current.find((d) => d.id === id);
    if (!draggedItem) return;
    const next = [...others.slice(0, insertAt), draggedItem, ...others.slice(insertAt)];
    if (next.some((d, i) => d.id !== current[i]?.id)) {
      commitOrder(next);
    }
  }, [commitOrder]);

  const handlePointerUp = useCallback(() => {
    if (Platform.OS === 'web') {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    }
    const id = draggingIdRef.current;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragDelta(0);
    if (id) {
      onReorder(orderRef.current.map((d) => d.id));
    }
  }, [handlePointerMove, onReorder]);

  const handlePointerDown = useCallback(
    (id: string) => (e: { clientY?: number; nativeEvent?: { clientY?: number } }) => {
      if (Platform.OS !== 'web') return;
      const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      draggingIdRef.current = id;
      setDraggingId(id);
      startPointerYRef.current = clientY;
      startItemYRef.current = layoutsRef.current[id]?.y ?? 0;
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp]
  );

  return (
    <View style={styles.list}>
      {renderOrder.map((device) => {
        const isDragging = draggingId === device.id;
        return (
          <Animated.View
            key={device.id}
            layout={LinearTransition.duration(180)}
            onLayout={(e) => {
              layoutsRef.current[device.id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
            }}
            style={[
              styles.row,
              isDragging && {
                transform: [{ translateY: dragDelta }],
                zIndex: 10,
                opacity: 0.92,
              },
            ]}
          >
            {Platform.OS === 'web' ? (
              // eslint-disable-next-line react/no-unstable-nested-components
              <Pressable
                onPointerDown={handlePointerDown(device.id)}
                style={styles.handle}
                hitSlop={8}
              >
                <Text style={styles.handleText}>⠿</Text>
              </Pressable>
            ) : null}
            <View style={styles.itemContent}>{renderItem(device)}</View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  handle: {
    paddingTop: 20,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : {}),
  },
  handleText: { color: Colors.text.muted, fontSize: 18, letterSpacing: -1 },
  itemContent: { flex: 1 },
});
