import { supabase } from './supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const invokeEdgeFunction = async <T>(
  name: string,
  payload: Record<string, unknown>
) => {
  let session = (await supabase.auth.getSession()).data.session;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = session?.expires_at ?? 0;
  if (!session || expiresAt - nowSeconds < 60) {
    const refresh = await supabase.auth.refreshSession();
    session = refresh.data.session ?? session;
  }
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Missing session. Please sign in again.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: string }).error || '')
        : '';
    const message = apiMessage || (response.status === 401
      ? 'Unauthorized. Please sign out and back in.'
      : `Request failed (status ${response.status}).`);
    throw new Error(message);
  }

  return data as T;
};
