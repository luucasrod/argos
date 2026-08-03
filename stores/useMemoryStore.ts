import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Memory, Insight } from '@/types/memory.types';
import { supabase } from '@/services/auth/supabase';
import { normalizeInsight } from '@/services/insights/handleInsightPress';

interface MemoryStore {
  memories: Memory[];
  addMemory: (memory: Memory) => void;
  updateMemory: (id: string, partial: Partial<Memory>) => void;
  deleteMemory: (id: string) => void;
  syncFromSupabase: (userId: string) => Promise<void>;
  confirmMemory: (id: string) => void;
  rejectMemory: (id: string) => void;
  getPendingMemories: () => Memory[];
  insights: Insight[];
  addInsight: (insight: Insight) => void;
  dismissInsight: (id: string) => void;
  clearDismissedInsights: () => void;
  getActiveInsights: () => Insight[];
  getMemoriesByCategory: (category: Memory['category']) => Memory[];
}

/**
 * Começa VAZIO de propósito.
 *
 * Antes havia cinco memórias de exemplo ("Você costuma dormir entre 1h e 1h30",
 * "Masya Studio é seu projeto principal"...) que eram apresentadas como fatos
 * reais sobre o usuário. Como o `partialize` não persistia `memories`, elas
 * voltavam a CADA abertura do app, mesmo depois de apagadas — e ainda entravam
 * no prompt do sistema, fazendo o Argos afirmar coisas inventadas sobre a pessoa.
 */
const defaultMemories: Memory[] = [];

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: defaultMemories,
      insights: [
        {
          id: 'insight-welcome',
          message: 'Bem-vindo ao Argos! Converse comigo e vou aprender sobre você.',
          suggestion: 'Ver automações e rotinas',
          navigateTo: '/(tabs)/automations',
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
          // Sem isto o status nunca era gravado: ao voltar do Supabase a memória
          // perdia o "pending" e a tela de confirmação ficava sempre vazia.
          status: memory.status ?? 'pending',
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

        {
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
            // O mapeamento ignorava o status, então TODA memória vinda do servidor
            // chegava sem ele — e getPendingMemories() (que filtra por 'pending')
            // nunca devolvia nada. Linhas antigas sem a coluna contam como aceitas.
            status: (row.status as Memory['status']) ?? 'confirmed',
          }));

          /*
           * MESCLA, não substitui.
           *
           * Antes era `set({ memories: remoteMemories })`, o que apagava toda
           * memória que só existia no aparelho — exatamente o caso de quem usou o
           * Argos sem internet ou antes de entrar na conta: o addMemory gravava
           * local, não conseguia inserir no Supabase, e o primeiro login seguinte
           * varria tudo.
           *
           * O remoto continua sendo a fonte de verdade para o que existe nos dois
           * lados (por id); o que só existe local é preservado e enviado agora.
           */
          const remoteIds = new Set(remoteMemories.map((m) => m.id));
          const localOnly = get().memories.filter((m) => !remoteIds.has(m.id));

          set({ memories: [...remoteMemories, ...localOnly] });

          // Sobe as que nunca chegaram ao servidor. Rejeitadas ficam de fora: elas
          // estão ausentes da consulta por causa do filtro is_active, e reenviá-las
          // as ressuscitaria.
          const paraEnviar = localOnly.filter((m) => m.status !== 'rejected' && m.isActive);
          if (paraEnviar.length > 0) {
            await supabase.from('memories').upsert(
              paraEnviar.map((m) => ({
                id: m.id,
                user_id: userId,
                category: m.category,
                title: m.title,
                content: m.content,
                confidence: m.confidence,
                source: m.source,
                tags: m.tags,
                is_active: m.isActive,
                status: m.status ?? 'pending',
                created_at: m.createdAt?.toISOString() ?? new Date().toISOString(),
              }))
            );
          }
        }
      },

      /*
       * Confirmar e rejeitar precisam ir para o Supabase.
       *
       * Antes só alteravam o estado local. Como o syncFromSupabase sobrescreve o
       * local com o remoto no login seguinte, a decisão do usuário era desfeita
       * silenciosamente — a memória rejeitada voltava a valer e a confirmada
       * voltava a perguntar.
       */
      confirmMemory: async (id) => {
        const at = new Date();
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id ? { ...m, status: 'confirmed' as const, lastConfirmed: at } : m
          ),
        }));

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        await supabase
          .from('memories')
          .update({ status: 'confirmed', last_confirmed: at.toISOString() })
          .eq('id', id)
          .eq('user_id', session.user.id);
      },

      rejectMemory: async (id) => {
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id ? { ...m, status: 'rejected' as const, isActive: false } : m
          ),
        }));

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        await supabase
          .from('memories')
          .update({ status: 'rejected', is_active: false })
          .eq('id', id)
          .eq('user_id', session.user.id);
      },

      getPendingMemories: () =>
        get().memories.filter((m) => m.status === 'pending' && m.isActive),

      addInsight: (insight) => set((state) => ({ insights: [...state.insights, insight] })),
      dismissInsight: (id) =>
        set((state) => ({
          insights: state.insights.map((i) => (i.id === id ? { ...i, isDismissed: true } : i)),
        })),
      clearDismissedInsights: () =>
        set((state) => ({ insights: state.insights.filter((i) => !i.isDismissed) })),
      getActiveInsights: () =>
        get()
          .insights.filter((i) => !i.isDismissed)
          .map(normalizeInsight),
      getMemoriesByCategory: (category) =>
        get().memories.filter((m) => m.category === category && m.isActive),
    }),
    {
      name: 'argos-memory',
      storage: createJSONStorage(() => AsyncStorage),
      /*
       * Persiste as memórias localmente TAMBÉM.
       *
       * Antes só os insights eram gravados, com a justificativa de que o Supabase
       * seria a fonte de verdade. Na prática isso significava: sem internet ou sem
       * login, tudo que o Argos aprendeu na sessão era perdido ao fechar o app —
       * e o estado voltava para as memórias de exemplo. O Supabase continua sendo
       * a fonte de verdade quando há sessão (o syncFromSupabase sobrescreve),
       * mas agora existe uma cópia local para o app funcionar offline.
       */
      partialize: (state) => ({ insights: state.insights, memories: state.memories }),
      onRehydrateStorage: () => (state) => {
        if (!state?.insights) return;
        state.insights = state.insights.map((i) => normalizeInsight(i));
      },
    }
  )
);
