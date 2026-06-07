import type { AIPersonality } from './ai.types';
import type { AnthropicModelId } from '@/services/ai/config';

export interface UserProfile {
  name?: string;
  city?: string;
  profession?: string;
  birthday?: string; // "DD/MM"
}

export interface Settings {
  model: AnthropicModelId;
  autonomyLevel: 'autonomous' | 'assisted';
  userProfile: UserProfile;
  memoryEnabled: boolean;
  contextLevel: 'minimal' | 'normal' | 'full';
  wakeWord: string;
  voiceLanguage: string;
  voiceSensitivity: number;
  autoListen: boolean;
  processLocally: boolean;
  saveHistory: boolean;
  historyDays: number;
  theme: 'dark' | 'amoled';
  hapticFeedback: boolean;
  reducedMotion: boolean;
  personality: AIPersonality;
  proactiveInsights: boolean;
  insightFrequency: 'low' | 'medium' | 'high';
}
