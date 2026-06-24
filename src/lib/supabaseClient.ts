import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, missingSupabaseEnvMessage, supabaseAnonKey, supabaseUrl } from './env';

const createMissingEnvProxy = () =>
  new Proxy(
    {},
    {
      get() {
        throw new Error(missingSupabaseEnvMessage || 'Missing Supabase environment variables.');
      }
    }
  ) as SupabaseClient;

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'batesford_admin_auth'
      }
    })
  : createMissingEnvProxy();
