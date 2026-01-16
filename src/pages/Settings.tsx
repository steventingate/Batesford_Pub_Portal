import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/ToastProvider';

type BrandAsset = {
  id: string;
  key: string;
  label: string;
  url: string;
};

export default function Settings() {
  const { profile, refreshAdmin } = useAuth();
  const [name, setName] = useState('');
  const toast = useToast();
  const [brandAssets, setBrandAssets] = useState<Record<string, BrandAsset | null>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadBrandAssets = useCallback(async () => {
    const { data, error } = await supabase
      .from('brand_assets')
      .select('id, key, label, url, updated_at, created_at');
    if (error) {
      toast.pushToast('Unable to load brand assets.', 'error');
      return;
    }
    const map: Record<string, BrandAsset | null> = {};
    (data ?? []).forEach((row) => {
      map[row.key] = row as BrandAsset;
    });
    setBrandAssets(map);
  }, [toast]);

  useEffect(() => {
    setName(profile?.full_name || '');
  }, [profile]);

  useEffect(() => {
    loadBrandAssets();
  }, [loadBrandAssets]);

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

  const triggerUpload = (key: string) => {
    inputRefs.current[key]?.click();
  };

  const handleUpload = async (key: string, label: string, file?: File) => {
    if (!file) return;
    setUploadingKey(key);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}-${file.name}`.replace(/\s+/g, '-');
    const path = `${key}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('brand-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.pushToast(uploadError.message, 'error');
      setUploadingKey(null);
      return;
    }

    const { data } = supabase.storage.from('brand-assets').getPublicUrl(path);
    const url = data.publicUrl;
    const { error: upsertError } = await supabase
      .from('brand_assets')
      .upsert({ key, label, url }, { onConflict: 'key' });

    if (upsertError) {
      toast.pushToast(upsertError.message, 'error');
    } else {
      toast.pushToast('Brand asset updated.', 'success');
      await loadBrandAssets();
    }
    setUploadingKey(null);
  };

  const handleRemove = async (key: string) => {
    const { error } = await supabase
      .from('brand_assets')
      .delete()
      .eq('key', key);
    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }
    toast.pushToast('Brand asset removed.', 'success');
    await loadBrandAssets();
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

      <div className="space-y-4">
        <h3 className="text-2xl font-display text-brand">Branding</h3>
        <p className="text-sm text-muted">Upload Batesford Hotel imagery used across email templates.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { key: 'logo', label: 'Logo', hint: 'Ideal width 180px.' },
            { key: 'hero_default', label: 'Default Hero', hint: 'Wide image for the top of emails.' },
            { key: 'footer_banner', label: 'Footer Banner', hint: 'Optional footer image.' }
          ].map((asset) => {
            const current = brandAssets[asset.key];
            return (
              <Card key={asset.key} className="flex flex-col gap-3">
                <div>
                  <h4 className="text-lg font-semibold">{asset.label}</h4>
                  <p className="text-xs text-muted">{asset.hint}</p>
                </div>
                {current?.url ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <img src={current.url} alt={asset.label} className="max-h-40 w-full object-contain" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-muted">
                    No image uploaded yet.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[asset.key] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleUpload(asset.key, asset.label, event.target.files?.[0])}
                  />
                  <Button
                    variant="outline"
                    onClick={() => triggerUpload(asset.key)}
                    disabled={uploadingKey === asset.key}
                  >
                    {uploadingKey === asset.key ? 'Uploading...' : (current ? 'Replace image' : 'Upload image')}
                  </Button>
                  {current && (
                    <Button variant="ghost" onClick={() => handleRemove(asset.key)}>
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

