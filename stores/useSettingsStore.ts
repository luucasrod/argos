import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  autoListen: true,
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
      version: 5,
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
          data.settings = {
            ...defaultSettings,
            ...rest,
            model: upgradingPastV4 ? ANTHROPIC_MODELS.haiku : resolveAnthropicModel(rest.model),
            autoListen: upgradingPastV4 ? true : rest.autoListen ?? defaultSettings.autoListen,
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
