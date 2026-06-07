export type MemoryCategory =
  | 'routine'
  | 'preference'
  | 'person'
  | 'location'
  | 'habit'
  | 'context';

export interface Memory {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  confidence: number;
  source: 'user_explicit' | 'ai_inferred' | 'behavior';
  createdAt: Date;
  lastConfirmed?: Date;
  tags: string[];
  isActive: boolean;
}

export interface Insight {
  id: string;
  message: string;
  suggestion?: string;
  automationId?: string;
  type: 'habit' | 'preference' | 'anomaly' | 'suggestion';
  confidence: number;
  isDismissed: boolean;
  createdAt: Date;
}
