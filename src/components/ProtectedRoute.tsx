import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';

export function ProtectedRoute() {
  const { status, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(true), 3000);
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

  useEffect(() => {
    if (status === 'denied') {
      signOut();
    }
  }, [status, signOut]);

  if (status === 'denied') {
    return <Navigate to="/login?reason=denied" replace />;
  }

  return <Outlet />;
}
