import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Memory, Insight } from '@/types/memory.types';
import { supabase } from '@/services/auth/supabase';

interface MemoryStore {
  memories: Memory[];
  addMemory: (memory: Memory) => void;
  updateMemory: (id: string, partial: Partial<Memory>) => void;
  deleteMemory: (id: string) => void;
  syncFromSupabase: (userId: string) => Promise<void>;
  insights: Insight[];
  addInsight: (insight: Insight) => void;
  dismissInsight: (id: string) => void;
  clearDismissedInsights: () => void;
  getActiveInsights: () => Insight[];
  getMemoriesByCategory: (category: Memory['category']) => Memory[];
}

const defaultMemories: Memory[] = [
  {
    id: 'mem-1',
    category: 'routine',
    title: 'Horário de dormir',
    content: 'Você costuma dormir entre 1h e 1h30 da manhã',
    confidence: 0.85,
    source: 'ai_inferred',
    createdAt: new Date(),
    tags: ['sono', 'rotina'],
    isActive: true,
  },
  {
    id: 'mem-2',
    category: 'preference',
    title: 'Música para trabalho',
    content: 'Prefere Lo-Fi quando está trabalhando',
    confidence: 0.9,
    source: 'user_explicit',
    createdAt: new Date(),
    tags: ['música', 'trabalho', 'foco'],
    isActive: true,
  },
];

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: defaultMemories,
      insights: [
        {
          id: 'insight-1',
          message: 'Bem-vindo ao Argos! Converse comigo e vou aprender sobre você.',
          suggestion: 'Me conta sobre sua rotina',
          type: 'suggestion',
          confidence: 1,
          isDismissed: false,
          createdAt: new Date(),
        },
      ],

      addMemory: async (memory) => {
        // Atualiza estado local imediatamente
        set((state) => ({ memories: [...state.memories, memory] }));

        // Sincroniza com Supabase em background
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        await supabase.from('memories').insert({
          id: memory.id,
          user_id: session.user.id,
          category: memory.category,
          title: memory.title,
          content: memory.content,
          confidence: memory.confidence,
          source: memory.source,
          tags: memory.tags,
          is_active: memory.isActive,
          created_at: memory.createdAt?.toISOString() ?? new Date().toISOString(),
        });
      },

      updateMemory: async (id, partial) => {
        set((state) => ({
          memories: state.memories.map((m) => (m.id === id ? { ...m, ...partial } : m)),
        }));

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        await supabase.from('memories').update({
          ...(partial.title && { title: partial.title }),
          ...(partial.content && { content: partial.content }),
          ...(partial.isActive !== undefined && { is_active: partial.isActive }),
        }).eq('id', id).eq('user_id', session.user.id);
      },

      deleteMemory: async (id) => {
        set((state) => ({ memories: state.memories.filter((m) => m.id !== id) }));

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        await supabase.from('memories').delete().eq('id', id).eq('user_id', session.user.id);
      },

      /** Carrega memórias do Supabase ao fazer login */
      syncFromSupabase: async (userId: string) => {
        const { data, error } = await supabase
          .from('memories')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: true });

        if (error || !data) return;

        if (data.length > 0) {
          const remoteMemories: Memory[] = data.map((row) => ({
            id: row.id,
            category: row.category,
            title: row.title,
            content: row.content,
            confidence: row.confidence ?? 0.8,
            source: row.source ?? 'ai_inferred',
            createdAt: new Date(row.created_at),
            tags: row.tags ?? [],
            isActive: row.is_active ?? true,
          }));
          set({ memories: remoteMemories });
        }
      },

      addInsight: (insight) => set((state) => ({ insights: [...state.insights, insight] })),
      dismissInsight: (id) =>
        set((state) => ({
          insights: state.insights.map((i) => (i.id === id ? { ...i, isDismissed: true } : i)),
        })),
      clearDismissedInsights: () =>
        set((state) => ({ insights: state.insights.filter((i) => !i.isDismissed) })),
      getActiveInsights: () => get().insights.filter((i) => !i.isDismissed),
      getMemoriesByCategory: (category) =>
        get().memories.filter((m) => m.category === category && m.isActive),
    }),
    {
      name: 'argos-memory',
      storage: createJSONStorage(() => AsyncStorage),
      // Não persiste memórias localmente quando autenticado (usa Supabase)
      partialize: (state) => ({ insights: state.insights }),
    }
  )
);
