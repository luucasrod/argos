import { useCallback } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useMemoryStore } from '@/stores/useMemoryStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { getApiErrorMessage } from '@/services/ai/anthropic';
import { createMessage, isConfigured as isAnthropicConfigured } from '@/services/ai/anthropicProxy';
import { resolveAnthropicModel } from '@/services/ai/config';
import { buildApiMessageHistory } from '@/services/ai/chatMessages';
import { buildSystemPrompt } from '@/services/ai/systemPrompt';
import { parseAIResponse, ParsedIntent } from '@/services/ai/intentParser';
import { textToSpeech } from '@/services/voice/textToSpeech';
import { Message } from '@/types/ai.types';
import { Automation } from '@/types/automation.types';
import { useHaptic } from './useHaptic';
import { Platform } from 'react-native';

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
        icon: '🌐',
        actionLabel: `Abrir ${url}`,
        description: `Vai abrir "${url}" em uma nova aba do browser.`,
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
  } = useAIStore();

  const { settings } = useSettingsStore();
  const { memories, addMemory } = useMemoryStore();
  const { automations, addAutomation } = useAutomationStore();
  const { devices, toggleDevice, updateDeviceState } = useDeviceStore();
  const { heavy, success } = useHaptic();

  const processIntent = useCallback(
    async (intent: ParsedIntent) => {
      const assistantMessageId = `msg-${Date.now()}-assistant`;

      if (intent.type === 'device_control' && intent.actions && intent.actions.length > 0) {
        setStatus('executing');

        const steps = intent.actions.map((a) => ({
          label: a.label,
          status: 'pending' as const,
        }));
        setExecutionSteps(steps);
        setShowExecutionOverlay(true);

        for (let i = 0; i < intent.actions.length; i++) {
          const action = intent.actions[i];
          updateExecutionStep(i, 'running');

          await new Promise((r) => setTimeout(r, 600));

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
        }

        success();

        if (intent.speech) {
          setStatus('speaking');
          await textToSpeech(intent.speech, settings.personality);
        }

        setTimeout(() => {
          setShowExecutionOverlay(false);
          clearExecutionSteps();
          setStatus('idle');
        }, 2000);

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: intent.text || intent.speech,
          timestamp: new Date(),
          type: 'action',
          metadata: {
            executedActions: intent.actions.map((a, idx) => ({
              id: `exec-${idx}`,
              label: a.label,
              status: 'success',
              deviceId: a.deviceId,
            })),
          },
        });

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

        if (intent.speech) {
          setStatus('speaking');
          await textToSpeech(intent.speech, settings.personality);
        }

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
          const { openUrl, resolveUrl } = await import('@/services/browser/browserActions');
          const resolvedUrl = resolveUrl(intent.url);
          openUrl(intent.url);

          const displayUrl = resolvedUrl.replace(/^https?:\/\//, '').split('/')[0];

          if (intent.speech) {
            setStatus('speaking');
            await textToSpeech(intent.speech, settings.personality);
          }
          setStatus('idle');

          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: intent.text || `Abrindo ${displayUrl}...`,
            timestamp: new Date(),
            type: 'text',
          });
        } else {
          if (intent.speech) {
            setStatus('speaking');
            await textToSpeech('Abrir URLs só está disponível na versão web.', settings.personality);
          }
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
        setStatus('executing');

        if (intent.speech) {
          setStatus('speaking');
          await textToSpeech(intent.speech, settings.personality);
        }
        setStatus('thinking');

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
          await textToSpeech(weatherText, settings.personality);
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
          await textToSpeech(errorMsg, settings.personality);
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
          intent.speech ||
          `Lembrete criado! Vou te avisar em ${delayMinutes} minuto${delayMinutes !== 1 ? 's' : ''}.`;

        setStatus('speaking');
        await textToSpeech(speechText, settings.personality);
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

        const speechText = intent.speech || 'Nota salva!';
        setStatus('speaking');
        await textToSpeech(speechText, settings.personality);
        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: intent.text || `📝 **${noteTitle}**\n${noteContent}`,
          timestamp: new Date(),
          type: 'text',
        });

      } else {
        // chat / routine / fallback
        if (intent.speech) {
          setStatus('speaking');
          await textToSpeech(intent.speech, settings.personality);
        }

        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: intent.text || intent.speech,
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
      if (!userInput.trim() || status === 'thinking' || status === 'executing') return;

      const userMessage: Message = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: userInput,
        timestamp: new Date(),
        type: 'text',
      };

      addMessage(userMessage);
      setStatus('thinking');
      heavy();

      if (!isAnthropicConfigured()) {
        if (__DEV__) {
          console.error('[Argos] API key ausente no runtime (extra/env)');
        }
        setStatus('error');
        addMessage({
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content:
            'IA não configurada neste build. Confira o .env em argos/ e reinicie o servidor Expo na pasta argos.',
          timestamp: new Date(),
          type: 'error',
        });
        setTimeout(() => setStatus('idle'), 2500);
        return;
      }

      try {
        const model = resolveAnthropicModel(settings.model);
        const systemPrompt = buildSystemPrompt(
          settings.personality,
          memories,
          automations,
          devices,
          settings.userProfile
        );

        const { messages } = useAIStore.getState();
        const historyMessages = buildApiMessageHistory(messages);

        const response = await createMessage({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: historyMessages,
        });

        const rawText =
          response.content[0].type === 'text' ? (response.content[0].text ?? '') : '';
        const intent = parseAIResponse(rawText);

        // Extração automática de memória (quando Claude detecta informação relevante)
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

        // Modo assistido: pede confirmação antes de ações que modificam estado
        if (
          settings.autonomyLevel === 'assisted' &&
          needsConfirmation(intent)
        ) {
          const confirmInfo = buildConfirmationInfo(intent);
          // Fala o texto antes de mostrar o modal
          if (intent.speech) {
            setStatus('speaking');
            await textToSpeech(intent.speech, settings.personality);
          }
          setStatus('idle');
          // Adiciona mensagem de "aguardando confirmação"
          addMessage({
            id: `msg-${Date.now()}-confirm`,
            role: 'assistant',
            content: intent.text || intent.speech,
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
        setStatus('error');
        const errorMessage: Message = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: getApiErrorMessage(err),
          timestamp: new Date(),
          type: 'error',
        };
        addMessage(errorMessage);
        setTimeout(() => setStatus('idle'), 2500);
      }
    },
    [
      status,
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
    ]
  );

  return { sendMessage, status, confirmPendingAction, cancelPendingAction };
}

// Alias de compatibilidade
export { useArgos as useARIA };
