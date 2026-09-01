import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '@/services/auth/supabase';

export type GoalStatus = 'active' | 'completed' | 'archived';

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
}

interface GoalsStore {
  goals: Goal[];
  createGoal: (input: CreateGoalInput) => Promise<Goal>;
  updateGoal: (id: string, input: UpdateGoalInput) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<void>;
  archiveGoal: (id: string) => Promise<void>;
  getActiveGoals: () => Goal[];
  syncFromSupabase: (userId: string) => Promise<void>;
}

function createGoalId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toSupabaseRow(goal: Goal, userId: string) {
  return {
    id: goal.id,
    user_id: userId,
    title: goal.title,
    description: goal.description ?? null,
    status: goal.status,
    created_at: goal.createdAt.toISOString(),
    updated_at: goal.updatedAt.toISOString(),
    completed_at: goal.completedAt?.toISOString() ?? null,
  };
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export const useGoalsStore = create<GoalsStore>()(
  persist(
    (set, get) => ({
      goals: [],

      createGoal: async (input) => {
        const title = input.title.trim();
        if (!title) throw new Error('O objetivo precisa de um título.');

        const now = new Date();
        const goal: Goal = {
          id: createGoalId(),
          title,
          description: input.description?.trim() || undefined,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({ goals: [...state.goals, goal] }));

        const userId = await getCurrentUserId();
        if (userId) await supabase.from('goals').insert(toSupabaseRow(goal, userId));

        return goal;
      },

      updateGoal: async (id, input) => {
        const updatedAt = new Date();
        const partial = {
          ...(input.title !== undefined && { title: input.title.trim() }),
          ...(input.description !== undefined && {
            description: input.description.trim() || undefined,
          }),
          updatedAt,
        };

        set((state) => ({
          goals: state.goals.map((goal) => goal.id === id ? { ...goal, ...partial } : goal),
        }));

        const userId = await getCurrentUserId();
        if (!userId) return;
        await supabase
          .from('goals')
          .update({
            ...(input.title !== undefined && { title: input.title.trim() }),
            ...(input.description !== undefined && {
              description: input.description.trim() || null,
            }),
            updated_at: updatedAt.toISOString(),
          })
          .eq('id', id)
          .eq('user_id', userId);
      },

      deleteGoal: async (id) => {
        set((state) => ({ goals: state.goals.filter((goal) => goal.id !== id) }));

        const userId = await getCurrentUserId();
        if (!userId) return;
        await supabase.from('goals').delete().eq('id', id).eq('user_id', userId);
      },

      completeGoal: async (id) => {
        const completedAt = new Date();
        set((state) => ({
          goals: state.goals.map((goal) =>
            goal.id === id
              ? { ...goal, status: 'completed' as const, completedAt, updatedAt: completedAt }
              : goal
          ),
        }));

        const userId = await getCurrentUserId();
        if (!userId) return;
        await supabase
          .from('goals')
          .update({
            status: 'completed',
            completed_at: completedAt.toISOString(),
            updated_at: completedAt.toISOString(),
          })
          .eq('id', id)
          .eq('user_id', userId);
      },

      archiveGoal: async (id) => {
        const updatedAt = new Date();
        set((state) => ({
          goals: state.goals.map((goal) =>
            goal.id === id ? { ...goal, status: 'archived' as const, updatedAt } : goal
          ),
        }));

        const userId = await getCurrentUserId();
        if (!userId) return;
        await supabase
          .from('goals')
          .update({ status: 'archived', updated_at: updatedAt.toISOString() })
          .eq('id', id)
          .eq('user_id', userId);
      },

      getActiveGoals: () => get().goals.filter((goal) => goal.status === 'active'),

      syncFromSupabase: async (userId) => {
        const { data, error } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (error || !data) return;

        const remoteGoals: Goal[] = data.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description ?? undefined,
          status: row.status as GoalStatus,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at ?? row.created_at),
          completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        }));
        const remoteIds = new Set(remoteGoals.map((goal) => goal.id));
        const localOnly = get().goals.filter((goal) => !remoteIds.has(goal.id));

        set({ goals: [...remoteGoals, ...localOnly] });

        if (localOnly.length > 0) {
          await supabase.from('goals').upsert(
            localOnly.map((goal) => toSupabaseRow(goal, userId))
          );
        }
      },
    }),
    {
      name: 'argos-goals',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (!state?.goals) return;
        state.goals = state.goals.map((goal) => ({
          ...goal,
          createdAt: new Date(goal.createdAt),
          updatedAt: new Date(goal.updatedAt),
          completedAt: goal.completedAt ? new Date(goal.completedAt) : undefined,
        }));

        void getCurrentUserId().then((userId) => {
          if (userId) void state.syncFromSupabase(userId);
        });
      },
    }
  )
);
