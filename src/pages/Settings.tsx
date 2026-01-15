import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastProvider';

export default function Settings() {
  const { profile, refreshAdmin } = useAuth();
  const [name, setName] = useState('');
  const toast = useToast();

  useEffect(() => {
    setName(profile?.full_name || '');
  }, [profile]);

  const saveProfile = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from('admin_profiles')
      .update({ full_name: name })
      .eq('user_id', profile.user_id);
    if (error) {
      toast.pushToast(error.message, 'error');
    } else {
      toast.pushToast('Profile updated.', 'success');
      await refreshAdmin();
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Settings</h2>
          <p className="text-muted">Manage your profile and admin access.</p>
        </div>
      </div>

      <Card className="max-w-lg">
        <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} />
        <Button className="mt-4" onClick={saveProfile}>Save profile</Button>
      </Card>

      <Card className="max-w-lg">
        <h3 className="text-lg font-semibold mb-2">Access</h3>
        <p className="text-sm text-muted">To grant access, insert a row into admin_profiles with the user's auth uid.</p>
      </Card>
    </div>
  );
}
