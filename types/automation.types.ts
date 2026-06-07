export type TriggerType =
  | 'time'
  | 'location'
  | 'device_event'
  | 'app_open'
  | 'voice'
  | 'manual'
  | 'recurring';

export type ActionType =
  | 'device_control'
  | 'send_message'
  | 'open_app'
  | 'play_media'
  | 'set_volume'
  | 'notification'
  | 'api_call'
  | 'wait';

export interface AutomationTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
  label: string;
}

export interface AutomationAction {
  id: string;
  type: ActionType;
  config: Record<string, unknown>;
  label: string;
  delayMs?: number;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  emoji: string;
  isActive: boolean;
  isPreset: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  createdAt: Date;
  lastTriggered?: Date;
  runCount: number;
  createdBy: 'user' | 'ai' | 'preset';
  naturalLanguageInput?: string;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  emoji: string;
  steps: RoutineStep[];
  isActive: boolean;
  schedule?: string;
}

export interface RoutineStep {
  id: string;
  label: string;
  action: AutomationAction;
  isSpeaking: boolean;
  narration?: string;
}
