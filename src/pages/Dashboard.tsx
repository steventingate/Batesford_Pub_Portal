import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { DataTable, FilterPanel, Info } from '../components/admin/AdminComponents';
import { formatDateTime, toCsv } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

type PortalSessionRow = {
  id: string;
  session_key: string;
  site_slug: string;
  client_mac: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_postcode: string | null;
  submitted_at: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  updated_at: string;
  status: string;
};

type GuestSummary = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  visits: number;
  firstSeen: string | null;
  lastSeen: string | null;
  lastStatus: string;
  sessions: PortalSessionRow[];
};

const getGuestKey = (row: PortalSessionRow) => {
  const email = String(row.guest_email || '').trim().toLowerCase();
  const phone = String(row.guest_phone || '').trim();
  const mac = String(row.client_mac || '').trim().toLowerCase();
  return email || phone || mac || row.id;
};

const getAnchorTime = (row: PortalSessionRow) => row.submitted_at || row.authorized_at || row.completed_at || row.updated_at;

const getDisplayName = (row: PortalSessionRow) => {
  const name = String(row.guest_name || '').trim();
  if (name) return name;
  const email = String(row.guest_email || '').trim();
  if (email) return email;
  const phone = String(row.guest_phone || '').trim();
  if (phone) return phone;
  return 'Guest';
};

