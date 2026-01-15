import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AdminProfile = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

type AuthState = {
  user: User | null;
  profile: AdminProfile | null;
  loading: boolean;
  adminChecked: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminChecked, setAdminChecked] = useState(false);

  const fetchProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setAdminChecked(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('user_id, full_name, role')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (error) {
        setProfile(null);
        setAdminChecked(true);
        return;
      }

      setProfile(data ?? null);
      setAdminChecked(true);
    } catch {
      setProfile(null);
      setAdminChecked(true);
    }
  };

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const safetyTimer = window.setTimeout(() => {
        if (active) {
          setLoading(false);
        }
      }, 2500);
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setUser(data.session?.user ?? null);
        setAdminChecked(false);
        await fetchProfile(data.session?.user ?? null);
      } finally {
        window.clearTimeout(safetyTimer);
        if (active) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setUser(session?.user ?? null);
        setAdminChecked(false);
        await fetchProfile(session?.user ?? null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    return {
      user,
      profile,
      loading,
      adminChecked,
      isAdmin: Boolean(profile?.user_id),
      refreshProfile: async () => fetchProfile(user),
      signOut: async () => {
        await supabase.auth.signOut();
      }
    };
  }, [user, profile, loading, adminChecked]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
