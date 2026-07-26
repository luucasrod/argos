import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Settings, UserProfile } from '@/types/settings.types';
import { AIPersonality } from '@/types/ai.types';
import { ANTHROPIC_MODELS, resolveAnthropicModel } from '@/services/ai/config';
import { snapVoiceSpeed } from '@/services/voice/voicePicker';

const defaultPersonality: AIPersonality = {
  name: 'Argos',
  tone: 'friendly',
  proactivity: 'medium',
  verbosity: 'normal',
  language: 'pt-BR',
  voiceSpeed: 1.0,
  voiceGender: 'female',
};

const defaultSettings: Settings = {
  model: ANTHROPIC_MODELS.haiku,
  autonomyLevel: 'autonomous',
  userProfile: {},
  memoryEnabled: true,
  contextLevel: 'normal',
  wakeWord: 'Ei Argos',
  voiceLanguage: 'pt-BR',
  voiceSensitivity: 0.7,
  // Escuta contínua ligada por padrão nas duas plataformas — é a função
  // principal do Argos. No nativo o padrão era false, então instalação nova
  // nunca subia o serviço de background (ver migração v6).
  autoListen: Platform.OS === 'web',
  processLocally: false,
  saveHistory: true,
  historyDays: 30,
  theme: 'dark',
  hapticFeedback: true,
  reducedMotion: false,
  personality: defaultPersonality,
  proactiveInsights: true,
  insightFrequency: 'medium',
};

interface SettingsStore {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
  updatePersonality: (partial: Partial<AIPersonality>) => void;
  updateUserProfile: (partial: Partial<UserProfile>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      updatePersonality: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            personality: { ...state.settings.personality, ...partial },
          },
        })),
      updateUserProfile: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            userProfile: { ...state.settings.userProfile, ...partial },
          },
        })),
      resetSettings: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'argos-settings',
      version: 7,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted, version) => {
        const data = persisted as { settings?: Settings & { apiKey?: string } };
        if (data?.settings) {
          const { apiKey: _legacy, ...rest } = data.settings;
          const personality = {
            ...defaultPersonality,
            ...rest.personality,
            voiceSpeed: snapVoiceSpeed(rest.personality?.voiceSpeed ?? 1.0),
          };
          // v5: ativa a wake word e troca o modelo padrão pra Haiku (resposta mais
          // rápida) — sobrescreve o valor antigo já que ninguém configurou isso à mão.
          const upgradingPastV4 = version < 5;
          // v6: no nativo o padrão de autoListen era false, então quem instalou o
          // APK ficou sem escuta contínua sem nunca ter escolhido isso. Força true
          // uma vez para o serviço de background subir na abertura.
          const upgradingPastV5 = version < 6;
          // v7: desliga a escuta contínua no nativo. A implementação em JS
          // (Whisper na nuvem a cada checagem) tem latência de segundos e dispara
          // falso positivo, então o app abrindo já ouvindo só incomodava. Volta a
          // ligar quando o detector nativo de wake word estiver no lugar.
          const upgradingPastV6 = version < 7;
          data.settings = {
            ...defaultSettings,
            ...rest,
            model: upgradingPastV4 ? ANTHROPIC_MODELS.haiku : resolveAnthropicModel(rest.model),
            autoListen: upgradingPastV6
              ? Platform.OS === 'web'
              : upgradingPastV5
                ? true
                : rest.autoListen ?? defaultSettings.autoListen,
            autonomyLevel: rest.autonomyLevel ?? 'autonomous',
            userProfile: rest.userProfile ?? {},
            personality,
          };
        }
        return data;
      },
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
