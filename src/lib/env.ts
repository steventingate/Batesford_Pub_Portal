export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const getJwtRole = (key: string | undefined) => {
  if (!key || key.split('.').length !== 3) return null;

  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(window.atob(payload));
    return typeof decoded.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
};

const usesServiceRoleKey = getJwtRole(supabaseAnonKey) === 'service_role';

export const missingSupabaseEnv = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  usesServiceRoleKey ? 'VITE_SUPABASE_ANON_KEY must be an anon or publishable key, not a service_role key' : null
].filter(Boolean) as string[];

export const hasSupabaseEnv = missingSupabaseEnv.length === 0;

export const missingSupabaseEnvMessage =
  missingSupabaseEnv.length > 0
    ? `Missing Supabase environment variables: ${missingSupabaseEnv.join(', ')}.`
    : '';
