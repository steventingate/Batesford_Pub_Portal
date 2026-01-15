import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user, isAdmin, adminChecked } = useAuth();
  const from = (location.state as { from?: Location })?.from?.pathname || '/';
  const reason = new URLSearchParams(location.search).get('reason');

  useEffect(() => {
    if (status === 'authed' || (user && adminChecked && isAdmin)) {
      navigate(from, { replace: true });
    }
  }, [status, user, adminChecked, isAdmin, navigate, from]);

  useEffect(() => {
    if (reason === 'denied') {
      toast.pushToast('Access denied. Your account is not an admin.', 'error');
    }
  }, [reason, toast]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.pushToast('Signed in, but no session found. Please retry.', 'error');
      return;
    }

    toast.pushToast('Welcome back.', 'success');
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="max-w-lg w-full">
        <h1 className="font-display text-3xl text-brand mb-2">Batesford Admin</h1>
        <p className="text-muted mb-6">Sign in to manage guest Wi-Fi contacts and campaigns.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

