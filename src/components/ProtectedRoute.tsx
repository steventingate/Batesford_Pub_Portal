import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './ui/Spinner';

export function ProtectedRoute() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Checking session" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 max-w-lg text-center">
          <h2 className="text-2xl font-semibold mb-3">Access restricted</h2>
          <p className="text-muted">Your account is not on the admin list. Ask a manager to grant access.</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
