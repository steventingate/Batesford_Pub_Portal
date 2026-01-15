import { useEffect, useMemo, useState } from 'react';
import { parseISO } from 'date-fns';
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
  connection_count: number;
  guests: {
    id: string | null;
    full_name: string | null;
    email: string | null;
    mobile: string | null;
  } | null;
};

const melbourneTimeZone = 'Australia/Melbourne';

const formatDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: melbourneTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const formatWeekdayLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: melbourneTimeZone, weekday: 'short' }).format(date);

const formatWeekdayName = (date: Date) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: melbourneTimeZone, weekday: 'long' }).format(date);

const formatShortDate = (date: Date) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: melbourneTimeZone, day: '2-digit', month: 'short' }).format(date);

const getZonedParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: melbourneTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second'))
  };
};

const getMelbourneDayBounds = (date: Date) => {
  const { year, month, day } = getZonedParts(date);
  const targetLocalMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = new Date(targetLocalMs);

  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(guess);
    const localMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const diff = targetLocalMs - localMs;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }

  const start = guess;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    startISO: start.toISOString(),
    endISO: end.toISOString()
  };
};

export default function Dashboard() {
  const [recent, setRecent] = useState<ConnectionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueEmails, setUniqueEmails] = useState(0);
  const [returning, setReturning] = useState(0);
  const [chartPoints, setChartPoints] = useState<{ label: string; value: number; tooltip: string; isToday?: boolean; date: Date; dateKey: string; startISO: string; endISO: string; displayLabel: string }[]>([]);
  const [busiestDay, setBusiestDay] = useState<string>('');
  const [quietestDay, setQuietestDay] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<{ dateKey: string; startISO: string; endISO: string; label: string; displayLabel: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { count: totalCount } = await supabase
        .from('wifi_connections')
        .select('id', { count: 'exact', head: true });
      setTotal(totalCount ?? 0);

      const { count: guestCount } = await supabase
        .from('guests')
        .select('id', { count: 'exact', head: true });
      setUniqueEmails(guestCount ?? 0);

      const { count: returningCount } = await supabase
        .from('guest_profiles')
        .select('guest_id', { count: 'exact', head: true })
        .gte('visit_count', 2);
      setReturning(returningCount ?? 0);

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
      const { data: recentData } = await supabase
        .from('wifi_connections')
        .select('id, connected_at')
        .gte('connected_at', startDate.toISOString())
        .order('connected_at', { ascending: false });

      const submissions = recentData ?? [];
      const byDay: Record<string, number> = {};
      submissions.forEach((item) => {
        const key = formatDateKey(parseISO(item.connected_at));
        byDay[key] = (byDay[key] ?? 0) + 1;
      });

      const todayKey = formatDateKey(now);
      const points = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - index));
        const key = formatDateKey(date);
        const bounds = getMelbourneDayBounds(date);
        const value = byDay[key] ?? 0;
        return {
          label: formatWeekdayLabel(date),
          value,
          tooltip: `${formatWeekdayLabel(date)} · ${value} connections`,
          isToday: key === todayKey,
          date,
          dateKey: bounds.dateKey,
          startISO: bounds.startISO,
          endISO: bounds.endISO,
          displayLabel: `${formatWeekdayLabel(date)} (${formatShortDate(date)})`
        };
      });
      setChartPoints(points);

      const sorted = [...points].sort((a, b) => b.value - a.value);
      const busiest = sorted[0] ?? null;
      const quietest = [...points].sort((a, b) => a.value - b.value)[0] ?? null;
      setBusiestDay(busiest ? formatWeekdayName(busiest.date) : '');
      setQuietestDay(quietest ? formatWeekdayName(quietest.date) : '');

    };

    load();
  }, []);

  useEffect(() => {
    const loadRecent = async () => {
      let query = supabase
        .from('wifi_connections')
        .select('id, connected_at, device_type, os_family, guests(id, full_name, email, mobile)')
        .order('connected_at', { ascending: false });

      if (selectedDay) {
        query = query.gte('connected_at', selectedDay.startISO).lt('connected_at', selectedDay.endISO).limit(100);
      } else {
        query = query.limit(20);
      }

      const { data: latest } = await query;
      const mapped = (latest ?? []).map((row) => ({
        id: row.id,
        connected_at: row.connected_at,
        device_type: row.device_type ?? null,
        os_family: row.os_family ?? null,
        connection_count: 1,
        guests: Array.isArray(row.guests) ? row.guests[0] ?? null : row.guests ?? null
      }));

      const grouped: ConnectionRow[] = [];
      mapped.forEach((row) => {
        const last = grouped[grouped.length - 1];
        if (last?.guests?.id && row.guests?.id && last.guests.id === row.guests.id) {
          const lastTime = parseISO(last.connected_at).getTime();
          const currentTime = parseISO(row.connected_at).getTime();
          if (Math.abs(lastTime - currentTime) <= 2 * 60 * 1000) {
            last.connection_count += 1;
            return;
          }
        }
        grouped.push(row);
      });
      setRecent(grouped);
    };

    loadRecent();
  }, [selectedDay]);

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

      <Card className="transition hover:translate-y-[-2px] hover:shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Last 7 days</h3>
            <p className="text-sm text-muted">Connections per day</p>
          </div>
          <Link className="text-sm font-semibold text-brand" to="/contacts">View contacts</Link>
        </div>
        <ChartBars
          points={chartPoints}
          selectedKey={selectedDay?.dateKey ?? null}
          onSelect={(point) => {
            setSelectedDay((prev) => (prev?.dateKey === point.dateKey
              ? null
              : {
                  dateKey: point.dateKey,
                  startISO: point.startISO,
                  endISO: point.endISO,
                  label: point.label,
                  displayLabel: point.displayLabel
                }));
          }}
        />
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
          {busiestDay && <span>Busiest day: <strong className="text-brand">{busiestDay}</strong></span>}
          {quietestDay && <span>Quietest day: <strong className="text-brand">{quietestDay}</strong></span>}
        </div>
      </Card>

      <Card className="transition hover:translate-y-[-2px] hover:shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Recent connections</h3>
            <p className="text-sm text-muted">Each row represents a Wi-Fi connection</p>
          </div>
          <Link className="text-sm font-semibold text-brand" to="/contacts">View contacts</Link>
        </div>
        {selectedDay && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand mb-4">
            <span>Filter: {selectedDay.displayLabel}</span>
            <button
              type="button"
              className="ml-auto text-xs font-semibold uppercase tracking-wide text-brand underline"
              onClick={() => setSelectedDay(null)}
            >
              Clear filter
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">Guest</th>
                <th className="py-2">Email</th>
                <th className="py-2">Mobile</th>
                <th className="py-2">Connected</th>
                <th className="py-2">Device</th>
                <th className="py-2">Visits</th>
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
                    {row.connection_count > 1 ? (
                      <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
                        ×{row.connection_count} connections
                      </span>
                    ) : (
                      <span className="text-sm text-muted">1</span>
                    )}
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
          {!recent.length && selectedDay && (
            <p className="text-center text-sm text-muted py-6">No connections on {selectedDay.label}.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

