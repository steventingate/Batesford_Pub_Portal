import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { formatDateTime } from '../lib/format';

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

export default function ContactDetail() {
  const { id } = useParams();
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [recentConnections, setRecentConnections] = useState<ConnectionRow[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('guest_profiles')
        .select('guest_id, email, full_name, mobile, visit_count, first_seen_at, last_seen_at, visits_by_weekday, visits_by_hour, last_device_type, last_os_family, last_user_agent')
        .eq('guest_id', id)
        .maybeSingle();

      setGuest((data as GuestProfile) ?? null);

      const { data: recent } = await supabase
        .from('wifi_connections')
        .select('id, connected_at, device_type, os_family, user_agent')
        .eq('guest_id', id)
        .order('connected_at', { ascending: false })
        .limit(10);

      setRecentConnections((recent as ConnectionRow[]) ?? []);
    };

    load();
  }, [id]);

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

  if (!guest) {
    return <p className="text-muted">Loading visitor profile...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Link to="/contacts" className="text-sm text-muted">Back to contacts</Link>
          <h2 className="text-3xl font-display text-brand">{guest.full_name || 'Guest'}</h2>
          <p className="text-muted">{guest.email || guest.mobile || 'No contact details'}</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-outline">Create campaign</Link>
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

      <Card>
        <h3 className="text-lg font-semibold mb-4">Recent connections</h3>
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
    </div>
  );
}

