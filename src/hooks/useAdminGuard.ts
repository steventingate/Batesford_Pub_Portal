import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type AdminGuardOptions = {
  intervalMs?: number;
};

export function useAdminGuard(options: AdminGuardOptions = {}) {
  const { status, user, session, refreshAdmin } = useAuth();
  const intervalMs = options.intervalMs ?? 180000;
  const runningRef = useRef(false);

  useEffect(() => {
    if (status !== 'authed' || !user || !session) return;
    let cancelled = false;

    const runCheck = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      const { data, error } = await supabase.rpc('is_admin', { uid: user.id });
      runningRef.current = false;
      if (cancelled) return;
      if (error || data !== true) {
        await refreshAdmin();
      }
    };

    runCheck();
    const interval = window.setInterval(runCheck, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [intervalMs, refreshAdmin, session, status, user]);
}