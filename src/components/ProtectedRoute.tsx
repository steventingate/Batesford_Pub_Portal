import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { supabase } from '../lib/supabaseClient';
import { useAdminGuard } from '../hooks/useAdminGuard';

export function ProtectedRoute() {
  const { status, signOut, refreshAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showHint, setShowHint] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapSuccess, setBootstrapSuccess] = useState<string | null>(null);

  useAdminGuard({ intervalMs: 180000 });

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const handleBootstrap = useCallback(async () => {
    setBootstrapping(true);
    setBootstrapError(null);
    setBootstrapSuccess(null);
    const { data, error } = await supabase.functions.invoke('admin-bootstrap');
    if (error) {
      setBootstrapError(error.message || 'Bootstrap failed.');
      setBootstrapping(false);
      return;
    }
    if (!data || data.ok !== true) {
      setBootstrapError('Bootstrap not allowed.');
      setBootstrapping(false);
      return;
    }
    setBootstrapSuccess('Admin access granted.');
    await refreshAdmin();
    setBootstrapping(false);
  }, [refreshAdmin]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner label="Checking session" />
          {showHint && (
            <>
              <p className="text-sm text-muted">Still checking…</p>
              <Button variant="outline" onClick={() => navigate('/login')}>Go to Login</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (status === 'guest') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-lg space-y-4">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-semibold mb-3">Access restricted</h2>
            <p className="text-muted mb-4">Your account is not on the admin list. Ask a manager to grant access.</p>
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </Card>
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-2">Set up Admin Access</h3>
            <p className="text-sm text-muted mb-4">
              If no admins exist yet, you can bootstrap this account as the first admin.
            </p>
            {bootstrapError && (
              <p className="text-sm text-red-600 mb-3">{bootstrapError}</p>
            )}
            {bootstrapSuccess && (
              <p className="text-sm text-emerald-700 mb-3">{bootstrapSuccess}</p>
            )}
            <Button onClick={handleBootstrap} disabled={bootstrapping}>
              {bootstrapping ? 'Setting up...' : 'Make this account the first admin'}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
