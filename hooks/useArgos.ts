import { useCallback, useRef } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { getApiErrorMessage, getSpeechErrorMessage } from '@/services/ai/anthropic';
import { createMessage, isConfigured as isAnthropicConfigured } from '@/services/ai/anthropicProxy';
import { resolveAnthropicModel } from '@/services/ai/config';
import { buildApiMessageHistory } from '@/services/ai/chatMessages';
import { buildSystemPrompt } from '@/services/ai/systemPrompt';
import { parseAIResponse, ParsedIntent } from '@/services/ai/intentParser';
import { matchFastDeviceCommand } from '@/services/ai/fastIntent';
import { textToSpeech } from '@/services/voice/textToSpeech';
import { pauseVoiceInput, waitForMicRelease } from '@/services/voice/voiceSession';
import { resolveIntentSpeech } from '@/services/voice/speechText';
import { isAuthRequired } from '@/services/auth/config';
import { Message } from '@/types/ai.types';
import { Automation } from '@/types/automation.types';
import { useHaptic } from './useHaptic';
import { Platform } from 'react-native';
import type { AIPersonality } from '@/types/ai.types';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/** Determina se um intent precisa de confirmação no modo assistido */
function needsConfirmation(intent: ParsedIntent): boolean {
  return ['device_control', 'automation', 'open_url', 'set_reminder', 'save_note'].includes(
    intent.type
  );
}

/** Gera a descrição legível do modal de confirmação */
function buildConfirmationInfo(intent: ParsedIntent): {
  description: string;
  actionLabel: string;
  icon: string;
} {
  switch (intent.type) {
    case 'device_control': {
      const count = intent.actions?.length ?? 0;
      const labels = intent.actions?.map((a) => a.label).join(', ') ?? '';
      return {
        icon: '💡',
        actionLabel: labels || 'Controlar dispositivos',
        description: `Vai executar ${count} ação${count !== 1 ? 'ões' : ''} em dispositivos:\n${labels}`,
      };
    }
    case 'automation':
      return {
        icon: '⚡',
        actionLabel: intent.automation?.name as string || 'Nova automação',
        description: `Vai criar a automação: "${intent.automation?.name ?? 'Nova automação'}"`,
      };
    case 'open_url': {
      const url = intent.url ?? '';
      return {
        icon: '📱',
        actionLabel: `Abrir ${url}`,
        description: `Vai abrir o app ou site "${url}". No iPhone você confirma com um toque.`,
      };
    }
    case 'set_reminder':
      return {
        icon: '⏰',
        actionLabel: intent.title ?? 'Lembrete',
        description: `Vai criar um lembrete "${intent.title}" em ${intent.delayMinutes ?? 1} minuto(s).`,
      };
    case 'save_note':
      return {
        icon: '📝',
        actionLabel: intent.title ?? 'Salvar nota',
        description: `Vai salvar a nota "${intent.title}".`,
      };
    default:
      return {
        icon: '🤖',
        actionLabel: 'Executar ação',
        description: intent.text || intent.speech || 'Executar ação solicitada.',
      };
  }
}

