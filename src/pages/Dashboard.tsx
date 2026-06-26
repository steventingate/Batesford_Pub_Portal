import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useToast } from '../components/ToastProvider';
import { ChartCard, DataTable } from '../components/admin/AdminComponents';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

type PortalSessionRow = {
  id: string;
  session_key: string;
  site_slug: string;
  client_mac: string;
  ap_mac: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_postcode: string | null;
  submitted_at: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  release_result: string | null;
  last_error: string | null;
};

type PostcodeCentroidRow = {
  postcode: string;
  suburb: string | null;
  state: string | null;
  lat: number;
  lon: number;
};

type LiveClient = {
  client_id: string;
  client_mac: string;
  name: string;
  hostname: string | null;
  ip_address: string | null;
  device_type: string;
  connected_at: string | null;
  duration_seconds: number | null;
  access_point: string | null;
  site_slug: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_postcode: string | null;
  postcode_suburb: string | null;
  postcode_state: string | null;
  submitted_at: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  session_status: string | null;
};

type DayPoint = {
  dayKey: string;
  label: string;
  submitted: number;
  authorized: number;
};

type HourPoint = {
  hour: number;
  label: string;
  submitted: number;
  authorized: number;
};

type PostcodePoint = {
  postcode: string;
  guests: number;
  suburb: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
};

type InspectableGuest = {
  source: 'live' | 'session';
  title: string;
  guestName: string | null;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  locationLabel: string;
  accessPoint: string | null;
  statusLabel: string;
  connectedAt: string | null;
  durationSeconds: number | null;
  clientMac: string | null;
  siteSlug: string | null;
  sessionKey: string | null;
  submittedAt: string | null;
  authorizedAt: string | null;
  completedAt: string | null;
  notes: string[];
};

const melbourneTimeZone = 'Australia/Melbourne';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: melbourneTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const weekdayFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: melbourneTimeZone,
  weekday: 'short'
});

const longDateFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: melbourneTimeZone,
  weekday: 'long',
  day: 'numeric',
  month: 'long'
});

const getDateKey = (value: Date | string) => dayFormatter.format(typeof value === 'string' ? new Date(value) : value);

const getTodayDateKey = () => getDateKey(new Date());

