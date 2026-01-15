import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AuthStatus = 'loading' | 'guest' | 'authed' | 'denied';

export type AdminProfile = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: AdminProfile | null;
  error: string | null;
  lastEventAt: number | null;
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ADMIN_ROLES = new Set(['admin', 'manager']);

const readAllowlist = () => {
  const raw = (import.meta.env.VITE_ADMIN_ALLOWLIST || '') as string;
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

const isAdminByAllowlist = (email?: string | null) => {
  if (!email) return false;
  const allowlist = readAllowlist();
  return allowlist.includes(email.trim().toLowerCase());
};

const checkAdmin = async (user: User | null) => {
  if (!user) return { isAdmin: false, profile: null as AdminProfile | null };

  try {
    const { data, error } = await supabase
      .from('admin_profiles')
      .select('user_id, full_name, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return { isAdmin: isAdminByAllowlist(user.email), profile: null };
    }

    const role = data?.role?.toLowerCase() || '';
    return { isAdmin: ADMIN_ROLES.has(role), profile: data ?? null };
  } catch {
    return { isAdmin: isAdminByAllowlist(user.email), profile: null };
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
    user: null,
    profile: null,
    error: null,
    lastEventAt: null
  });

  const mountedRef = useRef(true);
  const bootRef = useRef(false);
  const bootTokenRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const statusRef = useRef<AuthStatus>('loading');

  const setSafeState = useCallback((next: AuthState) => {
    if (!mountedRef.current) return;
    statusRef.current = next.status;
    setState(next);
  }, []);

  const resolveGuest = useCallback((reason?: string) => {
    setSafeState({
      status: 'guest',
      session: null,
      user: null,
      profile: null,
      error: reason || null,
      lastEventAt: Date.now()
    });
  }, [setSafeState]);

  const resolveDenied = useCallback((reason?: string) => {
    setSafeState({
      status: 'denied',
      session: null,
      user: null,
      profile: null,
      error: reason || null,
      lastEventAt: Date.now()
    });
  }, [setSafeState]);

  const resolveAuthed = useCallback((session: Session, user: User, profile: AdminProfile | null) => {
    setSafeState({
      status: 'authed',
      session,
      user,
      profile,
      error: null,
      lastEventAt: Date.now()
    });
  }, [setSafeState]);

  const finishLoading = useCallback((reason?: string) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (reason) {
      resolveGuest(reason);
    }
  }, [resolveGuest]);

  const bootstrap = useCallback(async () => {
    if (bootRef.current) return;
    bootRef.current = true;
    const token = bootTokenRef.current + 1;
    bootTokenRef.current = token;

    timeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      if (bootTokenRef.current !== token) return;
      if (statusRef.current === 'loading') {
        resolveGuest('timeout');
      }
    }, 6000);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (bootTokenRef.current !== token) return;
      if (error || !data.session?.user) {
        resolveGuest(error?.message || 'no-session');
        return;
      }

      const session = data.session;
      const user = session.user;
      const { isAdmin, profile } = await checkAdmin(user);
      if (bootTokenRef.current !== token) return;
      if (!isAdmin) {
        await supabase.auth.signOut();
        resolveDenied('not-admin');
        return;
      }

      resolveAuthed(session, user, profile);
    } catch {
      resolveGuest('bootstrap-error');
    } finally {
      if (bootTokenRef.current !== token) return;
      finishLoading();
    }
  }, [finishLoading, resolveAuthed, resolveDenied, resolveGuest]);

  useEffect(() => {
    mountedRef.current = true;
    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;

      if (!session?.user) {
        resolveGuest('signed-out');
        return;
      }

      const { isAdmin, profile } = await checkAdmin(session.user);
      if (!isAdmin) {
        await supabase.auth.signOut();
        resolveDenied('not-admin');
        return;
      }

      resolveAuthed(session, session.user, profile);
    });

    return () => {
      mountedRef.current = false;
      subscription.subscription.unsubscribe();
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [bootstrap, resolveAuthed, resolveDenied, resolveGuest]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    resolveGuest('signed-out');
  }, [resolveGuest]);

  const refresh = useCallback(async () => {
    bootRef.current = false;
    setSafeState({
      status: 'loading',
      session: null,
      user: null,
      profile: null,
      error: null,
      lastEventAt: Date.now()
    });
    await bootstrap();
  }, [bootstrap, setSafeState]);

  const value = useMemo<AuthContextValue>(() => ({ ...state, signOut, refresh }), [state, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
