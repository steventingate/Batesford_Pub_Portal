export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const missingSupabaseEnv = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null
].filter(Boolean) as string[];

export const hasSupabaseEnv = missingSupabaseEnv.length === 0;

export const missingSupabaseEnvMessage =
  missingSupabaseEnv.length > 0
    ? `Missing Supabase environment variables: ${missingSupabaseEnv.join(', ')}.`
    : '';
