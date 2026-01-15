import { useState } from 'react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, adminChecked, loading } = useAuth();
  const from = (location.state as { from?: Location })?.from?.pathname || '/';
  const reason = new URLSearchParams(location.search).get('reason');

  useEffect(() => {
    if (!loading && user && adminChecked && isAdmin) {
      navigate(from, { replace: true });
    }
  }, [loading, user, adminChecked, isAdmin, navigate, from]);

  useEffect(() => {
    if (reason === 'denied') {
      toast.pushToast('Access denied. Your account is not an admin.', 'error');
    }
  }, [reason, toast]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }

    toast.pushToast('Welcome back.', 'success');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="max-w-lg w-full">
        <h1 className="font-display text-3xl text-brand mb-2">Batesford Admin</h1>
        <p className="text-muted mb-6">Sign in to manage guest Wi-Fi contacts and campaigns.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
