import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Debug() {
  const { status, user, adminChecked, isAdmin } = useAuth();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
    };
    load();
  }, []);

  return (
    <div className="min-h-screen p-6 space-y-3">
      <h1 className="text-2xl font-semibold">Debug</h1>
      <div className="card p-4 space-y-2 text-sm">
        <div><strong>location.href:</strong> {window.location.href}</div>
        <div><strong>router basename:</strong> /admin</div>
        <div><strong>status:</strong> {status}</div>
        <div><strong>user:</strong> {user?.email || '-'}</div>
        <div><strong>adminChecked:</strong> {String(adminChecked)}</div>
        <div><strong>isAdmin:</strong> {String(isAdmin)}</div>
        <div><strong>getSession hasSession:</strong> {String(hasSession)}</div>
      </div>
    </div>
  );
}
