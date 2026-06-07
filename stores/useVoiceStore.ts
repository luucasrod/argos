import { create } from 'zustand';

interface VoiceStore {
  isListening: boolean;
  transcript: string;
  error: string | null;
  setListening: (v: boolean) => void;
  setTranscript: (text: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceStore>()((set) => ({
  isListening: false,
  transcript: '',
  error: null,
  setListening: (v) => set({ isListening: v }),
  setTranscript: (text) => set({ transcript: text }),
  setError: (error) => set({ error }),
  reset: () => set({ isListening: false, transcript: '', error: null }),
}));
