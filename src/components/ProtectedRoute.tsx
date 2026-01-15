import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';

export function ProtectedRoute() {
  const { status, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

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
        <div className="card p-8 max-w-lg text-center">
          <h2 className="text-2xl font-semibold mb-3">Access restricted</h2>
          <p className="text-muted mb-4">Your account is not on the admin list. Ask a manager to grant access.</p>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
