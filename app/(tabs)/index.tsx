import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, SlideInDown } from 'react-native-reanimated';
import { router } from 'expo-router';

const isWeb = Platform.OS === 'web';
const enter = {
  down: (ms = 0) => (isWeb ? undefined : FadeInDown.delay(ms)),
  up: (ms = 0) => (isWeb ? undefined : FadeInUp.delay(ms)),
  slide: isWeb ? undefined : SlideInDown.springify(),
  downPlain: isWeb ? undefined : FadeInDown,
};

import { OrbCore } from '@/components/orb/OrbCore';
import { OrbStatus } from '@/components/orb/OrbStatus';
import { GlassCard } from '@/components/ui/GlassCard';
import { useArgos } from '@/hooks/useArgos';
import { useAIStore } from '@/stores/useAIStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useVoice } from '@/hooks/useVoice';
import { useHaptic } from '@/hooks/useHaptic';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Colors } from '@/constants/colors';
import { HOME_SUGGESTIONS } from '@/constants/orb';
import { handleInsightPress } from '@/services/insights/handleInsightPress';
import { BackgroundSetupModal } from '@/components/voice/BackgroundSetupModal';
import { stopAllSpeech } from '@/services/voice/textToSpeech';

export default function HomeScreen() {
  const { sendMessage, status } = useArgos();
  const { showExecutionOverlay, executionSteps, setLastInputMode, setStatus } = useAIStore();
  const { getActiveInsights, dismissInsight } = useMemoryStore();
  /*
   * Marca a origem como voz ANTES de mandar a mensagem. useArgos.speak() silencia
   * o TTS quando lastInputMode === 'text' (regra pra não falar em cima de quem
   * digitou) — mas essa flag é global no useAIStore, e só a tela de chat
   * (conversar.tsx) a setava. Aqui, na tela principal onde a wake word e o orb
   * realmente rodam, nada marcava 'voice': bastava ter digitado uma vez em
   * qualquer lugar do app para o Argos ficar mudo para sempre nesta tela — a
   * resposta aparecia no chat, mas a voz nunca saía.
   */
  const handleVoiceSend = useCallback(
    (text: string) => {
      setLastInputMode('voice');
      sendMessage(text);
    },
    [sendMessage, setLastInputMode]
  );

  const { isListening, transcript, error: voiceError, startListening, stopListening, isWakeListening, startWakeWordDetection, stopWakeWordDetection, isSupported } = useVoice({
    onAutoSend: handleVoiceSend,
  });
  const { light, medium } = useHaptic();
  const { settings, updateSettings } = useSettingsStore();

  const [textInput, setTextInput] = useState('');
  const [isInputFocused, setInputFocused] = useState(false);
  const [micPromptDismissed, setMicPromptDismissed] = useState(false);
  const [showBgSetup, setShowBgSetup] = useState(false);
  const activatingRef = useRef(false);

  // Mostra o prompt de ativar escuta apenas na web, quando autoListen está on mas wake word não iniciou
  const showMicPrompt =
    Platform.OS === 'web' &&
    isSupported &&
    settings.autoListen &&
    !isWakeListening &&
    !isListening &&
    status === 'idle' &&
    !micPromptDismissed;

  // Esconde o prompt assim que o wake word ativar
  useEffect(() => {
    if (isWakeListening) setMicPromptDismissed(true);
  }, [isWakeListening]);

  /*
   * No nativo, sobe a escuta contínua já na abertura do app: pede a permissão de
   * microfone uma única vez e a partir daí o Argos fica ouvindo a wake word pelo
   * foreground service, sem precisar tocar no orb. Antes isso só acontecia depois
   * do primeiro toque, o que derrotava o propósito da escuta contínua.
   */
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (bootstrappedRef.current) return;
    if (!settings.autoListen) return;
    bootstrappedRef.current = true;
    void startWakeWordDetection();
  }, [settings.autoListen, startWakeWordDetection]);

  const handleActivateVoice = useCallback(async () => {
    if (activatingRef.current) return;
    activatingRef.current = true;
    light();
    try {
      const { requestMicPermission } = await import('@/services/voice/micPermission');
      const granted = await requestMicPermission();
      if (granted) {
        void startWakeWordDetection();
      } else {
        setMicPromptDismissed(true); // permissão negada, esconde o prompt
      }
    } finally {
      activatingRef.current = false;
    }
  }, [light, startWakeWordDetection]);

  const activeInsights = getActiveInsights();

  const handleOrbPress = useCallback(() => {
    light();
    if (isListening) {
      stopListening(true);
    } else {
      startListening();
    }
  }, [isListening, light, stopListening, startListening]);

  /** Botão de mudo (A-050): interrompe a fala em qualquer motor de TTS. */
  const handleMuteSpeech = useCallback(() => {
    light();
    void stopAllSpeech();
    // Não espera a Promise: força o status de volta agora, por segurança —
    // ver comentário em stopAllSpeech() sobre por quê.
    setStatus('idle');
  }, [light, setStatus]);

  const handleSend = useCallback(() => {
    if (!textInput.trim()) return;
    medium();
    sendMessage(textInput);
    setTextInput('');
  }, [textInput, medium, sendMessage]);

  const handleSuggestion = useCallback(
    (text: string) => {
      light();
      sendMessage(text);
    },
    [light, sendMessage]
  );

  const inputCardStyle = StyleSheet.flatten([
    styles.inputCard,
    isInputFocused ? { borderColor: Colors.glass.borderAccent } : {},
  ]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.bg.primary, Colors.bg.secondary, Colors.bg.primary]}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
          style={styles.keyboard}
        >
          <View style={styles.main}>
            <View style={styles.topSection}>
              <Animated.View entering={enter.down(100)} style={styles.header}>
                {/* O \u00A0 final NAO e enfeite: ver o comentario em styles.greeting. */}
                <Text style={styles.greeting}>{'Argos\u00A0'}</Text>
                <View style={styles.headerActions}>
                  {/*
                   * A-060: "Rotinas" vivia só na 4ª sub-aba de Agenda, e a
                   * tela completa de Automações+Rotinas (app/(tabs)/
                   * automations.tsx, que já tem as duas juntas em sub-abas)
                   * não tinha NENHUM link em lugar nenhum do app — rota
                   * inteiramente órfã. Atalho aqui, ao lado do botão de
                   * memória, no lugar mais visível do app (topo da Home).
                   */}
                  <Pressable
                    onPress={() => router.push('/(tabs)/automations')}
                    style={styles.memoryButton}
                  >
                    <Text style={styles.memoryButtonText}>🔄</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/(modals)/memory')}
                    style={styles.memoryButton}
                  >
                    <Text style={styles.memoryButtonText}>🧠</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </View>

            <View style={styles.bottomStack}>
              {showExecutionOverlay && executionSteps.length > 0 && (
                <Animated.View entering={enter.slide} style={styles.executionContainer}>
                  <GlassCard style={styles.executionCard} borderColor={Colors.glass.borderAccent}>
                    <Text style={styles.executionTitle}>Executando ações</Text>
                    {executionSteps.map((step, i) => (
                      <View key={i} style={styles.executionStep}>
                        <Text style={styles.executionStepIcon}>
                          {step.status === 'pending'
                            ? '⏳'
                            : step.status === 'running'
                              ? '⚡'
                              : step.status === 'success'
                                ? '✅'
                                : '❌'}
                        </Text>
                        <Text
                          style={[
                            styles.executionStepLabel,
                            {
                              color:
                                step.status === 'success'
                                  ? Colors.status.success
                                  : step.status === 'error'
                                    ? Colors.status.error
                                    : Colors.text.primary,
                            },
                          ]}
                        >
                          {step.label}
                        </Text>
                      </View>
                    ))}
                  </GlassCard>
                </Animated.View>
              )}

              <Animated.View entering={enter.down(300)} style={styles.orbContainer}>
                <OrbCore
                  status={isListening ? 'listening' : status}
                  onPress={handleOrbPress}
                  onLongPress={() => {
                    medium();
                    startListening();
                  }}
                />
                <OrbStatus status={isListening ? 'listening' : status} />
                {showMicPrompt && (
                  <Pressable onPress={handleActivateVoice} style={styles.micPrompt}>
                    <Text style={styles.micPromptText}>🎤 Toque para ativar escuta contínua</Text>
                  </Pressable>
                )}
                {isListening && transcript ? (
                  <Animated.Text entering={enter.downPlain} style={styles.transcriptText}>
                    "{transcript}"
                  </Animated.Text>
                ) : null}
                {isListening || status === 'listening' ? (
                  <View style={styles.listenActions}>
                    <Pressable
                      onPress={() => { light(); stopListening(true); }}
                      style={[styles.listenBtn, styles.listenBtnSend]}
                    >
                      <Text style={styles.listenBtnText}>✓ Enviar agora</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { light(); stopListening(false); }}
                      style={styles.listenBtn}
                    >
                      <Text style={styles.listenBtnText}>✕ Cancelar</Text>
                    </Pressable>
                  </View>
                ) : null}
                {status === 'speaking' ? (
                  <View style={styles.listenActions}>
                    <Pressable onPress={handleMuteSpeech} style={styles.listenBtn}>
                      <Text style={styles.listenBtnText}>🔇 Silenciar</Text>
                    </Pressable>
                  </View>
                ) : null}
                {Platform.OS !== 'web' && !isListening && status === 'idle' ? (
                  <Pressable
                    onPress={() => {
                      light();
                      if (isWakeListening) {
                        updateSettings({ autoListen: false });
                        void stopWakeWordDetection();
                      } else {
                        updateSettings({ autoListen: true });
                        void startWakeWordDetection();
                        // Na primeira vez, mostra as liberações de bateria/autostart —
                        // sem elas o Android derruba a escuta ao sair do app.
                        if (!settings.backgroundSetupSeen) setShowBgSetup(true);
                      }
                    }}
                    style={[styles.wakeToggle, isWakeListening && styles.wakeToggleOn]}
                  >
                    <Text
                      style={[styles.wakeHint, isWakeListening && styles.wakeHintOn]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {isWakeListening
                        ? `🎧 Ouvindo — diga “${settings.wakeWord || 'Argos'}” (toque para parar)`
                        : '🎧 Ativar escuta contínua'}
                    </Text>
                  </Pressable>
                ) : null}
                {voiceError ? (
                  <Text style={styles.voiceError}>🎙 {voiceError}</Text>
                ) : null}
              </Animated.View>

              {/*
               * #175 (regressão do #164): o #164 tinha trocado o bottomStack
               * inteiro por ScrollView para o problema original (cartões de
               * sugestão cortados) — mas um ScrollView com flex:1 dentro
               * dessa cadeia de containers cresce para o tamanho do
               * CONTEÚDO em vez de respeitar o espaço flexível disponível,
               * empurrando a caixa de input (sibling de `main`, fora daqui)
               * pra fora da tela. bottomStack volta a ser View comum; só
               * insights+sugestões — o conteúdo que pode mesmo crescer sem
               * limite — entram num ScrollView com maxHeight FIXO (não
               * flex:1), que não sofre desse problema: nunca cresce além do
               * teto, e rola por dentro se não couber.
               */}
              <ScrollView
                style={styles.overflowSection}
                contentContainerStyle={styles.overflowSectionContent}
                showsVerticalScrollIndicator={false}
              >
                {activeInsights.length > 0 && (
                  <Animated.View entering={enter.down(350)} style={styles.insightsSection}>
                    <Text style={styles.sectionTitle}>Insights</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {activeInsights.map((insight) => (
                        <Pressable
                          key={insight.id}
                          onPress={() => handleInsightPress(insight, handleSuggestion, dismissInsight)}
                        >
                          <GlassCard style={styles.insightCard}>
                            <Text style={styles.insightText} numberOfLines={2}>
                              {insight.message}
                            </Text>
                            {insight.suggestion ? (
                              <Text style={styles.insightSuggestion} numberOfLines={1}>
                                {insight.suggestion} →
                              </Text>
                            ) : null}
                          </GlassCard>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </Animated.View>
                )}

                <Animated.View entering={enter.down(150)} style={styles.suggestionsSection}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {HOME_SUGGESTIONS.map((suggestion) => (
                      <Pressable
                        key={suggestion.label}
                        onPress={() => handleSuggestion(suggestion.message)}
                        style={styles.suggestionPill}
                      >
                        <Text style={styles.suggestionText}>{suggestion.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Animated.View>
              </ScrollView>
            </View>
          </View>

          <Animated.View entering={enter.up(300)} style={styles.inputContainer}>
            <GlassCard
              style={inputCardStyle}
              borderColor={isInputFocused ? Colors.glass.borderAccent : Colors.glass.border}
            >
              {/*
               * GlassCard aplica o `style` recebido (inputCardStyle, com
               * flexDirection:'row') no View EXTERNO, mas quem envolve os
               * children é o View INTERNO (styles.content), que não herda
               * esse flexDirection e cai no padrão 'column' do RN — daí o
               * botão de enviar empilhar embaixo do campo em vez de ao lado.
               * conversar.tsx não tem esse bug porque já envolve os filhos
               * manualmente num View row; replicando o mesmo padrão aqui.
               *
               * #206/#203: mesmo com esse wrap manual, `inputRow` tinha
               * `flex: 1` — dentro do `content` do GlassCard (altura
               * automática, eixo principal vertical) isso zera o flex-basis
               * do row e ele colapsa pra altura dos filhos de tamanho fixo
               * (os 36px do botão), espremendo o TextInput. conversar.tsx
               * nunca teve `flex:1` no inputRow; removido aqui também.
               */}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Digite uma mensagem ou comando..."
                  placeholderTextColor={Colors.text.muted}
                  value={textInput}
                  onChangeText={setTextInput}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                  multiline={false}
                />
                <Pressable
                  onPress={handleSend}
                  style={[styles.sendButton, { opacity: textInput.trim() ? 1 : 0.3 }]}
                >
                  <Text style={styles.sendIcon}>↑</Text>
                </Pressable>
              </View>
            </GlassCard>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <BackgroundSetupModal
        visible={showBgSetup}
        onClose={() => setShowBgSetup(false)}
        onDone={() => {
          updateSettings({ backgroundSetupSeen: true });
          setShowBgSetup(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary, overflow: 'hidden' },
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  keyboard: { flex: 1, backgroundColor: Colors.bg.primary },
  main: { flex: 1, overflow: 'hidden', backgroundColor: Colors.bg.primary },
  topSection: { flexShrink: 0, zIndex: 2, backgroundColor: Colors.bg.primary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  /*
   * "Argos" aparecia como "Argo" no Android: o ultimo glifo era cortado.
   *
   * Primeira tentativa (paddingRight) NAO funcionou, e o motivo importa: o
   * Android subestima a largura do RUN DE TEXTO e corta na borda do conteudo —
   * o padding fica por fora dessa borda e nao entra na conta. Para curar e
   * preciso aumentar o proprio texto, nao a caixa.
   *
   * Por isso duas medidas juntas:
   *   1. `letterSpacing` removido — e ele que faz a largura ser subestimada,
   *      porque o espaco depois da ultima letra nao entra na medicao.
   *   2. um ` ` (espaco fixo) no fim da string, no JSX — ele tem largura
   *      real e e medido, entao o que sobrar para cortar e ele, nunca o "s".
   *      Invisivel: o titulo e alinhado a esquerda.
   *
   * Se mexer aqui, conferir no aparelho — o efeito nao aparece no typecheck
   * nem no web.
   */
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: '#C4B5FD',
    paddingRight: 8,
    flexShrink: 0,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memoryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glass.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryButtonText: { fontSize: 20 },
  suggestionsSection: {
    width: '100%',
  },
  suggestionPill: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
  },
  suggestionText: { color: '#C4B5FD', fontSize: 13, fontWeight: '500' },
  /*
   * #175: o #164 tinha trocado isto por ScrollView (flex:1 +
   * contentContainerStyle) pra corrigir o corte dos cartões de sugestão em
   * tela pequena — mas um ScrollView com flex:1 nesta cadeia de containers
   * cresce para o tamanho do CONTEÚDO em vez de respeitar o espaço
   * disponível, empurrando a caixa de input pra fora da tela (regressão
   * confirmada em aparelho real). Voltou a ser View comum; ver
   * `overflowSection` abaixo pra saber onde o scroll ficou.
   */
  bottomStack: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 4,
    gap: 10,
  },
  /*
   * Só insights + sugestões — o conteúdo de altura variável que motivou o
   * #164 — ficam num ScrollView com maxHeight FIXO. Diferente de flex:1,
   * maxHeight é um teto que o Yoga sempre respeita independente do resto da
   * árvore de layout: nunca cresce além dele (então nunca empurra o input),
   * e rola por dentro quando o conteúdo passa do teto (então nunca corta).
   *
   * #203: faltava `flexGrow: 0`. O `<ScrollView>` do RN aplica um baseStyle
   * interno com `flexGrow: 1` (ver ScrollView.js) ANTES do style daqui —
   * sem zerar isso, o ScrollView cresce pra preencher todo espaço livre de
   * `bottomStack` (até o teto de 190), sobrando vão vazio DENTRO dele quando
   * há poucos itens, e ainda rouba o espaço que devia ficar acima do orb via
   * `justifyContent: 'flex-end'` — resultado: orb colado no topo, vão vazio
   * gigante antes da barra de input. `flexGrow: 0` faz o ScrollView se
   * ajustar ao conteúdo de verdade (até o teto), preservando o `flex-end`.
   */
  overflowSection: {
    maxHeight: 190,
    flexGrow: 0,
  },
  overflowSectionContent: {
    gap: 10,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  micPrompt: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  micPromptText: {
    color: '#C4B5FD',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  transcriptText: {
    marginTop: 12,
    color: Colors.text.secondary,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    fontStyle: 'italic',
  },
  listenActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  listenBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.45)',
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
  },
  listenBtnSend: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  listenBtnText: { color: '#EDE9FE', fontSize: 13, fontWeight: '600' },
  wakeToggle: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    // A wake word é configurável pelo usuário e pode ser longa — sem isso o
    // Pressable crescia até caber o texto numa linha só e estourava a
    // largura da tela.
    maxWidth: '92%',
    alignSelf: 'center',
  },
  wakeToggleOn: {
    borderColor: 'rgba(134, 239, 172, 0.45)',
    backgroundColor: 'rgba(134, 239, 172, 0.10)',
  },
  wakeHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  wakeHintOn: { color: '#86efac', fontSize: 12 },
  voiceError: {
    marginTop: 10,
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  executionContainer: { width: '100%', marginBottom: 12 },
  executionCard: { padding: 16, gap: 10 },
  executionTitle: {
    color: Colors.accent.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  executionStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  executionStepIcon: { fontSize: 16 },
  executionStepLabel: { fontSize: 14, flex: 1 },
  insightsSection: { width: '100%' },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingRight: 24,
  },
  insightCard: { padding: 12, marginRight: 10, width: 200, minHeight: 72, gap: 4 },
  insightText: { color: Colors.text.primary, fontSize: 13, lineHeight: 18 },
  insightSuggestion: { color: '#A78BFA', fontSize: 12, fontWeight: '500' },
  inputContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 4 : 88,
    backgroundColor: Colors.bg.primary,
    flexShrink: 0,
  },
  inputCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, color: Colors.text.primary, fontSize: 16, paddingVertical: 12, minHeight: 44 },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
