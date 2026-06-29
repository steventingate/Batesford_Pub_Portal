import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
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

const unifiSiteOptions = [
  { label: 'Madi House', value: 'xlgkkyrq' }
] as const;

export default function Settings() {
  const { profile, refreshAdmin, isAdmin, user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
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

  const [testSite, setTestSite] = useState('xlgkkyrq');
  const [testMac, setTestMac] = useState('62:b7:88:d6:e1:6f');
  const [wifiToolBusy, setWifiToolBusy] = useState(false);
  const [wifiToolMessage, setWifiToolMessage] = useState('');
  const [wifiToolTone, setWifiToolTone] = useState<'success' | 'error' | null>(null);

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
    void loadBrandAssets();
    void loadSettings();
  }, [loadBrandAssets, loadSettings]);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const saveProfile = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from('admin_profiles')
      .update({ full_name: name })
      .eq('user_id', profile.user_id);

    if (error) {
      toast.pushToast(error.message, 'error');
      return;
    }

    toast.pushToast('Profile updated.', 'success');
    await refreshAdmin();
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

  const handleDeauthorizeTestDevice = async () => {
    const site = testSite.trim();
    const mac = testMac.trim().toLowerCase().replace(/-/g, ':');
    if (!site || !mac) {
      toast.pushToast('Enter both a UniFi site and client MAC.', 'error');
      return;
    }

    setWifiToolBusy(true);
    setWifiToolMessage('');
    setWifiToolTone(null);

    try {
      const response = await fetch('/api/unifi/deauthorize-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site, mac, debug: true })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = typeof payload.error === 'string' ? payload.error : 'Deauthorize request failed.';
        setWifiToolMessage(errorMessage);
        setWifiToolTone('error');
        toast.pushToast('Deauthorize request failed.', 'error');
      } else {
        setWifiToolMessage('Guest authorization cleared. Reconnect the device to trigger the portal again.');
        setWifiToolTone('success');
        toast.pushToast('Device deauthorized for testing.', 'success');
      }
    } catch (error) {
      setWifiToolMessage(error instanceof Error ? error.message : String(error));
      setWifiToolTone('error');
      toast.pushToast('Could not reach the deauthorize endpoint.', 'error');
    } finally {
      setWifiToolBusy(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
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
      setUploadingKey(null);
      return;
    }

    toast.pushToast('Brand asset updated.', 'success');
    await loadBrandAssets();
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

  const activeAdmins = admins.filter((admin) => !admin.revoked_at);
  const localPostcodeCount = localPostcodes.split(',').map((value) => value.trim()).filter(Boolean).length;
  const activeSocialChannels = [facebookEnabled, instagramEnabled, tiktokEnabled, xEnabled, linkedinEnabled].filter(Boolean).length;
  const uploadedBrandAssets = ['logo', 'hero_default', 'footer_banner'].filter((key) => Boolean(brandAssets[key]?.url)).length;
  const socialRows = [
    { key: 'facebook', label: 'Facebook', enabled: facebookEnabled, setEnabled: setFacebookEnabled, value: facebookLink, setValue: setFacebookLink, placeholder: 'https://www.facebook.com/yourpage' },
    { key: 'instagram', label: 'Instagram', enabled: instagramEnabled, setEnabled: setInstagramEnabled, value: instagramLink, setValue: setInstagramLink, placeholder: 'https://www.instagram.com/yourpage' },
    { key: 'tiktok', label: 'TikTok', enabled: tiktokEnabled, setEnabled: setTiktokEnabled, value: tiktokLink, setValue: setTiktokLink, placeholder: 'https://www.tiktok.com/@yourpage' },
    { key: 'x', label: 'X', enabled: xEnabled, setEnabled: setXEnabled, value: xLink, setValue: setXLink, placeholder: 'https://x.com/yourpage' },
    { key: 'linkedin', label: 'LinkedIn', enabled: linkedinEnabled, setEnabled: setLinkedinEnabled, value: linkedinLink, setValue: setLinkedinLink, placeholder: 'https://www.linkedin.com/company/yourpage' }
  ];
  const brandingCards = [
    { key: 'logo', label: 'Logo', hint: 'Ideal width 180px.' },
    { key: 'hero_default', label: 'Default Hero', hint: 'Wide image for the top of emails.' },
    { key: 'footer_banner', label: 'Footer Banner', hint: 'Optional footer image.' }
  ] as const;

  return (
    <div className="admin-page settings-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Admin Console</div>
          <h2 className="text-3xl font-display">Settings</h2>
          <p className="text-muted">Manage your profile, guest-capture defaults, branding assets, and operational access from one control surface.</p>
        </div>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="muted-kicker">Active Admins</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{activeAdmins.length}</p>
          <p className="mt-2 text-sm text-muted">People with current access to the admin portal.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Local Postcodes</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{localPostcodeCount}</p>
          <p className="mt-2 text-sm text-muted">Used for CRM segmentation and audience targeting.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Social Channels</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{activeSocialChannels}</p>
          <p className="mt-2 text-sm text-muted">Footer links currently enabled for campaigns.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Brand Assets</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{uploadedBrandAssets}/3</p>
          <p className="mt-2 text-sm text-muted">Logo, hero and footer imagery ready for email output.</p>
        </Card>
      </div>

      <div className="settings-main-grid">
        <div className="settings-column">
          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Profile</h3>
                <p>Keep the signed-in admin record accurate for ownership and audit surfaces.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="settings-actions-row">
              <Button onClick={saveProfile}>Save profile</Button>
            </div>
          </Card>

          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Access</h3>
                <p>Invite admins, review active seats, and remove access when it should no longer be live.</p>
              </div>
            </div>
            {!isAdmin ? (
              <p className="text-sm text-muted">Admin access is required to manage invites.</p>
            ) : (
              <div className="space-y-5">
                <div className="settings-inline-form">
                  <Input label="Admin email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" />
                  <Button className="settings-inline-action" onClick={handleInvite} disabled={inviting}>
                    {inviting ? 'Sending...' : 'Send invite'}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--dashboard-text)]">Admin roster</div>
                    <div className="mt-1 text-xs text-muted">Current, revoked, and re-invite-ready access records.</div>
                  </div>
                  <Button variant="ghost" onClick={loadAdmins} disabled={loadingAdmins}>
                    {loadingAdmins ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>

                <div className="admin-scroll">
                  <table className="admin-table text-sm">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-muted">No admins found yet.</td>
                        </tr>
                      ) : (
                        admins.map((admin) => {
                          const isRevoked = Boolean(admin.revoked_at);
                          const isSelf = admin.user_id === user?.id;
                          return (
                            <tr key={admin.id}>
                              <td>{admin.email || '-'}</td>
                              <td>{admin.role || 'admin'}</td>
                              <td>{formatDate(admin.created_at)}</td>
                              <td>
                                <Badge tone={isRevoked ? 'soft' : 'accent'}>
                                  {isRevoked ? 'Revoked' : 'Active'}
                                </Badge>
                              </td>
                              <td>
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="outline" disabled={!admin.email || reinvitingId === admin.user_id} onClick={() => handleReinvite(admin.email || '', admin.user_id)}>
                                    {reinvitingId === admin.user_id ? 'Sending...' : 'Re-invite'}
                                  </Button>
                                  <Button variant="ghost" disabled={isRevoked || isSelf || revokingId === admin.user_id} onClick={() => handleRevoke(admin.user_id)}>
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
              </div>
            )}
          </Card>

          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Wi-Fi Test Tools</h3>
                <p>Clear an authorized guest device so the captive portal can be rerun on the next join.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <Select label="UniFi site" value={testSite} onChange={(event) => setTestSite(event.target.value)}>
                {unifiSiteOptions.map((site) => (
                  <option key={site.value} value={site.value}>{site.label}</option>
                ))}
              </Select>
              <Input label="Client MAC" value={testMac} onChange={(event) => setTestMac(event.target.value)} placeholder="62:b7:88:d6:e1:6f" />
            </div>
            <div className="settings-actions-row">
              <Button onClick={handleDeauthorizeTestDevice} disabled={wifiToolBusy}>
                {wifiToolBusy ? 'Clearing...' : 'Clear guest authorization'}
              </Button>
            </div>
            {wifiToolMessage ? <div className={wifiToolTone === 'success' ? 'settings-feedback success' : 'settings-feedback error'}>{wifiToolMessage}</div> : null}
          </Card>
        </div>

        <div className="settings-column">
          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Local Audience</h3>
                <p>Set the postcodes that define locals for segmentation, audience filters, and campaign targeting.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <Input label="Local postcodes (comma-separated)" value={localPostcodes} onChange={(event) => setLocalPostcodes(event.target.value)} placeholder="3213,3220,3218,3216,3214,3228" />
            </div>
            <div className="settings-actions-row">
              <Button onClick={saveLocalPostcodes}>Save postcodes</Button>
            </div>
          </Card>

          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Email Defaults</h3>
                <p>Used in template variables, footer links, and venue destination links inside campaigns.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <Input label="Booking link" value={bookingLink} onChange={(event) => setBookingLink(event.target.value)} placeholder="https://www.thebatesfordhotel.com.au/" />
              <Input label="Venue address" value={venueAddress} onChange={(event) => setVenueAddress(event.target.value)} placeholder="700 Ballarat Road, Batesford VIC 3213" />
              <Input label="Website link" value={websiteLink} onChange={(event) => setWebsiteLink(event.target.value)} placeholder="https://www.thebatesfordhotel.com.au/" />
            </div>
            <div className="settings-actions-row">
              <Button onClick={saveEmailDefaults}>Save email defaults</Button>
            </div>
          </Card>

          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Social Links</h3>
                <p>Choose which social icons appear in outbound campaigns and keep the destination URLs current.</p>
              </div>
            </div>
            <div className="settings-social-grid">
              {socialRows.map((row) => (
                <div key={row.key} className="settings-social-row">
                  <label className="settings-check">
                    <input type="checkbox" checked={row.enabled} onChange={(event) => row.setEnabled(event.target.checked)} />
                    <span>{row.label} enabled</span>
                  </label>
                  <Input label={row.label} value={row.value} onChange={(event) => row.setValue(event.target.value)} placeholder={row.placeholder} />
                </div>
              ))}
            </div>
            <div className="settings-actions-row">
              <Button onClick={saveSocialLinks}>Save social links</Button>
            </div>
          </Card>

          <Card className="settings-section-card">
            <div className="settings-card-header">
              <div>
                <h3>Branding</h3>
                <p>Upload Batesford Hotel imagery used across email templates and venue-owned communications.</p>
              </div>
            </div>
            <div className="settings-brand-grid">
              {brandingCards.map((asset) => {
                const current = brandAssets[asset.key];
                return (
                  <div key={asset.key} className="settings-brand-card">
                    <div>
                      <h4>{asset.label}</h4>
                      <p>{asset.hint}</p>
                    </div>
                    {current?.url ? (
                      <div className="settings-brand-preview">
                        <img src={resolveStorageUrl(current.url)} alt={asset.label} className="max-h-40 w-full object-contain" />
                      </div>
                    ) : (
                      <div className="settings-brand-empty">No image uploaded yet.</div>
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
                      <Button variant="outline" onClick={() => triggerUpload(asset.key)} disabled={uploadingKey === asset.key}>
                        {uploadingKey === asset.key ? 'Uploading...' : (current ? 'Replace image' : 'Upload image')}
                      </Button>
                      {current ? <Button variant="ghost" onClick={() => handleRemove(asset.key)}>Remove</Button> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

