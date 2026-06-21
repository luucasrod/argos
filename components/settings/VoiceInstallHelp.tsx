import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/colors';
import { reloadVoices, unlockSpeech } from '@/services/voice/speechUnlock';
import { analyzeDeviceVoices } from '@/services/voice/voicePicker';
import { textToSpeech } from '@/services/voice/textToSpeech';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { VOICE_PREVIEW_PHRASE } from '@/constants/voice';

function isIOSWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

interface VoiceInstallHelpProps {
  voiceGender: 'female' | 'male';
}

export function VoiceInstallHelp({ voiceGender }: VoiceInstallHelpProps) {
  const { settings } = useSettingsStore();
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeDeviceVoices> | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    setLoading(true);
    setStatusMsg(null);

    try {
      unlockSpeech();
      const voices = await reloadVoices();
      const result = analyzeDeviceVoices(voices);
      setAnalysis(result);

      if (result.hasDistinctMale) {
        setStatusMsg(`Felipe detectado: ${result.maleVoiceName}`);
      } else if (result.ptBrVoices.length === 0) {
        setStatusMsg('Nenhuma voz pt-BR encontrada. Feche e reabra o Argos, depois tente de novo.');
      } else {
        setStatusMsg(
          `Vozes encontradas: ${result.ptBrVoices.join(', ')}. Felipe ainda não apareceu — confira o download nos Ajustes.`
        );
      }
    } catch {
      setStatusMsg('Erro ao atualizar. Tente fechar e reabrir o app.');
    } finally {
      setLoading(false);
    }
  }, []);

  const testMaleVoice = useCallback(async () => {
    unlockSpeech();
    await textToSpeech(VOICE_PREVIEW_PHRASE, {
      ...settings.personality,
      voiceGender: 'male',
    });
  }, [settings.personality]);

  useEffect(() => {
    if (voiceGender === 'male') void refresh();
  }, [voiceGender, refresh]);

  if (Platform.OS !== 'web' || voiceGender !== 'male') return null;

  const showIOS = isIOSWeb();
  const hasFelipe = analysis?.hasDistinctMale ?? false;

  return (
    <View style={styles.box}>
      {analysis && analysis.ptBrVoices.length > 0 ? (
        <Text style={styles.voicesList}>
          Vozes pt-BR: {analysis.ptBrVoices.join(', ')}
        </Text>
      ) : null}

      {hasFelipe ? (
        <Text style={styles.ok}>✓ Voz masculina ativa: {analysis?.maleVoiceName}</Text>
      ) : (
        <>
          <Text style={styles.title}>Instalar voz masculina (Felipe)</Text>
          <Text style={styles.text}>
            No iPhone a voz feminina (Luciana) vem por padrão. Baixe o Felipe nos Ajustes do sistema.
          </Text>
          {showIOS ? (
            <Text style={styles.steps}>
              Ajustes → Acessibilidade → Conteúdo Falado → Vozes → Português (Brasil) → Felipe
              {'\n\n'}
              Depois de baixar, volte aqui e toque em Atualizar vozes.
            </Text>
          ) : null}
        </>
      )}

      {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, loading && styles.btnDisabled]}
        onPress={() => void refresh()}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#A78BFA" size="small" />
        ) : (
          <Text style={styles.btnText}>🔄 Atualizar vozes</Text>
        )}
      </Pressable>

      <Pressable style={styles.testBtn} onPress={() => void testMaleVoice()}>
        <Text style={styles.testBtnText}>🔊 Testar voz masculina</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.28)',
    gap: 8,
  },
  title: { color: '#C4B5FD', fontWeight: '700', fontSize: 14 },
  text: { color: Colors.text.secondary, fontSize: 13, lineHeight: 19 },
  steps: { color: Colors.text.muted, fontSize: 12, lineHeight: 18 },
  voicesList: { color: Colors.text.muted, fontSize: 11, lineHeight: 16 },
  ok: { color: Colors.status.success, fontSize: 13, fontWeight: '600' },
  status: { color: '#A78BFA', fontSize: 12, lineHeight: 17 },
  btn: {
    marginTop: 4,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#C4B5FD', fontWeight: '700', fontSize: 14 },
  testBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  testBtnText: { color: Colors.text.secondary, fontWeight: '600', fontSize: 13 },
});
