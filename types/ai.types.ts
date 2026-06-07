import type { Automation } from './automation.types';

export type AIStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'executing'
  | 'speaking'
  | 'offline'
  | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  type: 'text' | 'action' | 'automation' | 'error' | 'suggestion';
  metadata?: {
    executedActions?: ExecutedAction[];
    createdAutomation?: Automation;
    confidence?: number;
  };
}

export interface ExecutedAction {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  deviceId?: string;
  timestamp?: Date;
}

export interface ConversationContext {
  messages: Message[];
  summary?: string;
  lastUpdated: Date;
}

export interface AIPersonality {
  name: string;
  tone: 'formal' | 'casual' | 'direct' | 'friendly' | 'playful';
  proactivity: 'low' | 'medium' | 'high';
  verbosity: 'minimal' | 'normal' | 'detailed';
  language: 'pt-BR' | 'en-US' | 'es-ES';
  voiceSpeed: number;
  voiceGender: 'female' | 'male';
}
