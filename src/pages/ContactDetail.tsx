import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { formatDateTime } from '../lib/format';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ToastProvider';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatDeviceLabel = (device: string | null, os: string | null) => {
  const deviceLabel = (device || 'unknown').toUpperCase();
  const osLabel = (os || 'unknown').toUpperCase();
  return `${deviceLabel} / ${osLabel}`;
};

const buildPostcodeMapUrl = (postcode: string) => {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${postcode} VIC Australia`)}&output=embed`;
};

const buildSeries = (data: Record<string, number> | null, size: number) => {
  return Array.from({ length: size }, (_, index) => {
    const key = String(index);
    return {
      key,
      count: Number(data?.[key] ?? 0)
    };
  });
};

type GuestProfile = {
  guest_id: string;
  email: string;
  full_name: string | null;
  mobile: string | null;
  postcode: string | null;
  segment: string | null;
  visit_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  visits_by_weekday: Record<string, number> | null;
  visits_by_hour: Record<string, number> | null;
  last_device_type: string | null;
  last_os_family: string | null;
  last_user_agent: string | null;
  marketing_consent: boolean | null;
  consent_timestamp: string | null;
  consent_source: string | null;
  privacy_policy_version: string | null;
  unsubscribe_status: boolean | null;
  unsubscribe_timestamp: string | null;
  unsubscribe_source: string | null;
  tags: string[] | null;
};

type ConnectionRow = {
  id: string;
  connected_at: string;
  device_type: string;
  os_family: string;
  user_agent: string | null;
};

type CampaignActivityRow = {
  id: string;
  email: string;
  sent_at: string | null;
  opened_at: string | null;
  campaign_name: string | null;
};

type GuestNoteRow = {
  id: string;
  note: string;
  created_at: string;
};

