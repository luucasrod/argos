import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useDeviceStore } from '@/stores/useDeviceStore';
import { getSpeakableDeviceAlias } from '@/services/voice/deviceVoiceAliases';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useArgos } from '@/hooks/useArgos';
import { useHaptic } from '@/hooks/useHaptic';
import { SubTabBar, SubTab } from '@/components/ui/SubTabBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { Colors } from '@/constants/colors';
import { Device, DeviceCapability } from '@/types/device.types';

const TABS: SubTab[] = [
  { key: 'dispositivos', label: 'Dispositivos', emoji: '💡' },
  { key: 'automacoes',   label: 'Automações',   emoji: '⚡' },
  { key: 'comodos',      label: 'Cômodos',      emoji: '🏠' },
  { key: 'eventos',      label: 'Eventos',      emoji: '📋' },
];

// ─── CapabilityControl ────────────────────────────────────────────────────────

function CapabilityControl({
  cap,
  value,
  onUpdate,
}: {
  cap: DeviceCapability;
  value: unknown;
  onUpdate: (key: string, val: unknown) => void;
}) {
  const { light } = useHaptic();

  if (cap.type === 'toggle') {
    return (
      <View style={styles.capRow}>
        <Text style={styles.capLabel}>{cap.label}</Text>
        <Switch
          value={!!value}
          onValueChange={(v) => { light(); onUpdate(cap.property, v); }}
          trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  if (cap.type === 'range') {
    const num = typeof value === 'number' ? value : (cap.min ?? 0);
    const min = cap.min ?? 0;
    const max = cap.max ?? 100;
    const step = Math.round((max - min) / 5) || 1;
    const pct = Math.round(((num - min) / (max - min)) * 100);
    return (
      <View style={styles.capRow}>
        <Text style={styles.capLabel}>{cap.label}</Text>
        <View style={styles.rangeRow}>
          <Pressable onPress={() => { light(); onUpdate(cap.property, Math.max(min, num - step)); }} style={styles.rangeBtn}>
            <Text style={styles.rangeBtnText}>−</Text>
          </Pressable>
          <View style={styles.rangeTrack}>
            <View style={[styles.rangeFill, { width: `${pct}%` as any }]} />
          </View>
          <Pressable onPress={() => { light(); onUpdate(cap.property, Math.min(max, num + step)); }} style={styles.rangeBtn}>
            <Text style={styles.rangeBtnText}>+</Text>
          </Pressable>
          <Text style={styles.rangeValue}>{num}{cap.unit ?? ''}</Text>
        </View>
      </View>
    );
  }

  if (cap.type === 'select' && cap.options) {
    return (
      <View style={styles.capCol}>
        <Text style={styles.capLabel}>{cap.label}</Text>
        <View style={styles.selectRow}>
          {cap.options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => { light(); onUpdate(cap.property, opt); }}
              style={[styles.selectOpt, value === opt && styles.selectOptActive]}
            >
              <Text style={[styles.selectOptText, value === opt && styles.selectOptTextActive]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (cap.type === 'color') {
    const colors = ['#FFFFFF', '#FFD700', '#FF8C00', '#FF4500', '#00CED1', '#1E90FF', '#9400D3', '#FF1493'];
    return (
      <View style={styles.capCol}>
        <Text style={styles.capLabel}>{cap.label}</Text>
        <View style={styles.colorRow}>
          {colors.map((c) => (
            <Pressable
              key={c}
              onPress={() => { light(); onUpdate(cap.property, c); }}
              style={[styles.colorDot, { backgroundColor: c }, value === c && styles.colorDotActive]}
            />
          ))}
        </View>
      </View>
    );
  }

  return null;
}

// ─── DeviceCard ───────────────────────────────────────────────────────────────

function DeviceCard({
  device,
  rooms,
  showRoom = false,
}: {
  device: Device;
  rooms: string[];
  showRoom?: boolean;
}) {
  const { toggleDevice, updateDeviceState, renameDevice, updateDevice } = useDeviceStore();
  const { light } = useHaptic();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [showMoveRoom, setShowMoveRoom] = useState(false);

  const isOnline = device.status === 'online';
  // Apelido falável: só existe quando o nome tem palavra fora do vocabulário
  // do modelo (tv, 4k, speaker...). Mostrado aqui, na tela que o usuário vê —
  // devices.tsx tem href:null no _layout e não aparece para ninguém.
  const voiceAlias = getSpeakableDeviceAlias(device.name);

  const handleRename = () => {
    if (nameInput.trim() && nameInput !== device.name) renameDevice(device.id, nameInput.trim());
    setRenaming(false);
  };

  return (
    <GlassCard style={[styles.deviceCard, !isOnline && styles.deviceOffline]}>
      <Pressable onPress={() => { light(); setExpanded((e) => !e); }} style={styles.deviceHeader}>
        <Text style={styles.deviceIcon}>{device.icon}</Text>
        <View style={styles.deviceInfo}>
          {renaming ? (
            <TextInput
              style={styles.renameInput}
              value={nameInput}
              onChangeText={setNameInput}
              onBlur={handleRename}
              onSubmitEditing={handleRename}
              autoFocus
            />
          ) : (
            <Pressable onLongPress={() => { light(); setRenaming(true); setNameInput(device.name); }}>
              <Text style={styles.deviceName}>{device.name}</Text>
            </Pressable>
          )}
          <View style={styles.deviceMeta}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.status.success : Colors.status.offline }]} />
            <Text style={styles.deviceStatus}>{isOnline ? 'Online' : 'Offline'}</Text>
            {showRoom && device.room ? <Text style={styles.deviceRoom}>· {device.room}</Text> : null}
            {voiceAlias ? <Text style={styles.deviceRoom}>· diga "{voiceAlias}"</Text> : null}
          </View>
        </View>
        <View style={styles.deviceRight}>
          <Switch
            value={device.isOn && isOnline}
            onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}
            trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
            thumbColor="#fff"
            disabled={!isOnline}
          />
          <Text style={styles.expandChevron}>{expanded ? '▾' : '▸'}</Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.deviceControls}>
          <View style={styles.controlsDivider} />
          {isOnline && (device.capabilities?.length ?? 0) > 0
            ? (device.capabilities ?? []).map((cap) => (
                <CapabilityControl
                  key={cap.property}
                  cap={cap}
                  value={device.state?.[cap.property]}
                  onUpdate={(key, val) => updateDeviceState(device.id, key, val)}
                />
              ))
            : !isOnline
              ? <Text style={styles.offlineMsg}>Dispositivo offline — sem controles disponíveis</Text>
              : null
          }
          <View style={styles.deviceActions}>
            <Pressable onPress={() => { light(); setRenaming(true); setNameInput(device.name); }} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>✏ Renomear</Text>
            </Pressable>
            <Pressable onPress={() => { light(); setShowMoveRoom(true); }} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>🏠 Mover cômodo</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Modal mover para cômodo */}
      <Modal visible={showMoveRoom} transparent animationType="fade" onRequestClose={() => setShowMoveRoom(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMoveRoom(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mover para cômodo</Text>
            <Pressable
              style={[styles.roomPillBtn, !device.room && styles.roomPillBtnActive]}
              onPress={() => {
                light();
                updateDevice(device.id, { room: undefined });
                setShowMoveRoom(false);
              }}
            >
              <Text style={[styles.roomPillText, !device.room && styles.roomPillTextActive]}>
                Sem cômodo {!device.room ? '✓' : ''}
              </Text>
            </Pressable>
            {rooms.map((r) => (
              <Pressable
                key={r}
                style={[styles.roomPillBtn, device.room === r && styles.roomPillBtnActive]}
                onPress={() => {
                  light();
                  updateDevice(device.id, { room: r });
                  setShowMoveRoom(false);
                }}
              >
                <Text style={[styles.roomPillText, device.room === r && styles.roomPillTextActive]}>
                  {r} {device.room === r ? '✓' : ''}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowMoveRoom(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </GlassCard>
  );
}

// ─── RoomCard ─────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  devices,
  allRooms,
  onDelete,
}: {
  room: string;
  devices: Device[];
  allRooms: string[];
  onDelete: () => void;
}) {
  const { light } = useHaptic();
  const [expanded, setExpanded] = useState(false);
  const onlineCount = devices.filter((d) => d.status === 'online').length;

  return (
    <GlassCard style={styles.roomCard}>
      <Pressable onPress={() => { light(); setExpanded((e) => !e); }} style={styles.roomHeader}>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>{room}</Text>
          <Text style={styles.roomCount}>
            {devices.length} dispositivo{devices.length !== 1 ? 's' : ''}
            {onlineCount > 0 ? ` · ${onlineCount} online` : ''}
          </Text>
        </View>
        <Text style={styles.roomChevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.roomBody}>
          <View style={styles.controlsDivider} />
          {devices.length === 0 ? (
            <Text style={styles.roomEmpty}>Nenhum dispositivo neste cômodo. Use "Mover cômodo" nos dispositivos.</Text>
          ) : (
            <View style={{ gap: 8, paddingTop: 8 }}>
              {[...devices]
                .sort((a, b) => (b.status === 'online' ? 1 : 0) - (a.status === 'online' ? 1 : 0))
                .map((d) => (
                  <DeviceCard key={d.id} device={d} rooms={allRooms} showRoom={false} />
                ))}
            </View>
          )}
          <Pressable onPress={() => { light(); onDelete(); }} style={styles.deleteRoomBtn}>
            <Text style={styles.deleteRoomText}>Remover cômodo</Text>
          </Pressable>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CasaScreen() {
  const [activeTab, setActiveTab] = useState('dispositivos');
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [rooms, setRooms] = useState<string[]>(['Sala', 'Quarto', 'Cozinha']);
  const [events, setEvents] = useState<{ name: string; time: string }[]>([]);
  const [autoInput, setAutoInput] = useState('');
  const [autoSending, setAutoSending] = useState(false);

  const { devices, updateDevice } = useDeviceStore();
  const { automations, toggleAutomation } = useAutomationStore();
  const { sendMessage } = useArgos();
  const { light, medium } = useHaptic();

  const onlineDevices = devices.filter((d) => d.status === 'online');

  const handleSendAuto = async () => {
    if (!autoInput.trim() || autoSending) return;
    medium();
    const msg = autoInput.trim();
    setAutoInput('');
    setAutoSending(true);
    await sendMessage(`Quero criar uma automação: ${msg}. Analisa os dispositivos que tenho conectados e me diz se é possível criar essa automação, ou quais dispositivos eu precisaria para isso. Se for possível, cria a automação e mostra o que foi configurado.`);
    setAutoSending(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dispositivos':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>
              {onlineDevices.length}/{devices.length} online
            </Text>
            {devices.length === 0 ? (
              <EmptyState emoji="💡" title="Nenhum dispositivo" text="Configure suas integrações em Perfil → Integrações" />
            ) : (
              [...devices]
                .sort((a, b) => (b.status === 'online' ? 1 : 0) - (a.status === 'online' ? 1 : 0))
                .map((d) => <DeviceCard key={d.id} device={d} rooms={rooms} showRoom />)
            )}
          </ScrollView>
        );

      case 'automacoes':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Criar com IA */}
            <GlassCard style={styles.aiCard}>
              <Text style={styles.aiTitle}>⚡ Criar automação com IA</Text>
              <Text style={styles.aiDesc}>
                Descreva o que quer automatizar. O Argos verifica seus dispositivos e cria a automação — ou explica o que você precisaria.
              </Text>
              <View style={styles.aiInputRow}>
                <TextInput
                  style={styles.aiInput}
                  value={autoInput}
                  onChangeText={setAutoInput}
                  placeholder="Ex: Apagar todas as luzes quando eu sair de casa"
                  placeholderTextColor={Colors.text.muted}
                  multiline
                  onSubmitEditing={handleSendAuto}
                  returnKeyType="send"
                />
              </View>
              <Pressable
                style={[styles.aiSendBtn, (!autoInput.trim() || autoSending) && styles.aiSendBtnDisabled]}
                onPress={handleSendAuto}
                disabled={!autoInput.trim() || autoSending}
              >
                <Text style={styles.aiSendBtnText}>
                  {autoSending ? 'Enviando...' : 'Pedir ao Argos ↗'}
                </Text>
              </Pressable>
            </GlassCard>

            {/* Automações existentes */}
            {automations.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                  {automations.filter((a) => a.isActive).length}/{automations.length} ativas
                </Text>
                {automations.map((auto) => (
                  <GlassCard key={auto.id} style={[styles.autoCard, !auto.isActive && styles.autoInactive]}>
                    <View style={styles.autoRow}>
                      <Text style={styles.autoEmoji}>{auto.emoji}</Text>
                      <View style={styles.autoInfo}>
                        <Text style={styles.autoName}>{auto.name}</Text>
                        <Text style={styles.autoDesc2} numberOfLines={1}>{auto.description}</Text>
                        <Text style={styles.autoTrigger}>⚡ {auto.trigger.label}</Text>
                      </View>
                      <Switch
                        value={auto.isActive}
                        onValueChange={() => { light(); toggleAutomation(auto.id); }}
                        trackColor={{ false: Colors.glass.heavy, true: Colors.accent.primary }}
                        thumbColor="#fff"
                      />
                    </View>
                  </GlassCard>
                ))}
              </>
            )}

            {automations.length === 0 && (
              <EmptyState emoji="⚡" text="Nenhuma automação ainda. Use o campo acima para criar uma com IA." />
            )}
          </ScrollView>
        );

      case 'comodos': {
        const unassigned = devices.filter((d) => !d.room || !rooms.includes(d.room));
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Pressable onPress={() => { light(); setShowAddRoom(true); }} style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ Adicionar cômodo</Text>
            </Pressable>

            {rooms.map((room) => (
              <RoomCard
                key={room}
                room={room}
                devices={devices.filter((d) => d.room === room)}
                allRooms={rooms}
                onDelete={() => {
                  medium();
                  setRooms((r) => r.filter((x) => x !== room));
                  devices.filter((d) => d.room === room).forEach((d) => updateDevice(d.id, { room: undefined }));
                }}
              />
            ))}

            {unassigned.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Sem cômodo atribuído</Text>
                {unassigned.map((d) => (
                  <DeviceCard key={d.id} device={d} rooms={rooms} showRoom={false} />
                ))}
              </>
            )}
          </ScrollView>
        );
      }

      case 'eventos':
        return (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Pressable onPress={() => { light(); setShowAddEvent(true); }} style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ Adicionar evento</Text>
            </Pressable>
            {events.length === 0 ? (
              <EmptyState emoji="📋" text="Eventos dos dispositivos aparecerão aqui" />
            ) : (
              events.map((ev, i) => (
                <GlassCard key={i} style={styles.eventCard}>
                  <Text style={styles.eventName}>{ev.name}</Text>
                  <Text style={styles.eventTime}>{ev.time}</Text>
                </GlassCard>
              ))
            )}
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Casa</Text>
          <Text style={styles.subtitle}>
            {onlineDevices.length} dispositivo{onlineDevices.length !== 1 ? 's' : ''} online
          </Text>
        </View>

        <SubTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <View style={styles.content}>{renderContent()}</View>
      </SafeAreaView>

      {/* Modal: Adicionar cômodo */}
      <Modal visible={showAddRoom} transparent animationType="fade" onRequestClose={() => setShowAddRoom(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo cômodo</Text>
            <TextInput
              style={styles.modalInput}
              value={newRoomName}
              onChangeText={setNewRoomName}
              placeholder="Ex: Escritório"
              placeholderTextColor={Colors.text.muted}
              autoFocus
              onSubmitEditing={() => {
                if (newRoomName.trim() && !rooms.includes(newRoomName.trim())) {
                  medium(); setRooms((r) => [...r, newRoomName.trim()]);
                }
                setShowAddRoom(false); setNewRoomName('');
              }}
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setShowAddRoom(false); setNewRoomName(''); }} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (newRoomName.trim() && !rooms.includes(newRoomName.trim())) {
                    medium(); setRooms((r) => [...r, newRoomName.trim()]);
                  }
                  setShowAddRoom(false); setNewRoomName('');
                }}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmText}>Adicionar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Adicionar evento */}
      <Modal visible={showAddEvent} transparent animationType="fade" onRequestClose={() => setShowAddEvent(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo evento</Text>
            <TextInput
              style={styles.modalInput}
              value={newEventName}
              onChangeText={setNewEventName}
              placeholder="Ex: Ligar luz às 19h"
              placeholderTextColor={Colors.text.muted}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setShowAddEvent(false); setNewEventName(''); }} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (newEventName.trim()) {
                    medium();
                    setEvents((ev) => [...ev, {
                      name: newEventName.trim(),
                      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    }]);
                  }
                  setShowAddEvent(false); setNewEventName('');
                }}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmText}>Adicionar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EmptyState({ emoji, title, text }: { emoji: string; title?: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { color: Colors.text.primary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: Colors.text.muted, fontSize: 13, marginTop: 3 },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 100, gap: 10 },
  sectionLabel: {
    color: Colors.text.muted, fontSize: 11, fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2,
  },

  // Device cards
  deviceCard: { padding: 0, overflow: 'hidden' },
  deviceOffline: { opacity: 0.6 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  deviceIcon: { fontSize: 26, width: 34, textAlign: 'center', flexShrink: 0 },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  deviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  deviceStatus: { color: Colors.text.muted, fontSize: 12 },
  deviceRoom: { color: Colors.text.muted, fontSize: 12 },
  deviceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expandChevron: { color: Colors.text.muted, fontSize: 14 },
  renameInput: {
    color: Colors.text.primary, fontSize: 15, fontWeight: '600',
    borderBottomWidth: 1, borderBottomColor: Colors.accent.primary, paddingVertical: 2,
  },
  deviceControls: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  controlsDivider: { height: 1, backgroundColor: Colors.glass.border, marginBottom: 4 },
  offlineMsg: { color: Colors.text.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  deviceActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: Colors.glass.light, borderWidth: 1, borderColor: Colors.glass.border,
  },
  actionBtnText: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },

  // Capability controls
  capRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  capCol: { gap: 8 },
  capLabel: { color: Colors.text.secondary, fontSize: 13, fontWeight: '500', flex: 1 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
  rangeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.glass.heavy, alignItems: 'center', justifyContent: 'center' },
  rangeBtnText: { color: Colors.text.primary, fontSize: 16, fontWeight: '600' },
  rangeTrack: { flex: 1, height: 4, backgroundColor: Colors.glass.heavy, borderRadius: 2, overflow: 'hidden' },
  rangeFill: { height: '100%', backgroundColor: Colors.accent.primary, borderRadius: 2 },
  rangeValue: { color: Colors.text.muted, fontSize: 12, width: 36, textAlign: 'right' },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectOpt: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.glass.medium, borderWidth: 1, borderColor: Colors.glass.border,
  },
  selectOptActive: { backgroundColor: Colors.accent.primary + '33', borderColor: Colors.accent.primary },
  selectOptText: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },
  selectOptTextActive: { color: Colors.accent.primary },
  colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: Colors.text.primary },

  // IA card (Automações)
  aiCard: { padding: 18, gap: 10 },
  aiTitle: { color: Colors.text.primary, fontSize: 16, fontWeight: '700' },
  aiDesc: { color: Colors.text.muted, fontSize: 13, lineHeight: 19 },
  aiInputRow: { gap: 8 },
  aiInput: {
    color: Colors.text.primary, fontSize: 15,
    backgroundColor: Colors.glass.light, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.glass.border,
    minHeight: 80, textAlignVertical: 'top',
  },
  aiSendBtn: {
    paddingVertical: 13, borderRadius: 12,
    backgroundColor: Colors.accent.primary, alignItems: 'center',
  },
  aiSendBtnDisabled: { opacity: 0.4 },
  aiSendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Automations list
  autoCard: { padding: 14 },
  autoInactive: { opacity: 0.45 },
  autoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  autoEmoji: { fontSize: 26, width: 34, textAlign: 'center', lineHeight: 32, flexShrink: 0 },
  autoInfo: { flex: 1, gap: 3 },
  autoName: { color: Colors.text.primary, fontSize: 14, fontWeight: '600' },
  autoDesc2: { color: Colors.text.muted, fontSize: 12 },
  autoTrigger: { color: Colors.accent.primary, fontSize: 11, marginTop: 2 },

  // Rooms
  addBtn: {
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.accent.primary + '18', borderWidth: 1,
    borderColor: Colors.accent.primary + '44', alignItems: 'center', marginBottom: 4,
  },
  addBtnText: { color: Colors.accent.primary, fontWeight: '600', fontSize: 14 },
  roomCard: { padding: 0, overflow: 'hidden' },
  roomHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  roomInfo: { flex: 1 },
  roomName: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  roomCount: { color: Colors.text.muted, fontSize: 13, marginTop: 2 },
  roomChevron: { color: Colors.text.muted, fontSize: 16 },
  roomBody: { paddingHorizontal: 12, paddingBottom: 12 },
  roomEmpty: { color: Colors.text.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12, lineHeight: 18 },
  deleteRoomBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center' },
  deleteRoomText: { color: Colors.status.error, fontSize: 13 },

  // Move room modal
  roomPillBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: Colors.glass.light, borderWidth: 1, borderColor: Colors.glass.border,
  },
  roomPillBtnActive: { backgroundColor: Colors.accent.primary + '22', borderColor: Colors.accent.primary },
  roomPillText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '500' },
  roomPillTextActive: { color: Colors.accent.primary, fontWeight: '700' },

  // Events
  eventCard: { padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventName: { color: Colors.text.primary, fontSize: 14, fontWeight: '500', flex: 1 },
  eventTime: { color: Colors.text.muted, fontSize: 12 },

  emptyState: {
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 40, paddingTop: 60, paddingBottom: 80,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: Colors.text.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: {
    backgroundColor: Colors.bg.elevated, borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 380, gap: 12, borderWidth: 1, borderColor: Colors.glass.border,
  },
  modalTitle: { color: Colors.text.primary, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  modalInput: {
    color: Colors.text.primary, fontSize: 16, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: Colors.glass.light, borderRadius: 10, borderWidth: 1, borderColor: Colors.glass.border,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.glass.medium, alignItems: 'center' },
  modalCancelText: { color: Colors.text.secondary, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent.primary, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
});