export default function Dashboard() {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<PortalSessionRow[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<GuestSummary | null>(null);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [postcodeFilter, setPostcodeFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('portal_sessions')
          .select('id, session_key, site_slug, client_mac, guest_name, guest_email, guest_phone, guest_postcode, submitted_at, authorized_at, completed_at, updated_at, status')
          .not('submitted_at', 'is', null)
          .order('submitted_at', { ascending: false });

        if (error) throw error;
        if (!cancelled) {
          setSessions((data as PortalSessionRow[]) ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          pushToast(`Unable to load guest visits: ${(error as Error).message}`, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  const guestSummaries = useMemo<GuestSummary[]>(() => {
    const grouped = new Map<string, PortalSessionRow[]>();

    sessions.forEach((row) => {
      const key = getGuestKey(row);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(key, [row]);
      }
    });

    return Array.from(grouped.entries()).map(([key, guestSessions]) => {
      const sortedSessions = [...guestSessions].sort((a, b) => Date.parse(getAnchorTime(b)) - Date.parse(getAnchorTime(a)));
      const latest = sortedSessions[0];
      const oldest = sortedSessions[sortedSessions.length - 1];

      return {
        key,
        name: getDisplayName(latest),
        email: latest.guest_email,
        phone: latest.guest_phone,
        postcode: latest.guest_postcode,
        visits: sortedSessions.length,
        firstSeen: oldest.submitted_at,
        lastSeen: latest.submitted_at,
        lastStatus: latest.authorized_at ? 'Authorized' : latest.status,
        sessions: sortedSessions
      };
    });
  }, [sessions]);

  const postcodeOptions = useMemo(
    () =>
      [...new Set(guestSummaries.map((guest) => guest.postcode).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b)),
    [guestSummaries]
  );

  const filteredGuests = useMemo(() => {
    const cutoff = new Date();
    if (dateRange !== 'all') {
      cutoff.setDate(cutoff.getDate() - Number(dateRange));
    }
    const searchLower = search.trim().toLowerCase();

    return guestSummaries.filter((guest) => {
      const matchesSearch =
        !searchLower ||
        [guest.name, guest.email, guest.phone, guest.postcode]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;

      if (postcodeFilter !== 'all' && guest.postcode !== postcodeFilter) return false;

      if (dateRange !== 'all' && guest.lastSeen) {
        const lastSeen = new Date(guest.lastSeen);
        if (lastSeen < cutoff) return false;
      }

      return true;
    });
  }, [dateRange, guestSummaries, postcodeFilter, search]);

  const totals = useMemo(() => ({
    guests: filteredGuests.length,
    visits: filteredGuests.reduce((sum, guest) => sum + guest.visits, 0),
    withEmail: filteredGuests.filter((guest) => Boolean(guest.email)).length
  }), [filteredGuests]);

  const handleExport = () => {
    const rows = filteredGuests.map((guest) => ({
      name: guest.name,
      email: guest.email ?? '',
      mobile: guest.phone ?? '',
      postcode: guest.postcode ?? '',
      visits: guest.visits,
      first_seen: guest.firstSeen ?? '',
      last_seen: guest.lastSeen ?? '',
      last_status: guest.lastStatus
    }));

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'batesford-guest-visits.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Guest Register</div>
          <h2 className="font-display text-4xl text-white">Who&apos;s been</h2>
          <p className="max-w-2xl text-muted">A simple guest list for managers: search who visited, narrow by date or postcode, then export the visible results to CSV.</p>
        </div>
        <Button variant="outline" onClick={handleExport}>Export CSV</Button>
      </div>

      <div className="admin-grid md:grid-cols-3">
        <Card><Info label="Visible Guests" value={loading ? '...' : String(totals.guests)} /></Card>
        <Card><Info label="Visible Visits" value={loading ? '...' : String(totals.visits)} /></Card>
        <Card><Info label="Guests With Email" value={loading ? '...' : String(totals.withEmail)} /></Card>
      </div>

      <FilterPanel>
        <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, mobile, postcode" />
        <Select label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
        <Select label="Postcode" value={postcodeFilter} onChange={(event) => setPostcodeFilter(event.target.value)}>
          <option value="all">All postcodes</option>
          {postcodeOptions.map((postcode) => (
            <option key={postcode} value={postcode}>{postcode}</option>
          ))}
        </Select>
        <div className="flex items-end md:col-span-2 xl:col-span-2">
          <Button variant="outline" className="w-full" onClick={handleExport}>Export visible rows</Button>
        </div>
      </FilterPanel>

      <Card>
        <DataTable>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Contact</th>
              <th>Postcode</th>
              <th>Visits</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredGuests.map((guest) => (
              <tr key={guest.key} className="cursor-pointer" onClick={() => setSelectedGuest(guest)}>
                <td>
                  <div className="font-semibold text-white">{guest.name}</div>
                </td>
                <td>{guest.email || guest.phone || '-'}</td>
                <td>{guest.postcode || '-'}</td>
                <td><span className="status-pill">{guest.visits} visit{guest.visits === 1 ? '' : 's'}</span></td>
                <td>{guest.firstSeen ? formatDateTime(guest.firstSeen) : '-'}</td>
                <td>{guest.lastSeen ? formatDateTime(guest.lastSeen) : '-'}</td>
                <td>{guest.lastStatus}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!filteredGuests.length ? <p className="py-8 text-center text-sm text-muted">No guest visits match this filter.</p> : null}
      </Card>

      {selectedGuest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedGuest(null)}>
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="muted-kicker">Guest Detail</div>
                <h3 className="mt-2 font-display text-3xl text-white">{selectedGuest.name}</h3>
                <p className="mt-2 text-sm text-muted">{selectedGuest.email || 'No email'} / {selectedGuest.phone || 'No mobile'}</p>
                <p className="mt-1 text-sm text-muted">{selectedGuest.postcode || 'Postcode not provided'}</p>
              </div>
              <Button variant="outline" onClick={() => setSelectedGuest(null)}>Close</Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <Card><Info label="Visits" value={String(selectedGuest.visits)} /></Card>
              <Card><Info label="First Seen" value={selectedGuest.firstSeen ? formatDateTime(selectedGuest.firstSeen) : '-'} /></Card>
              <Card><Info label="Last Seen" value={selectedGuest.lastSeen ? formatDateTime(selectedGuest.lastSeen) : '-'} /></Card>
              <Card><Info label="Latest Status" value={selectedGuest.lastStatus} /></Card>
            </div>

            <div className="mt-6">
              <div className="mb-4 text-sm font-semibold text-white">Visit history</div>
              <Card>
                <div className="space-y-3 text-sm">
                  {selectedGuest.sessions.map((session) => (
                    <div key={session.id} className="flex flex-col gap-2 border-b border-white/8 pb-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">{session.submitted_at ? formatDateTime(session.submitted_at) : '-'}</p>
                        <span className="status-pill">{session.authorized_at ? 'Authorized' : session.status}</span>
                      </div>
                      <p className="text-xs text-muted">
                        Site {session.site_slug || '-'} · MAC {session.client_mac || '-'} · Session {session.session_key}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
