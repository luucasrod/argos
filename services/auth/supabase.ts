import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

export type SupabaseUser = {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  provider?: string;
};

export function mapUser(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, string>;
  app_metadata?: Record<string, string>;
  identities?: Array<{ provider?: string }>;
}): SupabaseUser {
  const provider =
    user.app_metadata?.provider ??
    user.identities?.[0]?.provider ??
    (user.email ? 'email' : undefined);

  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0],
    avatarUrl: user.user_metadata?.avatar_url,
    provider,
  };
}
