import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, AIStatus } from '@/types/ai.types';
import { ParsedIntent } from '@/services/ai/intentParser';

export interface ConfirmationRequest {
  intent: ParsedIntent;
  description: string; // texto exibido no modal
  actionLabel: string; // ex: "Abrir Spotify", "Ligar luz da sala"
  icon: string;        // emoji do modal
}

interface AIStore {
  status: AIStatus;
  setStatus: (status: AIStatus) => void;
  messages: Message[];
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  updateMessage: (id: string, partial: Partial<Message>) => void;
  isStreaming: boolean;
  setStreaming: (v: boolean) => void;
  currentInput: string;
  setCurrentInput: (text: string) => void;
  executionSteps: { label: string; status: 'pending' | 'running' | 'success' | 'error' }[];
  setExecutionSteps: (steps: AIStore['executionSteps']) => void;
  updateExecutionStep: (index: number, status: AIStore['executionSteps'][0]['status']) => void;
  clearExecutionSteps: () => void;
  showExecutionOverlay: boolean;
  setShowExecutionOverlay: (v: boolean) => void;
  // Confirmação de autonomia
  confirmationRequest: ConfirmationRequest | null;
  setConfirmationRequest: (req: ConfirmationRequest | null) => void;
}

export const useAIStore = create<AIStore>()(
  persist(
    (set) => ({
      status: 'idle',
      setStatus: (status) => set({ status }),
      messages: [],
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages.slice(-100), message] })),
      clearMessages: () => set({ messages: [] }),
      updateMessage: (id, partial) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, ...partial } : m)),
        })),
      isStreaming: false,
      setStreaming: (v) => set({ isStreaming: v }),
      currentInput: '',
      setCurrentInput: (text) => set({ currentInput: text }),
      executionSteps: [],
      setExecutionSteps: (steps) => set({ executionSteps: steps }),
      updateExecutionStep: (index, status) =>
        set((state) => ({
          executionSteps: state.executionSteps.map((s, i) =>
            i === index ? { ...s, status } : s
          ),
        })),
      clearExecutionSteps: () => set({ executionSteps: [] }),
      showExecutionOverlay: false,
      setShowExecutionOverlay: (v) => set({ showExecutionOverlay: v }),
      // Confirmação
      confirmationRequest: null,
      setConfirmationRequest: (req) => set({ confirmationRequest: req }),
    }),
    {
      name: 'argos-ai',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ messages: state.messages }),
    }
  )
);