export function useArgos() {
  const {
    status,
    setStatus,
    addMessage,
    setExecutionSteps,
    updateExecutionStep,
    clearExecutionSteps,
    setShowExecutionOverlay,
    setConfirmationRequest,
    setPendingAppOpen,
  } = useAIStore();

  const { settings } = useSettingsStore();
  const { memories, addMemory } = useMemoryStore();
  const { automations, addAutomation } = useAutomationStore();
  const { devices, toggleDevice, updateDeviceState, syncEwelinkDevices, ewelinkConnected, tuyaConnected, syncTuyaDevices } = useDeviceStore();
  const { heavy, success } = useHaptic();
  const processingRef = useRef(false);

  const speak = useCallback(
    async (text: string, personality: AIPersonality = settings.personality) => {
      if (!text.trim()) return;
      // Silencia TTS quando a última entrada foi por texto (não por voz)
      if (useAIStore.getState().lastInputMode === 'text') return;
      // Solta o microfone (incl. a escuta da wake word) antes de falar — evita
      // disputa entre captura e síntese de voz, que trava ou atrasa o áudio.
      pauseVoiceInput();
      await waitForMicRelease();
      const { unlockSpeech } = await import('@/services/voice/speechUnlock');
      unlockSpeech();
      setStatus('speaking');
      await textToSpeech(text, personality);
    },
    [setStatus, settings.personality]
  );

  const processIntent = useCallback(
    async (intent: ParsedIntent) => {
      const assistantMessageId = `msg-${Date.now()}-assistant`;

      if (intent.type === 'device_control' && intent.actions && intent.actions.length > 0) {
        const spoken = resolveIntentSpeech(intent);
        if (spoken) await speak(spoken);

        setStatus('executing');

        const steps = intent.actions.map((a) => ({
          label: a.label,
          status: 'pending' as const,
        }));
        setExecutionSteps(steps);
        setShowExecutionOverlay(true);

        // Cada ação é isolada: se uma falhar, as outras ainda rodam e o passo é
        // marcado como erro em vez de abortar o laço inteiro (era o que deixava
        // o overlay preso e o status congelado em 'executing').
        const stepResults: Array<'success' | 'error'> = [];

        try {
          for (let i = 0; i < intent.actions.length; i++) {
            const action = intent.actions[i];
            updateExecutionStep(i, 'running');

            await new Promise((r) => setTimeout(r, 150));

            try {
              if (action.action === 'toggle') {
                toggleDevice(action.deviceId);
              } else if (action.action === 'setOn') {
                updateDeviceState(action.deviceId, 'isOn', true);
              } else if (action.action === 'setOff') {
                updateDeviceState(action.deviceId, 'isOn', false);
              } else if (action.action === 'setValue') {
                updateDeviceState(action.deviceId, action.property, action.value);
              }
              updateExecutionStep(i, 'success');
              stepResults.push('success');
            } catch (err) {
              if (__DEV__) console.error('[Argos] Falha ao executar ação:', action, err);
              updateExecutionStep(i, 'error');
              stepResults.push('error');
            }
          }

          const anyOk = stepResults.some((s) => s === 'success');
          if (anyOk) success();

          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: anyOk
              ? intent.text || intent.speech || spoken
              : 'Não consegui falar com o dispositivo agora. Confira a conexão da integração.',
            timestamp: new Date(),
            type: anyOk ? 'action' : 'error',
            metadata: {
              executedActions: intent.actions.map((a, idx) => ({
                id: `exec-${idx}`,
                label: a.label,
                status: stepResults[idx] ?? 'error',
                deviceId: a.deviceId,
              })),
            },
          });
        } finally {
          // Sempre libera a UI, mesmo se algo inesperado estourar acima.
          setTimeout(() => {
            setShowExecutionOverlay(false);
            clearExecutionSteps();
            setStatus('idle');
          }, 900);
        }

      } else if (intent.type === 'automation' && intent.automation) {
        setStatus('executing');

        const messages = useAIStore.getState().messages;
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

        const automationData = intent.automation as Partial<Automation>;
        const newAutomation: Automation = {
          id: `auto-${Date.now()}`,
          name: automationData.name || 'Nova automação',
          description: automationData.description || '',
          emoji: automationData.emoji || '⚡',
          isActive: true,
          isPreset: false,
          trigger: automationData.trigger || {
            type: 'manual',
            config: {},
            label: 'Manual',
          },
          actions: automationData.actions || [],
          createdAt: new Date(),
          runCount: 0,
          createdBy: 'ai',
          naturalLanguageInput: lastUserMessage?.content,
        };

        addAutomation(newAutomation);

        const spoken = resolveIntentSpeech(intent);
        if (spoken) await speak(spoken);

        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: intent.text || intent.speech,
          timestamp: new Date(),
          type: 'automation',
          metadata: { createdAutomation: newAutomation },
        });

      } else if (intent.type === 'open_url' && intent.url) {
        if (Platform.OS === 'web') {
          const { prepareAppOpen, openAppAuto } = await import('@/services/browser/browserActions');
          const target = prepareAppOpen(intent.url);
          const mode = openAppAuto(target);

          const spoken = resolveIntentSpeech(intent);
          if (spoken) await speak(spoken);
          setStatus('idle');

          if (mode === 'pending') {
            setPendingAppOpen({
              label: target.label,
              webUrl: target.webUrl,
              nativeUrl: target.nativeUrl,
              input: intent.url,
            });
            addMessage({
              id: assistantMessageId,
              role: 'assistant',
              content:
                intent.text ||
                `📱 Toque em **Abrir ${target.label}** na barra abaixo para abrir o app.`,
              timestamp: new Date(),
              type: 'text',
            });
          } else {
            addMessage({
              id: assistantMessageId,
              role: 'assistant',
              content:
                intent.text ||
                (mode === 'native'
                  ? `Abrindo ${target.label}...`
                  : `Abrindo ${target.label} no navegador...`),
              timestamp: new Date(),
              type: 'text',
            });
          }
        } else {
          await speak('Abrir URLs só está disponível na versão web.', settings.personality);
          setStatus('idle');
          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: 'Abrir URLs só está disponível na versão web do Argos.',
            timestamp: new Date(),
            type: 'text',
          });
        }

      } else if (intent.type === 'get_weather') {
        const intro = resolveIntentSpeech(intent) || 'Verificando o clima...';
        await speak(intro);
        setStatus('executing');

        try {
          let weatherText: string;
          let weatherContent: string;

          if (Platform.OS === 'web') {
            const { getWeather } = await import('@/services/browser/weatherService');
            const result = await getWeather(intent.cityName);
            weatherText = result.formatted;
            weatherContent =
              `🌤 **${result.city}** — ${result.temperature}°C\n` +
              `${result.description}\n` +
              `Sensação: ${result.feelsLike}°C · Umidade: ${result.humidity}% · Vento: ${result.windSpeed} km/h`;
          } else {
            weatherText = 'Verificação de clima só está disponível na versão web.';
            weatherContent = weatherText;
          }

          setStatus('speaking');
          await speak(weatherText);
          setStatus('idle');

          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: weatherContent,
            timestamp: new Date(),
            type: 'text',
          });
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Não consegui obter o clima agora.';
          setStatus('speaking');
          await speak(errorMsg);
          setStatus('idle');
          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: errorMsg,
            timestamp: new Date(),
            type: 'error',
          });
        }

      } else if (intent.type === 'set_reminder') {
        const title = intent.title || 'Lembrete';
        const message = intent.message || title;
        const delayMinutes = intent.delayMinutes ?? 1;
        const delayMs = delayMinutes * 60 * 1000;

        if (Platform.OS === 'web') {
          const { scheduleReminder } = await import('@/services/browser/browserActions');
          await scheduleReminder(title, message, delayMs);
        }

        const speechText =
          intent.speech?.trim() ||
          `Lembrete criado! Vou te avisar em ${delayMinutes} minuto${delayMinutes !== 1 ? 's' : ''}.`;

        await speak(speechText);
        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content:
            intent.text ||
            `⏰ **${title}** agendado para ${delayMinutes} minuto${delayMinutes !== 1 ? 's' : ''}.\n${message}`,
          timestamp: new Date(),
          type: 'text',
        });

      } else if (intent.type === 'save_note') {
        const noteTitle = intent.title || 'Nota';
        const noteContent = intent.noteContent || '';

        try {
          if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
            const existing = JSON.parse(localStorage.getItem('argos_notes') || '[]');
            existing.push({
              id: `note-${Date.now()}`,
              title: noteTitle,
              content: noteContent,
              createdAt: new Date().toISOString(),
            });
            localStorage.setItem('argos_notes', JSON.stringify(existing));
          }
        } catch {
          // Ignora erros de storage
        }

        const speechText = intent.speech?.trim() || 'Nota salva!';
        await speak(speechText);
        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: intent.text || `📝 **${noteTitle}**\n${noteContent}`,
          timestamp: new Date(),
          type: 'text',
        });

      } else {
        const spoken = resolveIntentSpeech(intent);
        if (spoken) await speak(spoken);

        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: intent.text || intent.speech || spoken,
          timestamp: new Date(),
          type: 'text',
        });
      }
    },
    [
      settings,
      toggleDevice,
      updateDeviceState,
      addAutomation,
      addMessage,
      setStatus,
      setExecutionSteps,
      updateExecutionStep,
      clearExecutionSteps,
      setShowExecutionOverlay,
      success,
      speak,
      setPendingAppOpen,
    ]
  );

  /** Confirma a ação pendente (chamado pelo modal de confirmação) */
  const confirmPendingAction = useCallback(async () => {
    const req = useAIStore.getState().confirmationRequest;
    if (!req) return;
    setConfirmationRequest(null);
    await processIntent(req.intent);
  }, [processIntent, setConfirmationRequest]);

  /** Cancela a ação pendente */
  const cancelPendingAction = useCallback(() => {
    const req = useAIStore.getState().confirmationRequest;
    if (!req) return;
    setConfirmationRequest(null);
    setStatus('idle');
    // Resposta de cancelamento no chat
    addMessage({
      id: `msg-${Date.now()}-cancel`,
      role: 'assistant',
      content: 'Ok, ação cancelada.',
      timestamp: new Date(),
      type: 'text',
    });
  }, [setConfirmationRequest, setStatus, addMessage]);

  const sendMessage = useCallback(
    async (userInput: string) => {
      const trimmed = userInput.trim();
      if (!trimmed) return;

      if (processingRef.current) return;

      const currentStatus = useAIStore.getState().status;
      if (currentStatus === 'executing') return;

      processingRef.current = true;
      pauseVoiceInput();

      const userMessage: Message = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        type: 'text',
      };

      addMessage(userMessage);

      // Comando óbvio de dispositivo (ex: "desliga a tomada") — executa direto,
      // sem chamar a IA. Corta toda a espera de "pensando" pro caso mais comum.
      const fastIntent = matchFastDeviceCommand(trimmed, useDeviceStore.getState().devices);
      if (fastIntent) {
        heavy();
        try {
          if (settings.autonomyLevel === 'assisted' && needsConfirmation(fastIntent)) {
            const confirmInfo = buildConfirmationInfo(fastIntent);
            const spoken = resolveIntentSpeech(fastIntent);
            if (spoken) await speak(spoken);
            setStatus('idle');
            addMessage({
              id: `msg-${Date.now()}-confirm`,
              role: 'assistant',
              content: fastIntent.text || fastIntent.speech || spoken,
              timestamp: new Date(),
              type: 'text',
            });
            setConfirmationRequest({
              intent: fastIntent,
              description: confirmInfo.description,
              actionLabel: confirmInfo.actionLabel,
              icon: confirmInfo.icon,
            });
          } else {
            await processIntent(fastIntent);
          }
        } catch (err) {
          // Sem este catch, uma exceção aqui escapava de sendMessage e deixava o
          // status preso em 'executing' — e como sendMessage retorna cedo quando
          // status === 'executing', o app parava de responder a qualquer comando.
          if (__DEV__) console.error('[Argos] Falha no comando direto:', err);
          setShowExecutionOverlay(false);
          clearExecutionSteps();
          setStatus('error');
          addMessage({
            id: `msg-${Date.now()}-error`,
            role: 'assistant',
            content: 'Não consegui executar esse comando agora. Tente de novo.',
            timestamp: new Date(),
            type: 'error',
          });
          setTimeout(() => setStatus('idle'), 2000);
        } finally {
          processingRef.current = false;
        }
        return;
      }

      setStatus('thinking');
      heavy();

      try {
        if (!isAnthropicConfigured()) {
          if (__DEV__) {
            console.error('[Argos] API key ausente no runtime (extra/env)');
          }
          setStatus('error');
          const msg =
            'IA não configurada neste ambiente. Confira o .env e reinicie o Expo.';
          await speak('Desculpe, não estou configurado neste ambiente.');
          addMessage({
            id: `msg-${Date.now()}-error`,
            role: 'assistant',
            content: msg,
            timestamp: new Date(),
            type: 'error',
          });
          setTimeout(() => setStatus('idle'), 2500);
          return;
        }

        // Confirma o estado real dos dispositivos eWeLink antes do Argos decidir
        // qualquer coisa — sem isso ele podia responder com base num estado
        // antigo guardado localmente (ex.: dizer "já está desligada" estando ligada).
        if (ewelinkConnected) {
          await syncEwelinkDevices();
        }
        if (tuyaConnected) {
          await syncTuyaDevices();
        }

        const model = resolveAnthropicModel(settings.model);
        const systemPrompt = buildSystemPrompt(
          settings.personality,
          memories,
          automations,
          useDeviceStore.getState().devices,
          settings.userProfile
        );

        const { messages } = useAIStore.getState();
        const historyMessages = buildApiMessageHistory(messages);

        const response = await withTimeout(
          createMessage({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: historyMessages,
          }),
          60000,
          'A requisição demorou demais. Tente de novo.'
        );

        const rawText =
          response.content[0].type === 'text' ? (response.content[0].text ?? '') : '';
        const intent = parseAIResponse(rawText);

        if (intent.newMemory && settings.memoryEnabled) {
          addMemory({
            id: `mem-auto-${Date.now()}`,
            category: intent.newMemory.category,
            title: intent.newMemory.title,
            content: intent.newMemory.content,
            confidence: 0.8,
            source: 'ai_inferred',
            createdAt: new Date(),
            tags: intent.newMemory.tags ?? [],
            isActive: true,
          });
        }

        if (settings.autonomyLevel === 'assisted' && needsConfirmation(intent)) {
          const confirmInfo = buildConfirmationInfo(intent);
          const spoken = resolveIntentSpeech(intent);
          if (spoken) await speak(spoken);
          setStatus('idle');
          addMessage({
            id: `msg-${Date.now()}-confirm`,
            role: 'assistant',
            content: intent.text || intent.speech || spoken,
            timestamp: new Date(),
            type: 'text',
          });
          setConfirmationRequest({
            intent,
            description: confirmInfo.description,
            actionLabel: confirmInfo.actionLabel,
            icon: confirmInfo.icon,
          });
        } else {
          await processIntent(intent);
        }
      } catch (err) {
        if (__DEV__) {
          console.error('[Argos] Falha ao falar com a IA:', err);
        }
        // O overlay de execução não era limpo aqui — ficava preso na tela pra sempre.
        setShowExecutionOverlay(false);
        clearExecutionSteps();
        const content = getApiErrorMessage(err);
        const speech = getSpeechErrorMessage(err, content);
        try {
          await speak(speech);
        } catch {
          // TTS indisponível — segue com mensagem no chat
        }
        setStatus('error');
        addMessage({
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content,
          timestamp: new Date(),
          type: 'error',
        });
        setTimeout(() => setStatus('idle'), 2500);

        const isAuthError =
          isAuthRequired() &&
          (content.includes('logado') ||
            content.includes('login') ||
            content.includes('sessão') ||
            (err as { status?: number })?.status === 401);
        if (isAuthError) {
          setTimeout(() => {
            void useAuthStore.getState().handleSessionExpired();
          }, 2000);
        }
      } finally {
        processingRef.current = false;
      }
    },
    [
      settings,
      memories,
      automations,
      devices,
      addMessage,
      addMemory,
      setStatus,
      heavy,
      processIntent,
      setConfirmationRequest,
      setShowExecutionOverlay,
      clearExecutionSteps,
      speak,
    ]
  );

  return { sendMessage, status, confirmPendingAction, cancelPendingAction };
}

// Alias de compatibilidade
export { useArgos as useARIA };
