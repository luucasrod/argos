/**
 * BackgroundSetupModal.tsx — pede as liberações necessárias para o Argos ouvir
 * com o app fechado, e leva a pessoa até a tela certa de cada uma.
 *
 * Existe porque permissão de microfone não basta: isenção de bateria e autostart
 * ficam escondidos em lugares diferentes em cada fabricante, e ninguém encontra
 * sozinho. Aparece na primeira vez que a escuta contínua é ligada, e depois pode
 * ser reaberto pelo botão de ajustes na tela inicial.
 */
import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { buildSetupSteps, deviceLabel } from '@/services/voice/deviceSetup';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function BackgroundSetupModal({ visible, onClose, onDone }: Props) {
  const steps = buildSetupSteps();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Para o Argos ouvir sempre</Text>
          <Text style={styles.subtitle}>
            Faltam {steps.length} liberação{steps.length !== 1 ? 'ões' : ''} do Android.
            Sem elas o Argos para de ouvir quando você sai do app.
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
            {steps.map((s, i) => (
              <View key={s.key} style={styles.step}>
                <View style={styles.stepHead}>
                  <View style={styles.num}>
                    <Text style={styles.numText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                </View>
                <Text style={styles.why}>{s.why}</Text>
                <View style={styles.hintBox}>
                  <Text style={styles.hint}>{s.hint}</Text>
                </View>
                <Pressable style={styles.openBtn} onPress={() => { void s.action(); }}>
                  <Text style={styles.openBtnText}>{s.actionLabel} →</Text>
                </Pressable>
              </View>
            ))}

            <Text style={styles.footnote}>
              {deviceLabel()
                ? `Instruções ajustadas para o seu ${deviceLabel()}.`
                : 'O caminho exato muda conforme o fabricante.'}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Depois</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={onDone}>
              <Text style={styles.btnText}>Já liberei</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  title: { color: Colors.text.primary, fontSize: 20, fontWeight: '700' },
  subtitle: { color: Colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 8 },
  scroll: { marginTop: 16 },
  scrollInner: { paddingBottom: 8, gap: 16 },
  step: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepTitle: { color: Colors.text.primary, fontSize: 15, fontWeight: '600' },
  why: { color: Colors.text.secondary, fontSize: 12, lineHeight: 18 },
  hintBox: {
    backgroundColor: 'rgba(124,58,237,0.10)',
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
    borderRadius: 6,
    padding: 10,
  },
  hint: { color: '#C4B5FD', fontSize: 12, lineHeight: 18 },
  openBtn: {
    backgroundColor: 'rgba(124,58,237,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.5)',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  openBtnText: { color: '#DDD6FE', fontSize: 13, fontWeight: '600' },
  footnote: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  btnGhostText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '600' },
});
