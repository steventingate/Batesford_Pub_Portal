import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { hasSupabaseEnv, missingSupabaseEnv } from './lib/env';
import './index.css';

function MissingEnvScreen() {
  return (
    <div className="login-shell">
      <div className="card login-panel p-8">
        <div className="muted-kicker">Admin Configuration Error</div>
        <h1 className="mt-3 font-display text-3xl text-white">Batesford Hotel</h1>
        <p className="mb-4 mt-3 text-muted">
          The admin app was loaded, but the Docker image was built without the required Vite environment variables.
        </p>
        <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-4 text-sm text-red-100">
          Missing: {missingSupabaseEnv.join(', ')}
        </div>
        <div className="mt-5 space-y-3 text-sm text-muted">
          <p>Fix in Portainer stack env:</p>
          <p><code>VITE_SUPABASE_URL</code></p>
          <p><code>VITE_SUPABASE_ANON_KEY</code></p>
          <p>Then redeploy the stack with rebuild enabled.</p>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    {hasSupabaseEnv ? (
      <BrowserRouter basename="/admin">
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <MissingEnvScreen />
    )}
  </React.StrictMode>
);
