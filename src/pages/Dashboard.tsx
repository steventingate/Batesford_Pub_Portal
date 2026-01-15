import { useEffect, useMemo, useState } from 'react';
import { subDays, format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { ChartBars } from '../components/ChartBars';
import { formatDateTime } from '../lib/format';

type ConnectionRow = {
  id: string;
  connected_at: string;
  device_type: string | null;
  os_family: string | null;
  guests: {
    id: string | null;
    full_name: string | null;
    email: string | null;
    mobile: string | null;
  } | null;
};

export default function Dashboard() {
  const [recent, setRecent] = useState<ConnectionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueEmails, setUniqueEmails] = useState(0);
  const [returning, setReturning] = useState(0);
  const [chartLabels, setChartLabels] = useState<string[]>([]);
  const [chartValues, setChartValues] = useState<number[]>([]);

  useEffect(() => {
    const load = async () => {
      const { count } = await supabase
        .from('wifi_connections')
        .select('id', { count: 'exact', head: true });
      setTotal(count ?? 0);

      const sevenDaysAgo = subDays(new Date(), 6);
      const { data: recentData } = await supabase
        .from('wifi_connections')
        .select('id, connected_at')
        .gte('connected_at', sevenDaysAgo.toISOString())
        .order('connected_at', { ascending: false });

      const submissions = recentData ?? [];
      const byDay: Record<string, number> = {};
      const labels: string[] = [];

      for (let i = 6; i >= 0; i -= 1) {
        const day = subDays(new Date(), i);
        const key = format(day, 'yyyy-MM-dd');
        labels.push(format(day, 'EEE'));
        byDay[key] = 0;
      }

      submissions.forEach((item) => {
        const key = format(parseISO(item.connected_at), 'yyyy-MM-dd');
        if (byDay[key] !== undefined) {
          byDay[key] += 1;
        }
      });

      setChartLabels(labels);
      setChartValues(Object.values(byDay));

      const { count: guestCount } = await supabase
        .from('guests')
        .select('id', { count: 'exact', head: true });
      setUniqueEmails(guestCount ?? 0);

      const { count: returningCount } = await supabase
        .from('guest_profiles')
        .select('guest_id', { count: 'exact', head: true })
        .gte('visit_count', 2);
      setReturning(returningCount ?? 0);

      const { data: latest } = await supabase
        .from('wifi_connections')
        .select('id, connected_at, device_type, os_family, guests(id, full_name, email, mobile)')
        .order('connected_at', { ascending: false })
        .limit(20);

      const mapped = (latest ?? []).map((row) => ({
        id: row.id,
        connected_at: row.connected_at,
        device_type: row.device_type ?? null,
        os_family: row.os_family ?? null,
        guests: Array.isArray(row.guests) ? row.guests[0] ?? null : row.guests ?? null
      }));
      setRecent(mapped);
    };

    load();
  }, []);

  const tiles = useMemo(
    () => [
      { label: 'Total connections', value: total, to: '/contacts' },
      { label: 'Unique emails', value: uniqueEmails, to: '/contacts' },
      { label: 'Returning guests', value: returning, to: '/contacts?returning=1' }
    ],
    [total, uniqueEmails, returning]
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Dashboard</h2>
          <p className="text-muted">Live snapshot of guest Wi-Fi activity.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <Link key={tile.label} to={tile.to} className="block focus:outline-none focus:ring-2 focus:ring-brand/40 rounded-xl">
            <Card className="transition hover:translate-y-[-2px] hover:shadow-soft">
              <p className="text-sm text-muted mb-3">{tile.label}</p>
              <p className="text-3xl font-semibold text-brand">{tile.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Link to="/contacts" className="block focus:outline-none focus:ring-2 focus:ring-brand/40 rounded-xl">
        <Card className="transition hover:translate-y-[-2px] hover:shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Last 7 days</h3>
              <p className="text-sm text-muted">Connections per day</p>
            </div>
          </div>
          <ChartBars labels={chartLabels} values={chartValues} />
        </Card>
      </Link>

      <Link to="/contacts" className="block focus:outline-none focus:ring-2 focus:ring-brand/40 rounded-xl">
        <Card className="transition hover:translate-y-[-2px] hover:shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Recent connections</h3>
              <p className="text-sm text-muted">Latest 20 submissions</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2">Guest</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Mobile</th>
                  <th className="py-2">Connected</th>
                  <th className="py-2">Device</th>
                  <th className="py-2">Profile</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 font-semibold">{row.guests?.full_name || 'Guest'}</td>
                    <td className="py-2">{row.guests?.email || '-'}</td>
                    <td className="py-2">{row.guests?.mobile || '-'}</td>
                    <td className="py-2">{formatDateTime(row.connected_at)}</td>
                    <td className="py-2 text-sm">
                      {(row.device_type || 'unknown').toUpperCase()} / {(row.os_family || 'unknown').toUpperCase()}
                    </td>
                    <td className="py-2">
                      {row.guests?.id ? (
                        <Link className="text-sm font-semibold text-brand" to={`/contacts/${row.guests.id}`}>
                          Visitor profile
                        </Link>
                      ) : (
                        <span className="text-sm text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Link>
    </div>
  );
}

