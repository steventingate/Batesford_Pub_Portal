import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { formatDateTime, toCsv } from '../lib/format';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatDeviceLabel = (device: string | null, os: string | null) => {
  const deviceLabel = (device || 'unknown').toUpperCase();
  const osLabel = (os || 'unknown').toUpperCase();
  return `${deviceLabel} / ${osLabel}`;
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

export default function Contacts() {
  const [profiles, setProfiles] = useState<GuestProfile[]>([]);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [hasEmail, setHasEmail] = useState('all');
  const [returningOnly, setReturningOnly] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestProfile | null>(null);
  const [recentConnections, setRecentConnections] = useState<ConnectionRow[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('guest_profiles')
        .select('guest_id, email, full_name, mobile, visit_count, first_seen_at, last_seen_at, visits_by_weekday, visits_by_hour, last_device_type, last_os_family, last_user_agent')
        .order('last_seen_at', { ascending: false });

      setProfiles((data as GuestProfile[]) ?? []);
    };

    load();
  }, []);

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

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(dateRange));
    const searchLower = search.toLowerCase();

    return profiles.filter((guest) => {
      const matchesSearch =
        !searchLower ||
        [guest.full_name, guest.email, guest.mobile]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;

      if (dateRange !== 'all' && guest.last_seen_at) {
        const lastSeen = new Date(guest.last_seen_at);
        if (lastSeen < cutoff) return false;
      }

      if (hasEmail === 'yes' && !guest.email) return false;
      if (hasEmail === 'no' && guest.email) return false;

      const visitCount = Number(guest.visit_count ?? 0);
      if (returningOnly && visitCount < 2) return false;

      return true;
    });
  }, [profiles, search, dateRange, hasEmail, returningOnly]);

  const handleExport = () => {
    const rows = filtered.map((guest) => ({
      name: guest.full_name ?? '',
      email: guest.email ?? '',
      mobile: guest.mobile ?? '',
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

  const renderBars = (series: { key: string; count: number }[], labels?: string[], columns = 7) => {
    const maxValue = Math.max(...series.map((item) => item.count), 1);
    return (
      <div className={`grid gap-2 items-end`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
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

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Contacts</h2>
          <p className="text-muted">Visitor profiles and visit patterns.</p>
        </div>
        <Button variant="outline" onClick={handleExport}>Export CSV</Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, mobile" />
          <Select label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </Select>
          <Select label="Has email" value={hasEmail} onChange={(event) => setHasEmail(event.target.value)}>
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
          <label className="flex items-end gap-2 text-sm font-semibold text-muted">
            <input
              type="checkbox"
              checked={returningOnly}
              onChange={(event) => setReturningOnly(event.target.checked)}
              className="h-4 w-4"
            />
            Returning only
          </label>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">Guest</th>
                <th className="py-2">Email</th>
                <th className="py-2">Mobile</th>
                <th className="py-2">Visits</th>
                <th className="py-2">Last seen</th>
                <th className="py-2">Device</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => (
                <tr key={guest.guest_id} className="border-t border-slate-100 cursor-pointer" onClick={() => setSelectedGuest(guest)}>
                  <td className="py-3 font-semibold text-brand">{guest.full_name || 'Guest'}</td>
                  <td className="py-3">{guest.email || '-'}</td>
                  <td className="py-3">{guest.mobile || '-'}</td>
                  <td className="py-3">{Number(guest.visit_count ?? 0)}</td>
                  <td className="py-3">{guest.last_seen_at ? formatDateTime(guest.last_seen_at) : '-'}</td>
                  <td className="py-3 text-sm font-semibold text-brand">
                    {formatDeviceLabel(guest.last_device_type, guest.last_os_family)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="text-center text-sm text-muted py-8">No contacts match this filter.</p>}
        </div>
      </Card>

      {selectedGuest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setSelectedGuest(null)}>
          <Card className="max-w-4xl w-full" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-display text-brand">{selectedGuest.full_name || 'Guest'}</h3>
                <p className="text-sm text-muted">{selectedGuest.email || 'No email'} / {selectedGuest.mobile || 'No mobile'}</p>
              </div>
              <Button variant="outline" onClick={() => setSelectedGuest(null)}>Close</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <p className="text-sm text-muted">Visits</p>
                <p className="text-2xl font-semibold text-brand">{selectedGuest.visit_count}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">First seen</p>
                <p className="text-sm font-semibold">{selectedGuest.first_seen_at ? formatDateTime(selectedGuest.first_seen_at) : '-'}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Last seen</p>
                <p className="text-sm font-semibold">{selectedGuest.last_seen_at ? formatDateTime(selectedGuest.last_seen_at) : '-'}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Last device</p>
                <p className="text-sm font-semibold text-brand">
                  {formatDeviceLabel(selectedGuest.last_device_type, selectedGuest.last_os_family)}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-muted mb-2">Visits by weekday</h4>
                {renderBars(buildSeries(selectedGuest.visits_by_weekday, 7), weekdayLabels, 7)}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-muted mb-2">Visits by hour</h4>
                {renderBars(buildSeries(selectedGuest.visits_by_hour, 24), undefined, 12)}
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-semibold text-muted mb-2">Recent connections</h4>
              <div className="space-y-2 text-sm">
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
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}


