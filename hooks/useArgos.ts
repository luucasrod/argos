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
import { perfMark } from '@/services/voice/perfLog';
import { markAwaitingFollowUp } from '@/services/voice/followUpMode';
import { isAuthRequired } from '@/services/auth/config';
import { Message } from '@/types/ai.types';
import { Automation } from '@/types/automation.types';
import { useHaptic } from './useHaptic';
import { Platform, Linking } from 'react-native';
import { resolveAppLink } from '@/services/browser/appLinks';
import type { AIPersonality } from '@/types/ai.types';

/**
 * Abre um app/link no nativo (Android/iOS) via Linking (issue #178).
 *
 * Espelha o que services/browser/browserActions.ts já faz na web, mas sem as
 * APIs de DOM (document/window) usadas lá, que não existem no React Native.
 * Usa o mesmo catálogo de esquemas (services/browser/appLinks.ts) —
 * resolveAppLink() devolve os campos ios/android/web crus, sem passar pela
 * detecção de plataforma daquele arquivo (isIOSWeb/isAndroidWeb), que é
 * baseada em navigator.userAgent e por isso nunca é verdadeira no nativo.
 * Aqui a plataforma já é conhecida de verdade via Platform.OS.
 */
async function openAppLinkNative(
  input: string
): Promise<{ opened: boolean; label: string; message: string }> {
  const link = resolveAppLink(input);
  const label = link?.label ?? input;
  const nativeUrl = Platform.OS === 'ios' ? link?.ios : Platform.OS === 'android' ? link?.android : null;

  const tryOpen = async (url: string | null | undefined): Promise<boolean> => {
    if (!url) return false;
    try {
      // Linking.openURL rejeita quando nenhum app trata o esquema (Android:
      // "Activity not found") — é o próprio sistema quem diz "não instalado",
      // não precisa de canOpenURL (que no iOS só funciona com o esquema
      // declarado em LSApplicationQueriesSchemes, dando falso negativo).
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (await tryOpen(nativeUrl)) {
    return { opened: true, label, message: `Abrindo ${label}...` };
  }

  // Caso pedido na issue: sem o Spotify instalado, oferece (abrindo direto,
  // já avisando o que aconteceu) o player que o Argos já integra em vez de
  // só recusar.
  if (input.trim().toLowerCase() === 'spotify') {
    const musicFallback = resolveAppLink('youtube music');
    const musicUrl = Platform.OS === 'ios' ? musicFallback?.ios : musicFallback?.android;
    if (await tryOpen(musicUrl)) {
      return {
        opened: true,
        label: musicFallback?.label ?? 'YouTube Music',
        message: 'Você não tem o Spotify instalado, mas abri o YouTube Music.',
      };
    }
  }

  const webUrl = link?.web ?? (input.trim().toLowerCase().startsWith('http') ? input.trim() : null);
  if (await tryOpen(webUrl)) {
    return { opened: true, label, message: `Abrindo ${label} no navegador...` };
  }

  return { opened: false, label, message: `Não consegui abrir ${label}. Ele está instalado?` };
}

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
      perfMark('tts_iniciado');
      await textToSpeech(text, personality);
    },
    [setStatus, settings.personality]
  );

  const processIntent = useCallback(
    async (intent: ParsedIntent) => {
      const assistantMessageId = `msg-${Date.now()}-assistant`;

      /*
       * A-052: quando o Argos faz uma pergunta de volta ("quer ligar a luz
       * do quarto também?"), o app deve continuar ouvindo a resposta sem
       * exigir a wake word de novo. B-031 já marca isso no próprio intent
       * (expectsResponse) — só precisamos avisar useVoice.ts pra armar
       * escuta ativa (em vez de passiva) na próxima transição pra idle,
       * que é quando a fala desta resposta específica termina. Setado aqui,
       * uma vez por intent, cobre todos os ramos abaixo sem duplicar por
       * chamada de speak().
       */
      if (intent.expectsResponse) {
        markAwaitingFollowUp();
      }

      if (intent.type === 'device_control' && intent.actions && intent.actions.length > 0) {
        /*
         * Trava de honestidade: nunca confirmar o que não foi feito.
         *
         * O Argos dizia "luz do escritório ligada" com a lâmpada desligada no
         * disjuntor. Três falhas somadas: o prompt escondia os dispositivos
         * offline (a IA inventava o deviceId), o toggleDevice com id inexistente
         * não faz nada e não reclama, e o laço marcava sucesso sem verificar.
         * Aqui o estado real do aparelho decide o que é executado e o que é dito.
         */
        const known = useDeviceStore.getState().devices;
        const checked = intent.actions.map((a) => {
          const device = known.find((d) => d.id === a.deviceId);
          return { action: a, device, ok: !!device && device.status === 'online' };
        });
        const blocked = checked.filter((c) => !c.ok);

        if (blocked.length === checked.length) {
          // Nada é executável — avisa em vez de fingir.
          const nomes = blocked
            .map((b) => b.device?.name ?? b.action.label ?? 'o dispositivo')
            .filter((v, i, arr) => arr.indexOf(v) === i);
          const alvo = nomes.join(', ');
          const semCadastro = blocked.every((b) => !b.device);
          const aviso = semCadastro
            ? `Não encontrei ${alvo} entre os seus dispositivos.`
            : `${alvo} está offline, então não consigo controlar agora. Verifique a energia, o disjuntor ou a conexão Wi-Fi.`;

          void speak(aviso);
          setStatus('idle');
          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: aviso,
            timestamp: new Date(),
            type: 'error',
          });
          return;
        }

        const spoken = resolveIntentSpeech(intent);
        // A fala NÃO é aguardada aqui. Antes o dispositivo só era acionado depois
        // do TTS terminar, então a lâmpada esperava a frase inteira — segundos de
        // atraso para nada. Agora executa e fala ao mesmo tempo.
        if (spoken) void speak(spoken);

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

            // Caso parcial: alguns alvos online, outros não. O que está offline é
            // marcado como erro em vez de contar como feito.
            if (!checked[i]?.ok) {
              updateExecutionStep(i, 'error');
              stepResults.push('error');
              continue;
            }

            try {
              if (action.action === 'toggle') {
                await toggleDevice(action.deviceId, true);
              } else if (action.action === 'setOn') {
                await updateDeviceState(action.deviceId, 'isOn', true, true);
              } else if (action.action === 'setOff') {
                await updateDeviceState(action.deviceId, 'isOn', false, true);
              } else if (action.action === 'setValue') {
                await updateDeviceState(action.deviceId, action.property, action.value, true);
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
              ? blocked.length > 0
                ? `${intent.text || intent.speech || spoken}\n\nNão consegui em: ${blocked
                    .map((b) => b.device?.name ?? b.action.label)
                    .join(', ')} (offline).`
                : intent.text || intent.speech || spoken
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
          const result = await openAppLinkNative(intent.url);
          const spoken = resolveIntentSpeech(intent);
          await speak(spoken || result.message);
          setStatus('idle');
          addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: intent.text || result.message,
            timestamp: new Date(),
            type: result.opened ? 'text' : 'error',
          });
        }

      } else if (intent.type === 'get_weather') {
        const intro = resolveIntentSpeech(intent) || 'Verificando o clima...';
        await speak(intro);
        setStatus('executing');

        try {
          // getWeather() (Open-Meteo, fetch puro) já funciona igual em
          // qualquer plataforma — só a geolocalização automática (sem nome
          // de cidade) depende do navegador e já degrada sozinha para uma
          // mensagem pedindo o nome da cidade (services/browser/
          // weatherService.ts). Nunca foi o serviço que exigia web.
          const { getWeather } = await import('@/services/browser/weatherService');
          const result = await getWeather(intent.cityName);
          const weatherText = result.formatted;
          const weatherContent =
            `🌤 **${result.city}** — ${result.temperature}°C\n` +
            `${result.description}\n` +
            `Sensação: ${result.feelsLike}°C · Umidade: ${result.humidity}% · Vento: ${result.windSpeed} km/h`;

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

      } else if (intent.type === 'play_music') {
        /*
         * Música: o retorno vem do próprio serviço, então o Argos só afirma que
         * está tocando se o intent do Android foi aceito de verdade — mesma regra
         * de honestidade aplicada aos dispositivos.
         */
        const { playMusic, openMusicApp } = await import('@/services/media/playMusic');
        const query = (intent.musicQuery ?? '').trim();
        const result = query ? await playMusic(query) : await openMusicApp();

        await speak(result.message);
        setStatus('idle');

        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: result.message,
          timestamp: new Date(),
          type: result.ok ? 'action' : 'error',
        });

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
        perfMark('fast_intent (sem chamar a IA)');
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
          settings.userProfile,
          trimmed
        );

        const { messages } = useAIStore.getState();
        const historyMessages = buildApiMessageHistory(messages);

        perfMark('llm_requisicao_enviada');
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
        perfMark('llm_resposta_recebida');

        const rawText =
          response.content[0].type === 'text' ? (response.content[0].text ?? '') : '';
        const intent = parseAIResponse(rawText);
        perfMark('intent_parseado');

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
            // Memória inferida pela IA entra como PENDENTE, para você confirmar
            // ou rejeitar na aba Inteligência. Sem este campo ela era gravada com
            // status indefinido e a tela de confirmação nunca a mostrava — ou
            // seja, o Argos guardava conclusões sobre você sem nunca perguntar.
            status: 'pending',
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
