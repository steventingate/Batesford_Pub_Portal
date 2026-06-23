import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseISO } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import {
  ChartCard,
  DataTable,
  DonutChart,
  HorizontalBars,
  MiniBars,
  StatCard
} from '../components/admin/AdminComponents';
import { formatDateTime } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

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
    postcode?: string | null;
  } | null;
};

type PostcodeCount = {
  postcode: string;
  guests: number;
};

type PostcodeMapPoint = {
  postcode: string;
  lat: number;
  lon: number;
  guests: number;
};

type DailyPoint = {
  label: string;
  value: number;
  tooltip: string;
  dateKey: string;
  startISO: string;
  endISO: string;
  displayLabel: string;
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

function DashboardIcon({ path }: { path: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [recent, setRecent] = useState<ConnectionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueEmails, setUniqueEmails] = useState(0);
  const [returning, setReturning] = useState(0);
  const [segmentCounts, setSegmentCounts] = useState<{ local: number; visitor: number; unknown: number }>({
    local: 0,
    visitor: 0,
    unknown: 0
  });
  const [chartPoints, setChartPoints] = useState<DailyPoint[]>([]);
  const [busiestDay, setBusiestDay] = useState('');
  const [quietestDay, setQuietestDay] = useState('');
  const [selectedDay, setSelectedDay] = useState<DailyPoint | null>(null);
  const [postcodeCounts, setPostcodeCounts] = useState<PostcodeCount[]>([]);
  const [postcodeMapPoints, setPostcodeMapPoints] = useState<PostcodeMapPoint[]>([]);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [uploadingPostcodes, setUploadingPostcodes] = useState(false);
  const [dateRange, setDateRange] = useState('7d');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapLayerRef = useRef<L.LayerGroup | null>(null);
  const postcodeFileRef = useRef<HTMLInputElement | null>(null);

  const loadPostcodeData = useCallback(async () => {
    const { data: postcodeData, error: postcodeError } = await supabase
      .from('guest_postcode_counts')
      .select('postcode, guests')
      .order('guests', { ascending: false })
      .limit(8);

    if (postcodeError) {
      pushToast('Unable to load postcode stats.', 'error');
      setPostcodeCounts([]);
    } else {
      setPostcodeCounts((postcodeData as PostcodeCount[]) ?? []);
    }

    const { data: mapData } = await supabase
      .from('guest_postcode_centroid_counts')
      .select('postcode, lat, lon, guests')
      .order('guests', { ascending: false });

    setPostcodeMapPoints((mapData as PostcodeMapPoint[]) ?? []);
  }, [pushToast]);

  useEffect(() => {
    const load = async () => {
      const { count: totalCount } = await supabase.from('wifi_connections').select('id', { count: 'exact', head: true });
      setTotal(totalCount ?? 0);

      const { count: guestCount } = await supabase.from('guests').select('id', { count: 'exact', head: true });
      setUniqueEmails(guestCount ?? 0);

      const { count: returningCount } = await supabase
        .from('guest_profiles')
        .select('guest_id', { count: 'exact', head: true })
        .gte('visit_count', 2);
      setReturning(returningCount ?? 0);

      const { data: segmentData } = await supabase.from('guest_segment_counts').select('segment, total');
      if (segmentData) {
        const nextCounts = { local: 0, visitor: 0, unknown: 0 };
        segmentData.forEach((row) => {
          const key = row.segment as 'local' | 'visitor' | 'unknown';
          if (key in nextCounts) nextCounts[key] = row.total ?? 0;
        });
        setSegmentCounts(nextCounts);
      }

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

      const points = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - index));
        const key = formatDateKey(date);
        const bounds = getMelbourneDayBounds(date);
        const value = byDay[key] ?? 0;
        return {
          label: formatWeekdayLabel(date),
          value,
          tooltip: `${formatWeekdayLabel(date)} - ${value} connections`,
          dateKey: bounds.dateKey,
          startISO: bounds.startISO,
          endISO: bounds.endISO,
          displayLabel: `${formatWeekdayLabel(date)} (${formatShortDate(date)})`
        };
      });
      setChartPoints(points);

      const sorted = [...points].sort((a, b) => b.value - a.value);
      setBusiestDay(sorted[0] ? formatWeekdayName(parseISO(sorted[0].startISO)) : '');
      setQuietestDay([...points].sort((a, b) => a.value - b.value)[0] ? formatWeekdayName(parseISO([...points].sort((a, b) => a.value - b.value)[0].startISO)) : '');
    };

    load();
  }, []);

  useEffect(() => {
    loadPostcodeData();
  }, [loadPostcodeData]);

  useEffect(() => {
    const loadRecent = async () => {
      const baseSelect = 'id, connected_at, device_type, os_family, guests(id, full_name, email, mobile, postcode)';
      const filteredSelect = 'id, connected_at, device_type, os_family, guests!inner(id, full_name, email, mobile, postcode)';
      let query = supabase
        .from('wifi_connections')
        .select(selectedPostcode ? filteredSelect : baseSelect)
        .order('connected_at', { ascending: false });

      if (selectedDay) {
        query = query.gte('connected_at', selectedDay.startISO).lt('connected_at', selectedDay.endISO).limit(100);
      } else {
        query = query.limit(12);
      }

      if (selectedPostcode) query = query.eq('guests.postcode', selectedPostcode);

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
  }, [selectedDay, selectedPostcode]);

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

    const mapInstance = mapRef.current;
    mapContainerRef.current.classList.add('map-dark');

    if (mapLayerRef.current) {
      mapInstance.removeLayer(mapLayerRef.current);
    }

    if (!postcodeMapPoints.length) {
      mapInstance.setView([-38.08, 144.3], 10);
      return;
    }

    const group = postcodeMapPoints.length > 18
      ? (L as unknown as { markerClusterGroup: () => L.LayerGroup }).markerClusterGroup()
      : L.layerGroup();

    postcodeMapPoints.forEach((point) => {
      const size = Math.max(20, Math.min(54, 14 + Math.sqrt(point.guests) * 7));
      const marker = L.marker([point.lat, point.lon], {
        icon: L.divIcon({
          className: 'postcode-dot',
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:radial-gradient(circle at 30% 30%, rgba(110,240,193,0.95), rgba(28,163,109,0.4));border:1px solid rgba(185,255,228,0.45);box-shadow:0 0 0 8px rgba(28,163,109,0.08);"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      });
      marker.bindTooltip(`${point.postcode} - ${point.guests} guest${point.guests === 1 ? '' : 's'}`, { direction: 'top', offset: [0, -8] });
      group.addLayer(marker);
    });

    group.addTo(mapInstance);
    mapLayerRef.current = group;

    const bounds = (group as L.FeatureGroup).getBounds?.();
    if (bounds && bounds.isValid()) mapInstance.fitBounds(bounds.pad(0.28));
  }, [postcodeMapPoints]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const handleUploadCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPostcodes(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        pushToast('CSV file is empty.', 'error');
        return;
      }

      const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
      const lonIndex = ['lon', 'long', 'lng', 'longitude'].map((key) => headers.indexOf(key)).find((index) => index !== -1) ?? -1;
      const indices = {
        postcode: headers.indexOf('postcode'),
        suburb: headers.indexOf('suburb'),
        state: headers.indexOf('state'),
        lat: headers.indexOf('lat'),
        lon: lonIndex
      };

      if (indices.postcode === -1 || indices.lat === -1 || indices.lon === -1) {
        pushToast('CSV must include postcode, lat, and lon columns.', 'error');
        return;
      }

      const rows = lines.slice(1).map((line) => line.split(',').map((value) => value.trim())).filter((values) => values.length >= 3);
      const deduped = new Map<string, { postcode: string; suburb: string | null; state: string | null; lat: number; lon: number }>();

      rows.forEach((values) => {
        const postcode = String(values[indices.postcode] ?? '').trim();
        const lat = Number(values[indices.lat]);
        const lon = Number(values[indices.lon]);
        if (!postcode || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
        deduped.set(postcode, {
          postcode,
          suburb: indices.suburb >= 0 ? values[indices.suburb]?.trim() || null : null,
          state: indices.state >= 0 ? values[indices.state]?.trim() || null : null,
          lat,
          lon
        });
      });

      const payload = Array.from(deduped.values());
      if (!payload.length) {
        pushToast('No valid rows found in CSV.', 'error');
        return;
      }

      const { error } = await supabase.from('postcode_centroids').upsert(payload, { onConflict: 'postcode' });
      if (error) {
        pushToast(`Upload failed: ${error.message}`, 'error');
        return;
      }

      pushToast(`${payload.length} postcode centroids uploaded.`, 'success');
      loadPostcodeData();
    } finally {
      setUploadingPostcodes(false);
      if (postcodeFileRef.current) postcodeFileRef.current.value = '';
    }
  };

  const sparklineValues = useMemo(() => chartPoints.map((point) => point.value), [chartPoints]);
  const localVsVisitor = useMemo(
    () => [
      { label: 'Returning', value: returning, color: '#6ef0c1' },
      { label: 'New', value: Math.max(uniqueEmails - returning, 0), color: '#1ca36d' }
    ],
    [returning, uniqueEmails]
  );

  const stats = [
    { label: 'Total Connections', value: total, delta: '+12.4%', icon: <DashboardIcon path="M5 12h14M12 5l7 7-7 7" />, values: sparklineValues },
    { label: 'Unique Emails', value: uniqueEmails, delta: '+8.6%', icon: <DashboardIcon path="M4 7h16v10H4zm0 0 8 6 8-6" />, values: sparklineValues.slice().reverse() },
    { label: 'Returning Guests', value: returning, delta: '+5.1%', icon: <DashboardIcon path="M7 17 3 13l4-4m10-2 4 4-4 4M3 13h8m2-6h8" />, values: sparklineValues.map((value, index) => value + index) },
    { label: 'Local Guests', value: segmentCounts.local, delta: '+3.9%', icon: <DashboardIcon path="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />, values: sparklineValues.map((value) => Math.max(1, Math.round(value * 0.4))) }
  ];

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Overview</div>
          <h2 className="font-display text-4xl text-white">Good evening, Steven</h2>
          <p className="max-w-2xl text-muted">Here&apos;s what&apos;s happening with your guest Wi-Fi, local catchment, and repeat audience momentum.</p>
        </div>
        <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
          <Select label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </Select>
          <div className="flex items-end">
            <Button variant="outline" className="w-full">Export</Button>
          </div>
        </div>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="admin-grid xl:grid-cols-[1.4fr_0.9fr]">
        <ChartCard title="Connections Over Time" subtitle="Tap a day to filter recent guests.">
          <MiniBars
            items={chartPoints.map((point) => ({ label: point.label, value: point.value }))}
            activeLabel={selectedDay?.label ?? null}
            onSelect={(label) => {
              const point = chartPoints.find((entry) => entry.label === label);
              if (!point) return;
              setSelectedDay((prev) => (prev?.dateKey === point.dateKey ? null : point));
            }}
          />
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted">
            {busiestDay ? <span>Busiest day: <strong className="text-emerald-100">{busiestDay}</strong></span> : null}
            {quietestDay ? <span>Quietest day: <strong className="text-emerald-100">{quietestDay}</strong></span> : null}
          </div>
        </ChartCard>

        <ChartCard title="Top Postcodes" subtitle="Catchment hotspots from guest signups.">
          <HorizontalBars
            items={postcodeCounts.map((row) => ({ label: row.postcode, value: row.guests }))}
            activeLabel={selectedPostcode}
            onSelect={(label) => setSelectedPostcode((prev) => (prev === label ? null : label))}
          />
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_0.95fr_1.1fr]">
        <ChartCard title="Connections by Day" subtitle="Daily pulse across the last week.">
          <MiniBars items={chartPoints.map((point) => ({ label: point.label, value: point.value }))} />
        </ChartCard>

        <ChartCard title="Guest Breakdown" subtitle="Returning vs new guests.">
          <DonutChart items={localVsVisitor} />
        </ChartCard>

        <ChartCard
          title="Guests by Location"
          subtitle="Dark map view of captured postcodes."
          action={selectedPostcode ? <button type="button" className="text-xs font-semibold text-emerald-100" onClick={() => setSelectedPostcode(null)}>Clear postcode</button> : undefined}
        >
          {postcodeMapPoints.length ? (
            <div className="overflow-hidden rounded-[22px] border border-white/8">
              <div ref={mapContainerRef} className="h-[280px] w-full" />
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] p-5">
              <p className="text-sm text-white">Map data appears once postcode centroid CSV is uploaded.</p>
              <p className="mt-1 text-xs text-muted">Required columns: postcode, suburb, state, lat, lon.</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input ref={postcodeFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleUploadCsv} />
            <Button variant="outline" onClick={() => postcodeFileRef.current?.click()} disabled={uploadingPostcodes}>
              {uploadingPostcodes ? 'Uploading...' : 'Upload postcode CSV'}
            </Button>
            <span className="text-xs text-muted">Circle size reflects guest count per postcode.</span>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Recent Guests"
        subtitle="Most recent Wi-Fi connections with profile drill-through."
        action={<Link className="text-sm font-semibold text-emerald-100" to="/contacts">View contacts</Link>}
      >
        {(selectedDay || selectedPostcode) ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300/12 bg-emerald-300/[0.05] px-4 py-3 text-sm text-emerald-50">
            {selectedDay ? <span>Day: {selectedDay.displayLabel}</span> : null}
            {selectedPostcode ? <span>Postcode: {selectedPostcode}</span> : null}
            <button
              type="button"
              className="ml-auto text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100"
              onClick={() => {
                setSelectedDay(null);
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
              <th>Email</th>
              <th>Mobile</th>
              <th>Connected</th>
              <th>Device</th>
              <th>Visits</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => (
              <tr
                key={row.id}
                className={row.guests?.id ? 'cursor-pointer' : ''}
                onClick={() => row.guests?.id ? navigate(`/contacts/${row.guests.id}`) : undefined}
              >
                <td>
                  <div className="font-semibold text-white">{row.guests?.full_name || 'Guest'}</div>
                  <div className="mt-1 text-xs text-muted">{row.guests?.postcode || 'Postcode unavailable'}</div>
                </td>
                <td>{row.guests?.email || '-'}</td>
                <td>{row.guests?.mobile || '-'}</td>
                <td>{formatDateTime(row.connected_at)}</td>
                <td>{(row.device_type || 'unknown').toUpperCase()} / {(row.os_family || 'unknown').toUpperCase()}</td>
                <td>
                  <span className="status-pill">{row.connection_count > 1 ? `x${row.connection_count} connections` : '1 visit'}</span>
                </td>
                <td>{row.guests?.id ? <Link className="text-sm font-semibold text-emerald-100" to={`/contacts/${row.guests.id}`}>Open profile</Link> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!recent.length ? <p className="py-6 text-center text-sm text-muted">No connections match the selected filters.</p> : null}
      </ChartCard>
    </div>
  );
}
