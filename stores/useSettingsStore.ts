import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Settings, UserProfile } from '@/types/settings.types';
import { AIPersonality } from '@/types/ai.types';
import { ANTHROPIC_MODELS, resolveAnthropicModel } from '@/services/ai/config';

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
  model: ANTHROPIC_MODELS.sonnet,
  autonomyLevel: 'autonomous',
  userProfile: {},
  memoryEnabled: true,
  contextLevel: 'normal',
  wakeWord: 'Argos',
  voiceLanguage: 'pt-BR',
  voiceSensitivity: 0.7,
  autoListen: false,
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
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted, version) => {
        const data = persisted as { settings?: Settings & { apiKey?: string } };
        if (data?.settings) {
          const { apiKey: _legacy, ...rest } = data.settings;
          // v2→v3: adiciona autonomyLevel e userProfile se ausentes
          data.settings = {
            ...defaultSettings,
            ...rest,
            model: resolveAnthropicModel(rest.model),
            autonomyLevel: rest.autonomyLevel ?? 'autonomous',
            userProfile: rest.userProfile ?? {},
          };
        }
        return data;
      },
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