export default function ContactDetail() {
  const { pushToast } = useToast();
  const { id } = useParams();
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [recentConnections, setRecentConnections] = useState<ConnectionRow[]>([]);
  const [campaignActivity, setCampaignActivity] = useState<CampaignActivityRow[]>([]);
  const [deviceMacs, setDeviceMacs] = useState<string[]>([]);
  const [notes, setNotes] = useState<GuestNoteRow[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showPostcodeMap, setShowPostcodeMap] = useState(false);

  const loadGuest = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('guest_summary_view')
      .select('guest_id, email, full_name, mobile, postcode, segment, visit_count, first_seen_at, last_seen_at, visits_by_weekday, visits_by_hour, last_device_type, last_os_family, last_user_agent, marketing_consent, consent_timestamp, consent_source, privacy_policy_version, unsubscribe_status, unsubscribe_timestamp, unsubscribe_source, tags')
      .eq('guest_id', id)
      .maybeSingle();

    if (error) {
      pushToast(error.message, 'error');
      return;
    }

    const guestData = (data as GuestProfile) ?? null;
    setGuest(guestData);

    const sessionFilters = [guestData?.email ? `guest_email.eq.${guestData.email}` : null, guestData?.mobile ? `guest_phone.eq.${guestData.mobile}` : null]
      .filter(Boolean)
      .join(',');

    const [{ data: recent }, { data: recipientData }, { data: sessionData }, { data: notesData }] = await Promise.all([
      supabase
        .from('wifi_connections')
        .select('id, connected_at, device_type, os_family, user_agent')
        .eq('guest_id', id)
        .order('connected_at', { ascending: false })
        .limit(10),
      supabase
        .from('campaign_recipients')
        .select('id, email, sent_at, opened_at, campaign_runs(campaigns(name))')
        .eq('guest_id', id)
        .order('sent_at', { ascending: false })
        .limit(8),
      guestData && sessionFilters
        ? supabase
            .from('portal_sessions')
            .select('client_mac')
            .or(sessionFilters)
            .limit(30)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('guest_notes')
        .select('id, note, created_at')
        .eq('guest_id', id)
        .order('created_at', { ascending: false })
        .limit(12)
    ]);

    setRecentConnections((recent as ConnectionRow[]) ?? []);
    const normalizedCampaigns = ((recipientData ?? []) as Array<{
      id: string;
      email: string;
      sent_at: string | null;
      opened_at: string | null;
      campaign_runs: Array<{ campaigns: Array<{ name: string | null }> | { name: string | null } | null }> | { campaigns: Array<{ name: string | null }> | { name: string | null } | null } | null;
    }>).map((row) => {
      const run = Array.isArray(row.campaign_runs) ? row.campaign_runs[0] : row.campaign_runs;
      const campaign = Array.isArray(run?.campaigns) ? run?.campaigns[0] : run?.campaigns;
      return {
        id: row.id,
        email: row.email,
        sent_at: row.sent_at,
        opened_at: row.opened_at,
        campaign_name: campaign?.name ?? null
      };
    });

    setCampaignActivity(normalizedCampaigns);
    setDeviceMacs(
      [...new Set(((sessionData ?? []) as { client_mac: string | null }[]).map((row) => row.client_mac).filter(Boolean) as string[])]
    );
    setNotes((notesData as GuestNoteRow[]) ?? []);
  };

  useEffect(() => {
    void loadGuest();
  }, [id]);

  const addTag = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newTag.trim()) return;
    const { error } = await supabase.from('guest_tags').insert({
      guest_id: id,
      tag: newTag.trim()
    });
    if (error) {
      pushToast(error.message, 'error');
      return;
    }
    setNewTag('');
    await loadGuest();
  };

  const removeTag = async (tag: string) => {
    if (!id) return;
    const { error } = await supabase.from('guest_tags').delete().eq('guest_id', id).eq('tag', tag);
    if (error) {
      pushToast(error.message, 'error');
      return;
    }
    await loadGuest();
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newNote.trim()) return;
    const { error, data } = await supabase
      .from('guest_notes')
      .insert({
        guest_id: id,
        note: newNote.trim()
      })
      .select('id, note, created_at')
      .single();

    if (error) {
      pushToast(error.message, 'error');
      return;
    }

    setNotes((current) => [data as GuestNoteRow, ...current]);
    setNewNote('');
  };

  const renderBars = (series: { key: string; count: number }[], labels?: string[], columns = 7) => {
    const maxValue = Math.max(...series.map((item) => item.count), 1);
    return (
      <div className="grid gap-2 items-end" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {series.map((item, index) => (
          <div key={item.key} className="flex flex-col items-center gap-2">
            <div className="w-8 h-20 rounded-lg bg-[rgba(26,71,42,0.12)] relative overflow-hidden">
              <div className="absolute bottom-0 left-0 right-0 bg-brand" style={{ height: `${(item.count / maxValue) * 100}%` }} />
            </div>
            <span className="text-[11px] text-muted">{labels ? labels[index] : item.key}</span>
          </div>
        ))}
      </div>
    );
  };

  const hourSeries = useMemo(() => buildSeries(guest?.visits_by_hour ?? null, 24), [guest?.visits_by_hour]);
  const weekdaySeries = useMemo(() => buildSeries(guest?.visits_by_weekday ?? null, 7), [guest?.visits_by_weekday]);
  const daysSinceLastSeen = useMemo(() => {
    if (!guest?.last_seen_at) return null;
    return Math.floor((Date.now() - new Date(guest.last_seen_at).getTime()) / (1000 * 60 * 60 * 24));
  }, [guest?.last_seen_at]);
  const isRegular = Number(guest?.visit_count ?? 0) >= 3 && (daysSinceLastSeen ?? 999) <= 30;

  if (!guest) {
    return <p className="text-muted">Loading visitor profile...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Link to="/guests" className="text-sm text-muted">Back to guests</Link>
          <h2 className="text-3xl font-display text-brand">{guest.full_name || 'Guest'}</h2>
          <p className="text-muted">{guest.email || guest.mobile || 'No contact details'}</p>
          <p className="text-sm text-muted">
            {guest.postcode
              ? `Postcode: ${guest.postcode} (${(guest.segment || 'unknown').charAt(0).toUpperCase() + (guest.segment || 'unknown').slice(1)})`
              : 'Postcode: Not provided'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/campaigns/new" className="btn btn-outline">Create campaign</Link>
          <Link to="/reports" className="btn btn-outline">Open reports</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-muted">Visit count</p>
          <p className="text-2xl font-semibold text-brand">{Number(guest.visit_count ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">First seen</p>
          <p className="text-sm font-semibold">{guest.first_seen_at ? formatDateTime(guest.first_seen_at) : '-'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Last seen</p>
          <p className="text-sm font-semibold">{guest.last_seen_at ? formatDateTime(guest.last_seen_at) : '-'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Last device</p>
          <p className="text-sm font-semibold text-brand">
            {formatDeviceLabel(guest.last_device_type, guest.last_os_family)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card>
          <p className="text-sm text-muted">Guest status</p>
          <p className="mt-2 text-sm font-semibold text-white">{Number(guest.visit_count ?? 0) <= 1 ? 'New guest' : 'Returning guest'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Regularity</p>
          <p className="mt-2 text-sm font-semibold text-white">{isRegular ? 'Regular' : 'Occasional'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Lapse window</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {daysSinceLastSeen === null
              ? '-'
              : daysSinceLastSeen >= 90
              ? 'Lapsed 90+'
              : daysSinceLastSeen >= 60
              ? 'Lapsed 60+'
              : daysSinceLastSeen >= 30
              ? 'Lapsed 30+'
              : 'Active'}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Consent</p>
          <p className="mt-2 text-sm font-semibold text-white">{guest.marketing_consent ? 'Consented' : 'No consent stored'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Unsubscribe</p>
          <p className="mt-2 text-sm font-semibold text-white">{guest.unsubscribe_status ? 'Unsubscribed' : 'Subscribed'}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-2">Visits by weekday</h3>
          {renderBars(weekdaySeries, weekdayLabels, 7)}
        </Card>
        <Card>
          <h3 className="text-lg font-semibold mb-2">Visits by hour</h3>
          {renderBars(hourSeries, undefined, 12)}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <h3 className="text-lg font-semibold text-white">Profile details</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Consent source</div>
              <div className="mt-2 text-sm text-white">{guest.consent_source || '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Consent timestamp</div>
              <div className="mt-2 text-sm text-white">{guest.consent_timestamp ? formatDateTime(guest.consent_timestamp) : '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Privacy policy version</div>
              <div className="mt-2 text-sm text-white">{guest.privacy_policy_version || '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Unsubscribe timestamp</div>
              <div className="mt-2 text-sm text-white">{guest.unsubscribe_timestamp ? formatDateTime(guest.unsubscribe_timestamp) : '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Unsubscribe source</div>
              <div className="mt-2 text-sm text-white">{guest.unsubscribe_source || '-'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Devices / MACs seen</div>
              <div className="mt-2 text-sm text-white">{deviceMacs.length ? deviceMacs.join(', ') : 'No MAC history stored yet'}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-white">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {(guest.tags ?? []).map((tag) => (
                <button key={tag} type="button" onClick={() => removeTag(tag)}>
                  <Badge tone="accent">{tag}</Badge>
                </button>
              ))}
              {!(guest.tags ?? []).length ? <span className="text-sm text-muted">No tags yet.</span> : null}
            </div>
          </div>
          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={addTag}>
            <Input
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              placeholder="Regular, Local, VIP, Staff/Test"
            />
            <Button type="submit">Add tag</Button>
          </form>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent connections</h3>
          {guest.postcode && (
            <button
              type="button"
              className="text-xs font-semibold text-brand underline"
              onClick={() => setShowPostcodeMap((prev) => !prev)}
            >
              {showPostcodeMap ? 'Hide postcode map' : 'Show postcode map'}
            </button>
          )}
        </div>
        {showPostcodeMap && guest.postcode && (
          <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
            <iframe
              title={`Postcode ${guest.postcode} map`}
              src={buildPostcodeMapUrl(guest.postcode)}
              className="h-64 w-full"
              loading="lazy"
            />
          </div>
        )}
        <div className="space-y-3">
          {recentConnections.map((connection) => (
            <div key={connection.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <p className="font-semibold">{formatDateTime(connection.connected_at)}</p>
                <p className="text-xs text-muted">{connection.user_agent || 'Unknown user agent'}</p>
              </div>
              <span className="text-sm font-semibold text-brand">
                {formatDeviceLabel(connection.device_type, connection.os_family)}
              </span>
            </div>
          ))}
          {!recentConnections.length && <p className="text-sm text-muted">No recent connections.</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <h3 className="text-lg font-semibold text-white">Campaign activity</h3>
          <div className="mt-4 space-y-3">
            {campaignActivity.map((row) => (
              <div key={row.id} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold text-white">{row.campaign_name || 'Campaign'}</div>
                  <Badge tone={row.opened_at ? 'accent' : 'soft'}>{row.opened_at ? 'Opened' : 'Sent'}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted">
                  Sent {row.sent_at ? formatDateTime(row.sent_at) : '-'}
                  {row.opened_at ? ` · Opened ${formatDateTime(row.opened_at)}` : ''}
                </div>
              </div>
            ))}
            {!campaignActivity.length ? <p className="text-sm text-muted">No campaign sends recorded for this guest yet.</p> : null}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-white">Admin notes</h3>
          <form className="mt-4 space-y-3" onSubmit={addNote}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-muted">Add note</span>
              <textarea
                className="input min-h-[120px] resize-y"
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                placeholder="Useful context for the team. Example: regular Friday lunch guest, asked about event offers."
              />
            </label>
            <Button type="submit">Save note</Button>
          </form>
          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-sm text-white">{note.note}</div>
                <div className="mt-2 text-xs text-muted">{formatDateTime(note.created_at)}</div>
              </div>
            ))}
            {!notes.length ? <p className="text-sm text-muted">No notes yet.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
