import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { clearLegacySupabaseStorage } from '../auth/authRecovery';

export type AdminProfile = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

type AuthState = {
  status: 'loading' | 'guest' | 'authed' | 'denied';
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  adminChecked: boolean;
  profile: AdminProfile | null;
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ADMIN_ROLES = new Set(['admin', 'manager']);

const parseAllowlist = () => {
  const raw = (import.meta.env.VITE_ADMIN_ALLOWLIST || '') as string;
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

const isAllowlisted = (email?: string | null) => {
  if (!email) return false;
  const allowlist = parseAllowlist();
  return allowlist.includes(email.trim().toLowerCase());
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    session: null,
    isAdmin: false,
    adminChecked: false,
    profile: null
  });

  const mountedRef = useRef(true);
  const bootingRef = useRef(false);
  const bootIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const legacyClearedRef = useRef(false);

  const safeSetState = useCallback((next: AuthState) => {
    if (!mountedRef.current) return;
    setState(next);
  }, []);

  const resolveGuest = useCallback((session: Session | null = null, user: User | null = null) => {
    safeSetState({
      status: 'guest',
      user,
      session,
      isAdmin: false,
      adminChecked: true,
      profile: null
    });
  }, [safeSetState]);

  const resolveDenied = useCallback((session: Session | null, user: User | null) => {
    safeSetState({
      status: 'denied',
      user,
      session,
      isAdmin: false,
      adminChecked: true,
      profile: null
    });
  }, [safeSetState]);

  const resolveAuthed = useCallback((session: Session, user: User, profile: AdminProfile | null) => {
    safeSetState({
      status: 'authed',
      user,
      session,
      isAdmin: true,
      adminChecked: true,
      profile
    });
  }, [safeSetState]);

  const checkAdmin = useCallback(async (user: User | null) => {
    if (!user) {
      return { isAdmin: false, profile: null as AdminProfile | null };
    }

    try {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('user_id, full_name, role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'manager'])
        .maybeSingle();

      if (error) {
        console.info('[AUTH] admin check error:', error.message);
        return { isAdmin: isAllowlisted(user.email), profile: null };
      }

      if (!data) {
        return { isAdmin: isAllowlisted(user.email), profile: null };
      }

      const role = data.role?.toLowerCase() || '';
      return { isAdmin: ADMIN_ROLES.has(role), profile: data };
    } catch (err) {
      console.info('[AUTH] admin check error:', err);
      return { isAdmin: isAllowlisted(user.email), profile: null };
    }
  }, []);

  const finishTimeout = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    if (bootingRef.current) return;
    bootingRef.current = true;
    const bootId = bootIdRef.current + 1;
    bootIdRef.current = bootId;

    timeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      if (bootIdRef.current !== bootId) return;
      resolveGuest();
    }, 6000);

    try {
      if (!legacyClearedRef.current) {
        legacyClearedRef.current = true;
        await clearLegacySupabaseStorage();
      }

      const { data, error } = await supabase.auth.getSession();
      if (!mountedRef.current || bootIdRef.current !== bootId) return;
      console.info('[AUTH] boot getSession result:', Boolean(data.session));
      if (error || !data.session?.user) {
        resolveGuest();
        return;
      }

      const session = data.session;
      const user = session.user;
      safeSetState({
        status: 'loading',
        user,
        session,
        isAdmin: false,
        adminChecked: false,
        profile: null
      });

      const { isAdmin, profile } = await checkAdmin(user);
      if (!mountedRef.current || bootIdRef.current !== bootId) return;
      console.info('[AUTH] admin check result:', isAdmin);

      if (!isAdmin) {
        resolveDenied(session, user);
        return;
      }

      resolveAuthed(session, user, profile);
    } catch {
      resolveGuest();
    } finally {
      finishTimeout();
      bootingRef.current = false;
    }
  }, [checkAdmin, finishTimeout, resolveAuthed, resolveDenied, resolveGuest]);

  useEffect(() => {
    mountedRef.current = true;
    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('[AUTH] event:', event);
      if (!mountedRef.current) return;

      if (!session?.user) {
        resolveGuest();
        return;
      }

      safeSetState({
        status: 'loading',
        user: session.user,
        session,
        isAdmin: false,
        adminChecked: false,
        profile: null
      });

      const { isAdmin, profile } = await checkAdmin(session.user);
      if (!mountedRef.current) return;
      console.info('[AUTH] admin check result:', isAdmin);

      if (!isAdmin) {
        resolveDenied(session, session.user);
        return;
      }

      resolveAuthed(session, session.user, profile);
    });

    return () => {
      mountedRef.current = false;
      finishTimeout();
      subscription.subscription.unsubscribe();
    };
  }, [bootstrap, checkAdmin, resolveAuthed, resolveDenied, resolveGuest, finishTimeout]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    resolveGuest();
  }, [resolveGuest]);

  const refreshAdmin = useCallback(async () => {
    if (!state.user || !state.session) {
      resolveGuest();
      return;
    }

    safeSetState({
      ...state,
      adminChecked: false
    });

    try {
      const { isAdmin, profile } = await checkAdmin(state.user);
      if (!mountedRef.current) return;
      if (!isAdmin) {
        await supabase.auth.signOut();
        resolveDenied();
        return;
      }

      safeSetState({
        ...state,
        isAdmin: true,
        adminChecked: true,
        profile
      });
    } catch {
      resolveGuest();
    }
  }, [checkAdmin, resolveDenied, resolveGuest, safeSetState, state]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signOut, refreshAdmin }),
    [state, signOut, refreshAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