const formatHourLabel = (hour: number) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${suffix}`;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
};

const formatAverageDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return 'No data';
  return formatDuration(seconds);
};

const formatContact = (email: string | null, phone: string | null) => email || phone || 'No contact details';

const buildLocationLabel = (postcode: string | null, suburb?: string | null, state?: string | null) => {
  if (!postcode) return 'Location unavailable';
  const locality = [suburb, state].filter(Boolean).join(', ');
  return locality ? `${postcode} · ${locality}` : postcode;
};

const getSessionAnchor = (session: PortalSessionRow) => session.submitted_at || session.authorized_at || session.created_at;

const getHourInMelbourne = (value: string) =>
  Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: melbourneTimeZone,
      hour: 'numeric',
      hour12: false
    }).format(new Date(value))
  );

const getSessionDurationSeconds = (session: PortalSessionRow) => {
  if (!session.authorized_at) return null;
  const endAt = session.completed_at || session.updated_at;
  const startMs = Date.parse(session.authorized_at);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
};

function MetricCard({
  label,
  value,
  detail,
  tone = 'default'
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'positive';
}) {
  return (
    <Card className={`relative overflow-hidden ${tone === 'positive' ? 'border-emerald-300/20' : ''}`}>
      <div className="muted-kicker">{label}</div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="font-display text-4xl text-white">{value}</div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${tone === 'positive' ? 'bg-emerald-300/12 text-emerald-100' : 'bg-white/[0.04] text-slate-200'}`}>
          {detail}
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { session, profile } = useAuth();
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<PortalSessionRow[]>([]);
  const [liveClients, setLiveClients] = useState<LiveClient[]>([]);
  const [centroids, setCentroids] = useState<Record<string, PostcodeCentroidRow>>({});
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingLive, setLoadingLive] = useState(true);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [inspectedGuest, setInspectedGuest] = useState<InspectableGuest | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setLoadingDashboard(true);
      try {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const { data, error } = await supabase
          .from('portal_sessions')
          .select('id, session_key, site_slug, client_mac, ap_mac, guest_name, guest_email, guest_phone, guest_postcode, submitted_at, authorized_at, completed_at, created_at, updated_at, status, release_result, last_error')
          .gte('created_at', sevenDaysAgo.toISOString())
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const nextSessions = (data as PortalSessionRow[]) ?? [];
        setSessions(nextSessions);

        const postcodes = [...new Set(nextSessions.map((row) => row.guest_postcode).filter(Boolean) as string[])];
        if (!postcodes.length) {
          setCentroids({});
          return;
        }

        const { data: centroidData, error: centroidError } = await supabase
          .from('postcode_centroids')
          .select('postcode, suburb, state, lat, lon')
          .in('postcode', postcodes);

        if (centroidError) throw centroidError;
        if (cancelled) return;

        const lookup: Record<string, PostcodeCentroidRow> = {};
        ((centroidData as PostcodeCentroidRow[]) ?? []).forEach((row) => {
          lookup[row.postcode] = row;
        });
        setCentroids(lookup);
      } catch (error) {
        if (!cancelled) {
          pushToast(`Unable to load dashboard data: ${(error as Error).message}`, 'error');
        }
      } finally {
        if (!cancelled) setLoadingDashboard(false);
      }
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => {
    if (!session?.access_token) return undefined;
    let cancelled = false;

    const loadLiveClients = async () => {
      setLoadingLive(true);
      try {
        const response = await fetch('/api/admin/live-clients', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load live clients.');
        }

        if (!cancelled) {
          setLiveClients((payload.clients as LiveClient[]) ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          pushToast(`Live clients unavailable: ${(error as Error).message}`, 'error');
          setLiveClients([]);
        }
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    };

    void loadLiveClients();
    const interval = window.setInterval(() => {
      void loadLiveClients();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pushToast, session?.access_token]);

  const todayDateKey = getTodayDateKey();

  const sessionsToday = useMemo(
    () => sessions.filter((row) => getDateKey(row.created_at) === todayDateKey),
    [sessions, todayDateKey]
  );

  const postcodeCounts = useMemo<PostcodePoint[]>(() => {
    const counts = new Map<string, number>();
    sessionsToday.forEach((row) => {
      const postcode = String(row.guest_postcode || '').trim();
      if (!postcode) return;
      counts.set(postcode, (counts.get(postcode) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([postcode, guests]) => ({
        postcode,
        guests,
        suburb: centroids[postcode]?.suburb ?? null,
        state: centroids[postcode]?.state ?? null,
        lat: centroids[postcode]?.lat ?? null,
        lon: centroids[postcode]?.lon ?? null
      }))
      .sort((a, b) => b.guests - a.guests);
  }, [centroids, sessionsToday]);

  const dayPoints = useMemo<DayPoint[]>(() => {
    const points: DayPoint[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const dayKey = getDateKey(day);
      const daySessions = sessions.filter((row) => getDateKey(row.created_at) === dayKey);
      points.push({
        dayKey,
        label: weekdayFormatter.format(day),
        submitted: daySessions.filter((row) => Boolean(row.submitted_at)).length,
        authorized: daySessions.filter((row) => Boolean(row.authorized_at)).length
      });
    }
    return points;
  }, [sessions]);

  const hourPoints = useMemo<HourPoint[]>(() => {
    const counts = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHourLabel(hour),
      submitted: 0,
      authorized: 0
    }));

    sessionsToday.forEach((row) => {
      const hour = getHourInMelbourne(getSessionAnchor(row));
      if (Number.isInteger(hour) && counts[hour]) {
        counts[hour].submitted += row.submitted_at ? 1 : 0;
        counts[hour].authorized += row.authorized_at ? 1 : 0;
      }
    });

    return counts;
  }, [sessionsToday]);

  const filteredSessions = useMemo(() => {
    return sessionsToday.filter((row) => {
      const hour = getHourInMelbourne(getSessionAnchor(row));
      const matchesHour = selectedHour === null || hour === selectedHour;
      const matchesPostcode = !selectedPostcode || row.guest_postcode === selectedPostcode;
      return matchesHour && matchesPostcode && Boolean(row.submitted_at || row.authorized_at);
    });
  }, [selectedHour, selectedPostcode, sessionsToday]);

  const averageDurationToday = useMemo(() => {
    const durations = sessionsToday
      .map((row) => getSessionDurationSeconds(row))
      .filter((value): value is number => typeof value === 'number' && value > 0);

    if (!durations.length) return null;
    return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
  }, [sessionsToday]);

  const busiestHour = useMemo(() => {
    const sorted = [...hourPoints].sort((a, b) => b.submitted - a.submitted);
    return sorted[0]?.submitted ? sorted[0] : null;
  }, [hourPoints]);

  const authorizedToday = sessionsToday.filter((row) => Boolean(row.authorized_at)).length;
  const submittedToday = sessionsToday.filter((row) => Boolean(row.submitted_at)).length;
  const topCatchment = postcodeCounts[0];

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        scrollWheelZoom: false
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    mapContainerRef.current.classList.add('map-dark');

    if (mapLayerRef.current) {
      map.removeLayer(mapLayerRef.current);
    }

    const points = postcodeCounts.filter((point) => point.lat !== null && point.lon !== null);
    if (!points.length) {
      map.setView([-38.149, 144.359], 10);
      return;
    }

    const group = L.layerGroup();
    points.forEach((point) => {
      const active = selectedPostcode === point.postcode;
      const size = Math.max(18, Math.min(52, 16 + Math.sqrt(point.guests) * 7));
      const marker = L.marker([point.lat as number, point.lon as number], {
        icon: L.divIcon({
          className: 'postcode-dot',
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${active ? 'radial-gradient(circle at 30% 30%, rgba(110,240,193,1), rgba(39,174,96,0.9))' : 'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.95), rgba(56,189,248,0.38))'};border:1px solid ${active ? 'rgba(187,247,208,0.9)' : 'rgba(186,230,253,0.5)'};box-shadow:0 0 0 8px ${active ? 'rgba(34,197,94,0.12)' : 'rgba(56,189,248,0.08)'};"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      });
      marker.on('click', () => setSelectedPostcode((current) => (current === point.postcode ? null : point.postcode)));
      marker.bindTooltip(`${buildLocationLabel(point.postcode, point.suburb, point.state)} · ${point.guests} guests`, { direction: 'top', offset: [0, -8] });
      group.addLayer(marker);
    });

    group.addTo(map);
    mapLayerRef.current = group;

    const bounds = (group as L.FeatureGroup).getBounds?.();
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.28));
    }
  }, [postcodeCounts, selectedPostcode]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  const inspectedSessions = useMemo(() => {
    if (!inspectedGuest?.clientMac) return [];
    return sessions
      .filter((row) => row.client_mac === inspectedGuest.clientMac)
      .slice(0, 6);
  }, [inspectedGuest?.clientMac, sessions]);

  const inspectSession = (row: PortalSessionRow) => {
    const postcode = row.guest_postcode;
    const centroid = postcode ? centroids[postcode] : undefined;
    const liveMatch = liveClients.find((client) => client.client_mac === row.client_mac);
    const notes = [
      row.release_result ? `Release: ${row.release_result.replace(/_/g, ' ')}` : '',
      row.last_error ? `Last error: ${row.last_error}` : ''
    ].filter(Boolean);

    setInspectedGuest({
      source: 'session',
      title: row.guest_name || row.guest_email || 'Guest session',
      guestName: row.guest_name,
      email: row.guest_email,
      phone: row.guest_phone,
      postcode,
      locationLabel: buildLocationLabel(postcode, centroid?.suburb, centroid?.state),
      accessPoint: liveMatch?.access_point || row.ap_mac,
      statusLabel: row.authorized_at ? 'Authorized' : row.status,
      connectedAt: row.authorized_at || row.submitted_at || row.created_at,
      durationSeconds: liveMatch?.duration_seconds ?? getSessionDurationSeconds(row),
      clientMac: row.client_mac,
      siteSlug: row.site_slug,
      sessionKey: row.session_key,
      submittedAt: row.submitted_at,
      authorizedAt: row.authorized_at,
      completedAt: row.completed_at,
      notes
    });
  };

  const inspectLiveClient = (client: LiveClient) => {
    setInspectedGuest({
      source: 'live',
      title: client.guest_name || client.name || 'Connected guest',
      guestName: client.guest_name,
      email: client.guest_email,
      phone: client.guest_phone,
      postcode: client.guest_postcode,
      locationLabel: buildLocationLabel(client.guest_postcode, client.postcode_suburb, client.postcode_state),
      accessPoint: client.access_point,
      statusLabel: 'Connected now',
      connectedAt: client.connected_at || client.authorized_at || client.submitted_at,
      durationSeconds: client.duration_seconds,
      clientMac: client.client_mac,
      siteSlug: client.site_slug,
      sessionKey: null,
      submittedAt: client.submitted_at,
      authorizedAt: client.authorized_at,
      completedAt: client.completed_at,
      notes: client.hostname ? [`Hostname: ${client.hostname}`] : []
    });
  };

  const headerDate = longDateFormatter.format(new Date());

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Operations Console</div>
          <h2 className="font-display text-4xl text-white">Good evening, {profile?.full_name?.split(' ')[0] || 'Steven'}</h2>
          <p className="max-w-3xl text-muted">Live venue connectivity first, then today&apos;s guest submissions, session outcomes, and postcode catchment. This view is driven by the real portal session stream, not placeholder CRM totals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.08] px-4 py-3 text-right">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Today</div>
            <div className="mt-1 text-sm text-white">{headerDate}</div>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-right ${liveClients.length ? 'border-sky-300/15 bg-sky-300/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Network</div>
            <div className="mt-1 text-sm text-white">{loadingLive ? 'Refreshing live feed' : liveClients.length ? 'Connected now' : 'No live guests'}</div>
          </div>
          <Button variant="outline">Export</Button>
        </div>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Connected Now" value={loadingLive ? '...' : liveClients.length} detail={loadingLive ? 'Refreshing' : liveClients.length ? 'Live UniFi feed' : 'No active guests'} tone="positive" />
        <MetricCard label="Guests Today" value={loadingDashboard ? '...' : submittedToday} detail={authorizedToday ? `${authorizedToday} authorized` : 'Awaiting new sessions'} />
        <MetricCard label="Average Duration" value={loadingDashboard ? '...' : formatAverageDuration(averageDurationToday)} detail={averageDurationToday ? 'Authorized session span' : 'Needs more completed sessions'} />
        <MetricCard label="Top Catchment" value={topCatchment ? topCatchment.postcode : 'No data'} detail={topCatchment ? `${topCatchment.guests} guest${topCatchment.guests === 1 ? '' : 's'}` : 'Postcodes appear after submissions'} />
      </div>

      <div className="admin-grid xl:grid-cols-[1.35fr_1fr]">
        <ChartCard
          title="Today by Hour"
          subtitle={busiestHour ? `Peak submissions at ${busiestHour.label} with ${busiestHour.submitted} guest${busiestHour.submitted === 1 ? '' : 's'}.` : 'Hourly drill-down for today.'}
          action={selectedHour !== null ? <button type="button" className="text-xs font-semibold text-sky-200" onClick={() => setSelectedHour(null)}>Clear hour</button> : undefined}
        >
          <div className="grid grid-cols-6 gap-3 xl:grid-cols-12">
            {hourPoints.map((point) => {
              const maxSubmitted = Math.max(...hourPoints.map((entry) => entry.submitted), 1);
              const active = selectedHour === point.hour;
              return (
                <button
                  key={point.hour}
                  type="button"
                  className={`rounded-[20px] border p-3 text-left transition ${active ? 'border-sky-300/35 bg-sky-300/[0.08]' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'}`}
                  onClick={() => setSelectedHour((current) => (current === point.hour ? null : point.hour))}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">{point.label}</div>
                  <div className="mt-5 flex h-24 items-end">
                    <div
                      className={`w-full rounded-2xl ${active ? 'bg-gradient-to-t from-sky-500 to-emerald-300' : 'bg-gradient-to-t from-slate-500 to-sky-300'}`}
                      style={{ height: `${Math.max(10, (point.submitted / maxSubmitted) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                    <span>{point.submitted} submitted</span>
                    <span>{point.authorized} ok</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted">
            {selectedHour !== null ? <span>Filter: {formatHourLabel(selectedHour)}</span> : <span>Showing all submitted sessions today.</span>}
            {selectedPostcode ? <span>Postcode: {selectedPostcode}</span> : null}
          </div>
        </ChartCard>

        <ChartCard
          title="Catchment Map"
          subtitle="Today&apos;s postcodes, ranked and spatially grouped for quick drill-down."
          action={selectedPostcode ? <button type="button" className="text-xs font-semibold text-sky-200" onClick={() => setSelectedPostcode(null)}>Clear postcode</button> : undefined}
        >
          <div className="overflow-hidden rounded-[22px] border border-white/8">
            <div ref={mapContainerRef} className="h-[280px] w-full" />
          </div>
          <div className="mt-4 space-y-3">
            {postcodeCounts.slice(0, 6).map((point) => (
              <button
                key={point.postcode}
                type="button"
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedPostcode === point.postcode ? 'border-emerald-300/30 bg-emerald-300/[0.08]' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'}`}
                onClick={() => setSelectedPostcode((current) => (current === point.postcode ? null : point.postcode))}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">{point.postcode}</div>
                    <div className="mt-1 text-xs text-muted">{buildLocationLabel(point.postcode, point.suburb, point.state)}</div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-100">{point.guests}</div>
                </div>
              </button>
            ))}
            {!postcodeCounts.length ? <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-muted">Postcode pins will appear once guests submit the portal form today.</p> : null}
          </div>
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[1.1fr_1.2fr]">
        <ChartCard
          title="Connected Now"
          subtitle="Read-only live UniFi guest list, enriched with the latest submitted guest details."
          action={<span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{loadingLive ? 'Refreshing' : `${liveClients.length} live`}</span>}
        >
          <DataTable>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Location</th>
                <th>Connected</th>
                <th>Duration</th>
                <th>AP</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {liveClients.map((client) => (
                <tr key={client.client_id} className="cursor-pointer" onClick={() => inspectLiveClient(client)}>
                  <td>
                    <div className="font-semibold text-white">{client.guest_name || client.name}</div>
                    <div className="mt-1 text-xs text-muted">{formatContact(client.guest_email, client.guest_phone)}</div>
                  </td>
                  <td>{buildLocationLabel(client.guest_postcode, client.postcode_suburb, client.postcode_state)}</td>
                  <td>{client.connected_at ? formatDateTime(client.connected_at) : '-'}</td>
                  <td><span className="status-pill">{formatDuration(client.duration_seconds)}</span></td>
                  <td>{client.access_point || client.site_slug || '-'}</td>
                  <td><button type="button" className="text-sm font-semibold text-sky-200" onClick={(event) => { event.stopPropagation(); inspectLiveClient(client); }}>Inspect</button></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!liveClients.length && !loadingLive ? <p className="py-6 text-center text-sm text-muted">No live connected guests were returned from UniFi.</p> : null}
        </ChartCard>

        <ChartCard
          title="Today&apos;s Guest Sessions"
          subtitle="Submitted sessions for today with hour and postcode drill-down."
          action={<Link className="text-sm font-semibold text-sky-200" to="/traces">Open traces</Link>}
        >
          {(selectedHour !== null || selectedPostcode) ? (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-300/12 bg-sky-300/[0.05] px-4 py-3 text-sm text-slate-100">
              {selectedHour !== null ? <span>Hour: {formatHourLabel(selectedHour)}</span> : null}
              {selectedPostcode ? <span>Postcode: {selectedPostcode}</span> : null}
              <button
                type="button"
                className="ml-auto text-xs font-semibold uppercase tracking-[0.16em] text-sky-200"
                onClick={() => {
                  setSelectedHour(null);
                  setSelectedPostcode(null);
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}

          <DataTable>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Submitted</th>
                <th>Authorized</th>
                <th>Duration</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((row) => {
                const centroid = row.guest_postcode ? centroids[row.guest_postcode] : undefined;
                return (
                  <tr key={row.id} className="cursor-pointer" onClick={() => inspectSession(row)}>
                    <td>
                      <div className="font-semibold text-white">{row.guest_name || row.guest_email || 'Guest'}</div>
                      <div className="mt-1 text-xs text-muted">{formatContact(row.guest_email, row.guest_phone)}</div>
                    </td>
                    <td>{row.submitted_at ? formatDateTime(row.submitted_at) : '-'}</td>
                    <td>{row.authorized_at ? formatDateTime(row.authorized_at) : 'Pending'}</td>
                    <td><span className="status-pill">{formatDuration(getSessionDurationSeconds(row))}</span></td>
                    <td>{buildLocationLabel(row.guest_postcode, centroid?.suburb, centroid?.state)}</td>
                    <td>{row.authorized_at ? 'Authorized' : row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {!filteredSessions.length ? <p className="py-6 text-center text-sm text-muted">No submitted sessions match the current drill-down.</p> : null}
        </ChartCard>
      </div>

      <ChartCard
        title="Last 7 Days"
        subtitle="Submitted versus authorized sessions by day, so the team can separate traffic from successful network entry."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {dayPoints.map((point) => {
            const maxCount = Math.max(...dayPoints.map((entry) => Math.max(entry.submitted, entry.authorized)), 1);
            return (
              <div key={point.dayKey} className="rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">{point.label}</div>
                <div className="mt-4 flex h-24 items-end gap-2">
                  <div className="flex-1 rounded-t-2xl bg-gradient-to-t from-sky-500 to-sky-300" style={{ height: `${Math.max(8, (point.submitted / maxCount) * 100)}%` }} />
                  <div className="flex-1 rounded-t-2xl bg-gradient-to-t from-emerald-500 to-emerald-300" style={{ height: `${Math.max(8, (point.authorized / maxCount) * 100)}%` }} />
                </div>
                <div className="mt-4 space-y-1 text-xs text-muted">
                  <div>Submitted: <span className="text-white">{point.submitted}</span></div>
                  <div>Authorized: <span className="text-white">{point.authorized}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>

      {inspectedGuest ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" onClick={() => setInspectedGuest(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0b1326] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="muted-kicker">Guest Detail</div>
                <h3 className="mt-2 font-display text-3xl text-white">{inspectedGuest.title}</h3>
                <p className="mt-2 text-sm text-muted">{inspectedGuest.locationLabel}</p>
              </div>
              <Button variant="ghost" onClick={() => setInspectedGuest(null)}>Close</Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Card><div className="muted-kicker">Status</div><div className="mt-3 text-xl font-semibold text-white">{inspectedGuest.statusLabel}</div></Card>
              <Card><div className="muted-kicker">Duration</div><div className="mt-3 text-xl font-semibold text-white">{formatDuration(inspectedGuest.durationSeconds)}</div></Card>
              <Card><div className="muted-kicker">Contact</div><div className="mt-3 text-sm text-white">{formatContact(inspectedGuest.email, inspectedGuest.phone)}</div></Card>
              <Card><div className="muted-kicker">Network</div><div className="mt-3 text-sm text-white">{inspectedGuest.accessPoint || inspectedGuest.siteSlug || 'Unknown access point'}</div></Card>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Card>
                <div className="muted-kicker">Session Timing</div>
                <div className="mt-4 space-y-3 text-sm text-white">
                  <div>Submitted: <span className="text-muted">{inspectedGuest.submittedAt ? formatDateTime(inspectedGuest.submittedAt) : '-'}</span></div>
                  <div>Authorized: <span className="text-muted">{inspectedGuest.authorizedAt ? formatDateTime(inspectedGuest.authorizedAt) : '-'}</span></div>
                  <div>Completed: <span className="text-muted">{inspectedGuest.completedAt ? formatDateTime(inspectedGuest.completedAt) : '-'}</span></div>
                  <div>Connected: <span className="text-muted">{inspectedGuest.connectedAt ? formatDateTime(inspectedGuest.connectedAt) : '-'}</span></div>
                </div>
              </Card>

              <Card>
                <div className="muted-kicker">Identifiers</div>
                <div className="mt-4 space-y-3 text-sm text-white">
                  <div>Client MAC: <span className="text-muted">{inspectedGuest.clientMac || '-'}</span></div>
                  <div>Postcode: <span className="text-muted">{inspectedGuest.postcode || '-'}</span></div>
                  <div>Site: <span className="text-muted">{inspectedGuest.siteSlug || '-'}</span></div>
                  <div>Session key: <span className="text-muted">{inspectedGuest.sessionKey || '-'}</span></div>
                </div>
              </Card>
            </div>

            <Card className="mt-6">
              <div className="muted-kicker">Recent Sessions For This Device</div>
              <div className="mt-4 space-y-3 text-sm">
                {inspectedSessions.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-white">{row.guest_name || row.guest_email || 'Guest session'}</div>
                      <div className="text-xs text-muted">{row.authorized_at ? 'Authorized' : row.status}</div>
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      Submitted {row.submitted_at ? formatDateTime(row.submitted_at) : '-'} · Duration {formatDuration(getSessionDurationSeconds(row))}
                    </div>
                  </div>
                ))}
                {!inspectedSessions.length ? <p className="text-sm text-muted">No recent session history for this device in the last seven days.</p> : null}
              </div>
            </Card>

            {inspectedGuest.notes.length ? (
              <Card className="mt-6">
                <div className="muted-kicker">Notes</div>
                <div className="mt-4 space-y-2 text-sm text-muted">
                  {inspectedGuest.notes.map((note) => <div key={note}>{note}</div>)}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
