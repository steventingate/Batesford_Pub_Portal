import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { ContactCard, DataTable, FilterPanel, Info } from '../components/admin/AdminComponents';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatDateTime, toCsv } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatDeviceLabel = (device: string | null, os: string | null) => {
  const deviceLabel = (device || 'unknown').toUpperCase();
  const osLabel = (os || 'unknown').toUpperCase();
  return `${deviceLabel} / ${osLabel}`;
};

const buildPostcodeMapUrl = (postcode: string) => `https://www.google.com/maps?q=${encodeURIComponent(`${postcode} VIC Australia`)}&output=embed`;

const buildSeries = (data: Record<string, number> | null, size: number) =>
  Array.from({ length: size }, (_, index) => ({
    key: String(index),
    count: Number(data?.[String(index)] ?? 0)
  }));

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
};

type ConnectionRow = {
  id: string;
  connected_at: string;
  device_type: string;
  os_family: string;
  user_agent: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
  subject: string;
};

export default function Contacts() {
  const { pushToast } = useToast();
  const [profiles, setProfiles] = useState<GuestProfile[]>([]);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [hasEmail, setHasEmail] = useState('all');
  const [returningOnly, setReturningOnly] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestProfile | null>(null);
  const [recentConnections, setRecentConnections] = useState<ConnectionRow[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendGuest, setSendGuest] = useState<GuestProfile | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [showPostcodeMap, setShowPostcodeMap] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('guest_segments')
        .select('guest_id, email, full_name, mobile, postcode, segment, visit_count, first_seen_at, last_seen_at, visits_by_weekday, visits_by_hour, last_device_type, last_os_family, last_user_agent')
        .order('last_seen_at', { ascending: false });

      setProfiles((data as GuestProfile[]) ?? []);
    };

    load();
  }, []);

  useEffect(() => {
    const loadTemplates = async () => {
      const { data, error } = await supabase.from('campaign_templates').select('id, name, subject').order('created_at', { ascending: false });
      if (error) {
        pushToast('Unable to load templates.', 'error');
        return;
      }
      setTemplates((data as TemplateOption[]) ?? []);
    };
    loadTemplates();
  }, [pushToast]);

  useEffect(() => {
    const loadRecent = async () => {
      if (!selectedGuest?.guest_id) {
        setRecentConnections([]);
        return;
      }

      const { data } = await supabase
        .from('wifi_connections')
        .select('id, connected_at, device_type, os_family, user_agent')
        .eq('guest_id', selectedGuest.guest_id)
        .order('connected_at', { ascending: false })
        .limit(10);

      setRecentConnections((data as ConnectionRow[]) ?? []);
    };

    loadRecent();
  }, [selectedGuest?.guest_id]);

  useEffect(() => {
    setShowPostcodeMap(false);
  }, [selectedGuest?.guest_id]);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(dateRange));
    const searchLower = search.toLowerCase();

    return profiles.filter((guest) => {
      const matchesSearch =
        !searchLower ||
        [guest.full_name, guest.email, guest.mobile, guest.postcode]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;

      if (dateRange !== 'all' && guest.last_seen_at) {
        const lastSeen = new Date(guest.last_seen_at);
        if (lastSeen < cutoff) return false;
      }

      if (hasEmail === 'yes' && !guest.email) return false;
      if (hasEmail === 'no' && guest.email) return false;
      if (returningOnly && Number(guest.visit_count ?? 0) < 2) return false;
      return true;
    });
  }, [profiles, search, dateRange, hasEmail, returningOnly]);

  const totals = useMemo(() => ({
    total: filtered.length,
    withEmail: filtered.filter((guest) => Boolean(guest.email)).length,
    returning: filtered.filter((guest) => Number(guest.visit_count ?? 0) >= 2).length
  }), [filtered]);

  const handleExport = () => {
    const rows = filtered.map((guest) => ({
      name: guest.full_name ?? '',
      email: guest.email ?? '',
      mobile: guest.mobile ?? '',
      postcode: guest.postcode ?? '',
      segment: guest.segment ?? '',
      visit_count: Number(guest.visit_count ?? 0),
      first_seen_at: guest.first_seen_at ?? '',
      last_seen_at: guest.last_seen_at ?? '',
      last_device_type: guest.last_device_type ?? '',
      last_os_family: guest.last_os_family ?? ''
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'batesford-guests.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendEmail = async () => {
    if (!sendGuest?.email) {
      pushToast('Guest has no email address.', 'error');
      return;
    }
    if (!selectedTemplateId) {
      pushToast('Select a template.', 'error');
      return;
    }
    setSending(true);
    try {
      await invokeEdgeFunction('send-campaign-email', {
        template_id: selectedTemplateId,
        mode: 'single',
        guest_id: sendGuest.guest_id
      });
      pushToast(`Sent to ${sendGuest.email}`, 'success');
      setSendModalOpen(false);
      setSendGuest(null);
      setSelectedTemplateId('');
    } catch (error) {
      pushToast(`Send failed: ${(error as Error).message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const closeSendModal = () => {
    setSendModalOpen(false);
    setSendGuest(null);
    setSelectedTemplateId('');
  };

  const renderBars = (series: { key: string; count: number }[], labels?: string[], columns = 7) => {
    const maxValue = Math.max(...series.map((item) => item.count), 1);
    return (
      <div className="grid gap-2 items-end" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {series.map((item, index) => (
          <div key={item.key} className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-full overflow-hidden rounded-2xl border border-white/6 bg-white/[0.03]">
              <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-gradient-to-t from-emerald-500 to-teal-200" style={{ height: `${(item.count / maxValue) * 100}%` }} />
            </div>
            <span className="text-[11px] text-muted">{labels ? labels[index] : item.key}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Audience CRM</div>
          <h2 className="font-display text-4xl text-white">Contacts</h2>
          <p className="max-w-2xl text-muted">Search, segment, and action your guest Wi-Fi audience without losing usability on smaller screens.</p>
        </div>
        <Button variant="outline" onClick={handleExport}>Export CSV</Button>
      </div>

      <div className="admin-grid md:grid-cols-3">
        <Card>
          <div className="muted-kicker">Visible Contacts</div>
          <p className="mt-3 font-display text-4xl text-white">{totals.total}</p>
          <p className="mt-2 text-sm text-muted">Guests in the active result set.</p>
        </Card>
        <Card>
          <div className="muted-kicker">With Email</div>
          <p className="mt-3 font-display text-4xl text-white">{totals.withEmail}</p>
          <p className="mt-2 text-sm text-muted">Ready for campaign outreach.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Returning Guests</div>
          <p className="mt-3 font-display text-4xl text-white">{totals.returning}</p>
          <p className="mt-2 text-sm text-muted">Repeat visitors in this view.</p>
        </Card>
      </div>

      <FilterPanel>
        <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, mobile, postcode" />
        <Select label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
        <Select label="Has email" value={hasEmail} onChange={(event) => setHasEmail(event.target.value)}>
          <option value="all">All contacts</option>
          <option value="yes">Has email</option>
          <option value="no">Missing email</option>
        </Select>
        <label className="flex min-h-[46px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 text-sm font-semibold text-white">
          <input type="checkbox" checked={returningOnly} onChange={(event) => setReturningOnly(event.target.checked)} className="h-4 w-4" />
          Returning only
        </label>
        <div className="flex items-end">
          <Button variant="outline" className="w-full" onClick={handleExport}>Export CSV</Button>
        </div>
      </FilterPanel>

      <div className="space-y-4 desktop-only">
        <Card>
          <DataTable>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Postcode</th>
                <th>Segment</th>
                <th>Visits</th>
                <th>Last seen</th>
                <th>Device</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => (
                <tr key={guest.guest_id} className="cursor-pointer" onClick={() => setSelectedGuest(guest)}>
                  <td>
                    <div className="font-semibold text-white">{guest.full_name || 'Guest'}</div>
                    <div className="mt-1 text-xs text-muted">{guest.first_seen_at ? `First seen ${formatDateTime(guest.first_seen_at)}` : 'First seen unavailable'}</div>
                  </td>
                  <td>{guest.email || '-'}</td>
                  <td>{guest.mobile || '-'}</td>
                  <td>{guest.postcode || '-'}</td>
                  <td><span className="status-pill">{(guest.segment || 'unknown').replace(/^./, (char) => char.toUpperCase())}</span></td>
                  <td>{Number(guest.visit_count ?? 0)}</td>
                  <td>{guest.last_seen_at ? formatDateTime(guest.last_seen_at) : '-'}</td>
                  <td>{formatDeviceLabel(guest.last_device_type, guest.last_os_family)}</td>
                  <td>
                    {guest.email ? (
                      <Button
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSendGuest(guest);
                          setSelectedTemplateId('');
                          setSendModalOpen(true);
                        }}
                      >
                        Send campaign
                      </Button>
                    ) : (
                      <span className="text-sm text-muted">No email</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!filtered.length ? <p className="py-8 text-center text-sm text-muted">No contacts match this filter.</p> : null}
        </Card>
      </div>

      <div className="mobile-only space-y-4">
        {filtered.map((guest) => (
          <ContactCard
            key={guest.guest_id}
            name={guest.full_name || 'Guest'}
            email={guest.email}
            mobile={guest.mobile}
            postcode={guest.postcode}
            segment={(guest.segment || 'unknown').replace(/^./, (char) => char.toUpperCase())}
            visits={Number(guest.visit_count ?? 0)}
            lastSeen={guest.last_seen_at ? formatDateTime(guest.last_seen_at) : '-'}
            onClick={() => setSelectedGuest(guest)}
            action={guest.email ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSendGuest(guest);
                  setSelectedTemplateId('');
                  setSendModalOpen(true);
                }}
              >
                Send campaign
              </Button>
            ) : undefined}
          />
        ))}
        {!filtered.length ? <p className="py-4 text-center text-sm text-muted">No contacts match this filter.</p> : null}
      </div>

      {sendModalOpen && sendGuest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeSendModal}>
          <Card className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="muted-kicker">Campaign Action</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">Send campaign</h3>
                <p className="mt-2 text-sm text-muted">{sendGuest.full_name || 'Guest'} - {sendGuest.email || 'No email'}</p>
              </div>
              <Button variant="ghost" onClick={closeSendModal}>Close</Button>
            </div>
            <div className="mt-5 space-y-4">
              <Select label="Template" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </Select>
              {selectedTemplateId ? (
                <p className="text-sm text-muted">Subject: {templates.find((template) => template.id === selectedTemplateId)?.subject || '-'}</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSendEmail} disabled={sending}>{sending ? 'Sending...' : 'Send now'}</Button>
                <Button variant="ghost" onClick={closeSendModal}>Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {selectedGuest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedGuest(null)}>
          <Card className="max-h-[90vh] w-full max-w-5xl overflow-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="muted-kicker">Guest Profile</div>
                <h3 className="mt-2 font-display text-3xl text-white">{selectedGuest.full_name || 'Guest'}</h3>
                <p className="mt-2 text-sm text-muted">{selectedGuest.email || 'No email'} / {selectedGuest.mobile || 'No mobile'}</p>
                <p className="mt-1 text-sm text-muted">
                  {selectedGuest.postcode
                    ? `Postcode ${selectedGuest.postcode} (${(selectedGuest.segment || 'unknown').replace(/^./, (char) => char.toUpperCase())})`
                    : 'Postcode not provided'}
                </p>
              </div>
              <Button variant="outline" onClick={() => setSelectedGuest(null)}>Close</Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <Card><Info label="Visits" value={String(selectedGuest.visit_count)} /></Card>
              <Card><Info label="First Seen" value={selectedGuest.first_seen_at ? formatDateTime(selectedGuest.first_seen_at) : '-'} /></Card>
              <Card><Info label="Last Seen" value={selectedGuest.last_seen_at ? formatDateTime(selectedGuest.last_seen_at) : '-'} /></Card>
              <Card><Info label="Last Device" value={formatDeviceLabel(selectedGuest.last_device_type, selectedGuest.last_os_family)} /></Card>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <div className="mb-4 text-sm font-semibold text-white">Visits by weekday</div>
                {renderBars(buildSeries(selectedGuest.visits_by_weekday, 7), weekdayLabels, 7)}
              </Card>
              <Card>
                <div className="mb-4 text-sm font-semibold text-white">Visits by hour</div>
                {renderBars(buildSeries(selectedGuest.visits_by_hour, 24), undefined, 12)}
              </Card>
            </div>

            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Recent connections</div>
                  <div className="mt-1 text-xs text-muted">Session history for this guest record.</div>
                </div>
                {selectedGuest.postcode ? (
                  <button type="button" className="text-xs font-semibold text-emerald-100" onClick={() => setShowPostcodeMap((prev) => !prev)}>
                    {showPostcodeMap ? 'Hide postcode map' : 'Show postcode map'}
                  </button>
                ) : null}
              </div>

              {showPostcodeMap && selectedGuest.postcode ? (
                <div className="mb-4 overflow-hidden rounded-3xl border border-white/8">
                  <iframe title={`Postcode ${selectedGuest.postcode} map`} src={buildPostcodeMapUrl(selectedGuest.postcode)} className="h-64 w-full" loading="lazy" />
                </div>
              ) : null}

              <Card>
                <div className="space-y-3 text-sm">
                  {recentConnections.map((connection) => (
                    <div key={connection.id} className="flex flex-col gap-2 border-b border-white/8 pb-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">{formatDateTime(connection.connected_at)}</p>
                        <span className="status-pill">{formatDeviceLabel(connection.device_type, connection.os_family)}</span>
                      </div>
                      <p className="text-xs text-muted">{connection.user_agent || 'Unknown user agent'}</p>
                    </div>
                  ))}
                  {!recentConnections.length ? <p className="text-sm text-muted">No recent connections.</p> : null}
                </div>
              </Card>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
