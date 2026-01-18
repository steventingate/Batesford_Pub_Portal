import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { supabase } from '../lib/supabaseClient';
import { resolveStorageUrl } from '../lib/storage';
import { useToast } from '../components/ToastProvider';

type BrandAsset = {
  id: string;
  key: string;
  label: string;
  url: string;
};

type AppSetting = {
  key: string;
  value: string;
};

type AdminRow = {
  id: string;
  user_id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
};

export default function Settings() {
  const { profile, refreshAdmin, isAdmin, user } = useAuth();
  const [name, setName] = useState('');
  const toast = useToast();
  const [brandAssets, setBrandAssets] = useState<Record<string, BrandAsset | null>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [localPostcodes, setLocalPostcodes] = useState('3213,3220,3218,3216,3214,3228');
  const [bookingLink, setBookingLink] = useState('https://www.thebatesfordhotel.com.au/');
  const [venueAddress, setVenueAddress] = useState('700 Ballarat Road, Batesford VIC 3213');
  const [websiteLink, setWebsiteLink] = useState('https://www.thebatesfordhotel.com.au/');
  const [facebookLink, setFacebookLink] = useState('https://www.facebook.com/');
  const [instagramLink, setInstagramLink] = useState('https://www.instagram.com/');
  const [tiktokLink, setTiktokLink] = useState('https://www.tiktok.com/');
  const [xLink, setXLink] = useState('https://x.com/');
  const [linkedinLink, setLinkedinLink] = useState('https://www.linkedin.com/');
  const [facebookEnabled, setFacebookEnabled] = useState(true);
  const [instagramEnabled, setInstagramEnabled] = useState(true);
  const [tiktokEnabled, setTiktokEnabled] = useState(true);
  const [xEnabled, setXEnabled] = useState(true);
  const [linkedinEnabled, setLinkedinEnabled] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reinvitingId, setReinvitingId] = useState<string | null>(null);

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

  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'local_postcodes',
        'booking_link',
        'venue_address',
        'website_link',
        'facebook_link',
        'instagram_link',
        'tiktok_link',
        'x_link',
        'linkedin_link',
        'facebook_enabled',
        'instagram_enabled',
        'tiktok_enabled',
        'x_enabled',
        'linkedin_enabled'
      ]);
    if (error) {
      toast.pushToast('Unable to load settings.', 'error');
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((row) => {
      map[row.key] = row.value;
    });
    const parseSettingBool = (value: string | undefined, fallback: boolean) => {
      if (value === undefined) return fallback;
      const normalized = value.trim().toLowerCase();
      if (normalized === 'false' || normalized === '0') return false;
      if (normalized === 'true' || normalized === '1') return true;
      return fallback;
    };

    if (map.local_postcodes !== undefined) setLocalPostcodes(map.local_postcodes);
    if (map.booking_link !== undefined) setBookingLink(map.booking_link);
    if (map.venue_address !== undefined) setVenueAddress(map.venue_address);
    if (map.website_link !== undefined) setWebsiteLink(map.website_link);
    if (map.facebook_link !== undefined) setFacebookLink(map.facebook_link);
    if (map.instagram_link !== undefined) setInstagramLink(map.instagram_link);
    if (map.tiktok_link !== undefined) setTiktokLink(map.tiktok_link);
    if (map.x_link !== undefined) setXLink(map.x_link);
    if (map.linkedin_link !== undefined) setLinkedinLink(map.linkedin_link);
    setFacebookEnabled(parseSettingBool(map.facebook_enabled, true));
    setInstagramEnabled(parseSettingBool(map.instagram_enabled, true));
    setTiktokEnabled(parseSettingBool(map.tiktok_enabled, true));
    setXEnabled(parseSettingBool(map.x_enabled, true));
    setLinkedinEnabled(parseSettingBool(map.linkedin_enabled, true));
  }, [toast]);

  const loadAdmins = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAdmins(true);
    const { data, error } = await supabase
      .from('admin_profiles')
      .select('id, user_id, email, role, created_at, revoked_at, created_by')
      .order('created_at', { ascending: false });
    if (error) {
      toast.pushToast('Unable to load admins.', 'error');
      setLoadingAdmins(false);
      return;
    }
    setAdmins(data ?? []);
    setLoadingAdmins(false);
  }, [isAdmin, toast]);

  useEffect(() => {
    setName(profile?.full_name || '');
  }, [profile]);

  useEffect(() => {
    loadBrandAssets();
    loadSettings();
  }, [loadBrandAssets, loadSettings]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

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

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.pushToast('Enter an email address.', 'error');
      return;
    }
    setInviting(true);
    const { error } = await supabase.functions.invoke('admin-invite', {
      body: { email }
    });
    if (error) {
      toast.pushToast(error.message || 'Invite failed.', 'error');
      setInviting(false);
      return;
    }
    toast.pushToast('Invite sent.', 'success');
    setInviteEmail('');
    await loadAdmins();
    setInviting(false);
  };

  const handleReinvite = async (email: string, targetUserId: string) => {
    if (!email) {
      toast.pushToast('Email is required to re-invite.', 'error');
      return;
    }
    setReinvitingId(targetUserId);
    const { error } = await supabase.functions.invoke('admin-invite', {
      body: { email }
    });
    if (error) {
      toast.pushToast(error.message || 'Re-invite failed.', 'error');
      setReinvitingId(null);
      return;
    }
    toast.pushToast('Re-invite sent.', 'success');
    await loadAdmins();
    setReinvitingId(null);
  };

  const handleRevoke = async (targetUserId: string) => {
    setRevokingId(targetUserId);
    const { error } = await supabase.functions.invoke('admin-revoke', {
      body: { target_user_id: targetUserId }
    });
    if (error) {
      toast.pushToast(error.message || 'Revoke failed.', 'error');
      setRevokingId(null);
      return;
    }
    toast.pushToast('Admin access revoked.', 'success');
    await loadAdmins();
    setRevokingId(null);
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const saveLocalPostcodes = async () => {
    const cleaned = localPostcodes
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .join(',');
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'local_postcodes', value: cleaned } as AppSetting, { onConflict: 'key' });
    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }
    setLocalPostcodes(cleaned);
    toast.pushToast('Local postcodes saved.', 'success');
  };

  const saveEmailDefaults = async () => {
    const trimmedBooking = bookingLink.trim();
    const trimmedVenue = venueAddress.trim();
    const trimmedWebsite = websiteLink.trim();
    const { error } = await supabase
      .from('app_settings')
      .upsert([
        { key: 'booking_link', value: trimmedBooking },
        { key: 'venue_address', value: trimmedVenue },
        { key: 'website_link', value: trimmedWebsite }
      ] as AppSetting[], { onConflict: 'key' });
    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }
    setBookingLink(trimmedBooking);
    setVenueAddress(trimmedVenue);
    setWebsiteLink(trimmedWebsite);
    toast.pushToast('Email defaults saved.', 'success');
  };

  const saveSocialLinks = async () => {
    const payload: AppSetting[] = [
      { key: 'facebook_link', value: facebookLink.trim() },
      { key: 'instagram_link', value: instagramLink.trim() },
      { key: 'tiktok_link', value: tiktokLink.trim() },
      { key: 'x_link', value: xLink.trim() },
      { key: 'linkedin_link', value: linkedinLink.trim() },
      { key: 'facebook_enabled', value: String(facebookEnabled) },
      { key: 'instagram_enabled', value: String(instagramEnabled) },
      { key: 'tiktok_enabled', value: String(tiktokEnabled) },
      { key: 'x_enabled', value: String(xEnabled) },
      { key: 'linkedin_enabled', value: String(linkedinEnabled) }
    ];
    const { error } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'key' });
    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }
    setFacebookLink(payload[0].value);
    setInstagramLink(payload[1].value);
    setTiktokLink(payload[2].value);
    setXLink(payload[3].value);
    setLinkedinLink(payload[4].value);
    toast.pushToast('Social links saved.', 'success');
  };

  const triggerUpload = (key: string) => {
    inputRefs.current[key]?.click();
  };

  const handleUpload = async (key: string, label: string, file?: File) => {
    if (!file) return;
    setUploadingKey(key);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}-${file.name}`.replace(/\s+/g, '-');
    const folderMap: Record<string, string> = {
      logo: 'branding/logo',
      hero_default: 'branding/default-hero',
      footer_banner: 'branding/footer-banner'
    };
    const pathPrefix = folderMap[key] ?? `branding/${key}`;
    const path = `${pathPrefix}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('campaign-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.pushToast(uploadError.message, 'error');
      setUploadingKey(null);
      return;
    }

    const { error: upsertError } = await supabase
      .from('brand_assets')
      .upsert({ key, label, url: path }, { onConflict: 'key' });

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
        {!isAdmin ? (
          <p className="text-sm text-muted">Admin access is required to manage invites.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted">Invite a new admin by email.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  label="Admin email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                />
                <Button className="sm:mt-6" onClick={handleInvite} disabled={inviting}>
                  {inviting ? 'Sending...' : 'Send Invite'}
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-semibold">Admin list</h4>
                <Button variant="ghost" onClick={loadAdmins} disabled={loadingAdmins}>
                  Refresh
                </Button>
              </div>
              {loadingAdmins ? (
                <p className="text-sm text-muted">Loading admins...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-3 font-medium">Email</th>
                        <th className="py-2 pr-3 font-medium">Role</th>
                        <th className="py-2 pr-3 font-medium">Created</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {admins.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-muted">
                            No admins found yet.
                          </td>
                        </tr>
                      ) : (
                        admins.map((admin) => {
                          const isRevoked = Boolean(admin.revoked_at);
                          const isSelf = admin.user_id === user?.id;
                          return (
                            <tr key={admin.id}>
                              <td className="py-3 pr-3">{admin.email || '—'}</td>
                              <td className="py-3 pr-3">{admin.role || 'admin'}</td>
                              <td className="py-3 pr-3">{formatDate(admin.created_at)}</td>
                              <td className="py-3 pr-3">
                                <Badge tone={isRevoked ? 'soft' : 'accent'}>
                                  {isRevoked ? 'Revoked' : 'Active'}
                                </Badge>
                              </td>
                              <td className="py-3 pr-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    disabled={!admin.email || reinvitingId === admin.user_id}
                                    onClick={() =>
                                      handleReinvite(admin.email || '', admin.user_id)
                                    }
                                  >
                                    {reinvitingId === admin.user_id ? 'Sending...' : 'Re-invite'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    disabled={isRevoked || isSelf || revokingId === admin.user_id}
                                    onClick={() => handleRevoke(admin.user_id)}
                                  >
                                    {isSelf ? 'Current' : revokingId === admin.user_id ? 'Revoking...' : 'Revoke'}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <h3 className="text-2xl font-display text-brand">Local audience</h3>
        <p className="text-sm text-muted">Set the postcodes that define locals for segmentation.</p>
        <Card className="max-w-xl">
          <Input
            label="Local postcodes (comma-separated)"
            value={localPostcodes}
            onChange={(event) => setLocalPostcodes(event.target.value)}
            placeholder="3213,3220,3218,3216,3214,3228"
          />
          <Button className="mt-4" onClick={saveLocalPostcodes}>Save postcodes</Button>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-display text-brand">Email defaults</h3>
        <p className="text-sm text-muted">Used in template variables and the footer.</p>
        <Card className="max-w-xl">
          <Input
            label="Booking link"
            value={bookingLink}
            onChange={(event) => setBookingLink(event.target.value)}
            placeholder="https://www.thebatesfordhotel.com.au/"
          />
          <Input
            label="Venue address"
            value={venueAddress}
            onChange={(event) => setVenueAddress(event.target.value)}
            placeholder="700 Ballarat Road, Batesford VIC 3213"
          />
          <Input
            label="Website link"
            value={websiteLink}
            onChange={(event) => setWebsiteLink(event.target.value)}
            placeholder="https://www.thebatesfordhotel.com.au/"
          />
          <Button className="mt-4" onClick={saveEmailDefaults}>Save email defaults</Button>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-display text-brand">Social links</h3>
        <p className="text-sm text-muted">Used in the email footer social icons.</p>
        <Card className="max-w-xl">
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={facebookEnabled}
                onChange={(event) => setFacebookEnabled(event.target.checked)}
              />
              <span>Show Facebook icon</span>
            </label>
            <Input
              label="Facebook"
              value={facebookLink}
              onChange={(event) => setFacebookLink(event.target.value)}
              placeholder="https://www.facebook.com/yourpage"
            />
          </div>
          <div className="space-y-4 mt-4">
            <label className="flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={instagramEnabled}
                onChange={(event) => setInstagramEnabled(event.target.checked)}
              />
              <span>Show Instagram icon</span>
            </label>
            <Input
              label="Instagram"
              value={instagramLink}
              onChange={(event) => setInstagramLink(event.target.value)}
              placeholder="https://www.instagram.com/yourpage"
            />
          </div>
          <div className="space-y-4 mt-4">
            <label className="flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={tiktokEnabled}
                onChange={(event) => setTiktokEnabled(event.target.checked)}
              />
              <span>Show TikTok icon</span>
            </label>
            <Input
              label="TikTok"
              value={tiktokLink}
              onChange={(event) => setTiktokLink(event.target.value)}
              placeholder="https://www.tiktok.com/@yourpage"
            />
          </div>
          <div className="space-y-4 mt-4">
            <label className="flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={xEnabled}
                onChange={(event) => setXEnabled(event.target.checked)}
              />
              <span>Show X icon</span>
            </label>
            <Input
              label="X (Twitter)"
              value={xLink}
              onChange={(event) => setXLink(event.target.value)}
              placeholder="https://x.com/yourpage"
            />
          </div>
          <div className="space-y-4 mt-4">
            <label className="flex items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={linkedinEnabled}
                onChange={(event) => setLinkedinEnabled(event.target.checked)}
              />
              <span>Show LinkedIn icon</span>
            </label>
            <Input
              label="LinkedIn"
              value={linkedinLink}
              onChange={(event) => setLinkedinLink(event.target.value)}
              placeholder="https://www.linkedin.com/company/yourpage"
            />
          </div>
          <Button className="mt-4" onClick={saveSocialLinks}>Save social links</Button>
        </Card>
      </div>

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
                    <img src={resolveStorageUrl(current.url)} alt={asset.label} className="max-h-40 w-full object-contain" />
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

