import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseISO } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { ChartBars } from '../components/ChartBars';
import { formatDateTime } from '../lib/format';
import { useToast } from '../components/ToastProvider';

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
  const [chartPoints, setChartPoints] = useState<{ label: string; value: number; tooltip: string; isToday?: boolean; date: Date; dateKey: string; startISO: string; endISO: string; displayLabel: string }[]>([]);
  const [busiestDay, setBusiestDay] = useState<string>('');
  const [quietestDay, setQuietestDay] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<{ dateKey: string; startISO: string; endISO: string; label: string; displayLabel: string } | null>(null);
  const [postcodeCounts, setPostcodeCounts] = useState<PostcodeCount[]>([]);
  const [postcodeMapPoints, setPostcodeMapPoints] = useState<PostcodeMapPoint[]>([]);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [uploadingPostcodes, setUploadingPostcodes] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapLayerRef = useRef<L.LayerGroup | null>(null);
  const postcodeFileRef = useRef<HTMLInputElement | null>(null);

  const loadPostcodeData = useCallback(async () => {
    const { data: postcodeData, error: postcodeError } = await supabase
      .from('guest_postcode_counts')
      .select('postcode, guests')
      .order('guests', { ascending: false })
      .limit(10);
    if (postcodeError) {
      pushToast('Unable to load postcode stats.', 'error');
      setPostcodeCounts([]);
    } else {
      setPostcodeCounts((postcodeData as PostcodeCount[]) ?? []);
    }

    const { data: mapData, error: mapError } = await supabase
      .from('guest_postcode_centroid_counts')
      .select('postcode, lat, lon, guests')
      .order('guests', { ascending: false });
    if (mapError) {
      setPostcodeMapPoints([]);
    } else {
      setPostcodeMapPoints((mapData as PostcodeMapPoint[]) ?? []);
    }
  }, [pushToast]);

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

      const { data: segmentData } = await supabase
        .from('guest_segment_counts')
        .select('segment, total');
      if (segmentData) {
        const nextCounts = { local: 0, visitor: 0, unknown: 0 };
        segmentData.forEach((row) => {
          const key = row.segment as 'local' | 'visitor' | 'unknown';
          if (key in nextCounts) {
            nextCounts[key] = row.total ?? 0;
          }
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
        query = query.limit(20);
      }

      if (selectedPostcode) {
        query = query.eq('guests.postcode', selectedPostcode);
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
  }, [selectedDay, selectedPostcode]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        scrollWheelZoom: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapRef.current);
    }

    const mapInstance = mapRef.current;
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
      const size = Math.max(18, Math.min(46, 12 + Math.sqrt(point.guests) * 6));
      const marker = L.marker([point.lat, point.lon], {
        icon: L.divIcon({
          className: 'postcode-dot',
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:rgba(26,71,42,0.7);border:2px solid rgba(26,71,42,0.9);box-shadow:0 6px 14px rgba(26,71,42,0.25);"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      });
      marker.bindTooltip(`${point.postcode} — ${point.guests} guest${point.guests === 1 ? '' : 's'}`, {
        direction: 'top',
        offset: [0, -8]
      });
      group.addLayer(marker);
    });

    group.addTo(mapInstance);
    mapLayerRef.current = group;

    const bounds = (group as L.FeatureGroup).getBounds?.();
    if (bounds && bounds.isValid()) {
      mapInstance.fitBounds(bounds.pad(0.3));
    } else {
      mapInstance.setView([-38.08, 144.3], 10);
    }
  }, [postcodeMapPoints]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const handlePostcodeSelect = (postcode: string) => {
    setSelectedPostcode((prev) => (prev === postcode ? null : postcode));
  };

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
      const lonIndex = ['lon', 'long', 'lng', 'longitude']
        .map((key) => headers.indexOf(key))
        .find((index) => index !== -1) ?? -1;
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
      const rowsRead = rows.length;
      const deduped = new Map<string, { postcode: string; suburb: string | null; state: string | null; lat: number; lon: number }>();
      let validRows = 0;
      let duplicateRows = 0;

      rows.forEach((values) => {
        const postcode = String(values[indices.postcode] ?? '').trim();
        const lat = Number(values[indices.lat]);
        const lon = Number(values[indices.lon]);
        if (!postcode || !Number.isFinite(lat) || !Number.isFinite(lon)) {
          return;
        }
        validRows += 1;
        const suburbValue = indices.suburb >= 0 ? values[indices.suburb]?.trim() || null : null;
        const stateValue = indices.state >= 0 ? values[indices.state]?.trim() || null : null;
        const next = { postcode, suburb: suburbValue, state: stateValue, lat, lon };
        const existing = deduped.get(postcode);
        if (!existing) {
          deduped.set(postcode, next);
          return;
        }
        duplicateRows += 1;
        if (!existing.suburb && next.suburb) {
          deduped.set(postcode, next);
        }
      });

      const payload = Array.from(deduped.values());

      if (!payload.length) {
        pushToast('No valid rows found in CSV.', 'error');
        return;
      }

      const chunkSize = 1000;
      let upserted = 0;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('postcode_centroids')
          .upsert(chunk, { onConflict: 'postcode' });
        if (error) {
          pushToast(`Upload failed: ${error.message}`, 'error');
          return;
        }
        upserted += chunk.length;
      }

      pushToast(`${rowsRead} rows read, ${validRows} valid, ${duplicateRows} duplicates removed, ${upserted} inserted/updated.`, 'success');
      loadPostcodeData();
    } finally {
      setUploadingPostcodes(false);
      if (postcodeFileRef.current) {
        postcodeFileRef.current.value = '';
      }
    }
  };

  const tiles = useMemo(
    () => [
      { label: 'Total connections', value: total, to: '/contacts' },
      { label: 'Unique emails', value: uniqueEmails, to: '/contacts' },
      { label: 'Returning guests', value: returning, to: '/contacts?returning=1' }
    ],
    [total, uniqueEmails, returning]
  );

  const postcodeChartPoints = useMemo(
    () =>
      postcodeCounts.map((row) => ({
        label: row.postcode,
        value: row.guests,
        tooltip: `${row.postcode} · ${row.guests} guest${row.guests === 1 ? '' : 's'}`,
        dateKey: row.postcode,
        startISO: '',
        endISO: '',
        displayLabel: row.postcode
      })),
    [postcodeCounts]
  );

  const hasMapData = postcodeMapPoints.length > 0;

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-muted mb-2">Local guests</p>
          <p className="text-2xl font-semibold text-brand">{segmentCounts.local}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted mb-2">Visitor guests</p>
          <p className="text-2xl font-semibold text-brand">{segmentCounts.visitor}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted mb-2">Unknown</p>
          <p className="text-2xl font-semibold text-brand">{segmentCounts.unknown}</p>
        </Card>
      </div>

      <Card className="transition hover:translate-y-[-2px] hover:shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold">Where guests come from</h3>
            <p className="text-sm text-muted">Postcode catchment overview</p>
          </div>
          {selectedPostcode && (
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-wide text-brand underline"
              onClick={() => setSelectedPostcode(null)}
            >
              Clear postcode filter
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted">Top postcodes</p>
            <div className="space-y-2">
              {postcodeCounts.map((row) => (
                <button
                  key={row.postcode}
                  type="button"
                  onClick={() => handlePostcodeSelect(row.postcode)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                    selectedPostcode === row.postcode
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-slate-200 text-slate-700 hover:border-brand/40'
                  }`}
                >
                  <span className="font-semibold">{row.postcode}</span>
                  <span className="text-xs text-muted">{row.guests} guest{row.guests === 1 ? '' : 's'}</span>
                </button>
              ))}
              {!postcodeCounts.length && (
                <p className="text-sm text-muted">No postcodes captured yet.</p>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {hasMapData ? (
              <>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div ref={mapContainerRef} className="h-72 w-full" />
                </div>
                <p className="text-xs text-muted">Circle size reflects guest count per postcode.</p>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-brand">Map available once postcode centroids are uploaded</p>
                  <p className="text-xs text-muted">Upload postcode centroid dataset to enable map.</p>
                </div>
                {postcodeChartPoints.length > 0 && (
                  <ChartBars
                    points={postcodeChartPoints}
                    selectedKey={selectedPostcode}
                    onSelect={(point) => handlePostcodeSelect(point.dateKey)}
                  />
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <input
                    ref={postcodeFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleUploadCsv}
                  />
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand underline"
                    onClick={() => postcodeFileRef.current?.click()}
                    disabled={uploadingPostcodes}
                  >
                    {uploadingPostcodes ? 'Uploading...' : 'Upload CSV'}
                  </button>
                  <span>Columns: postcode, suburb, state, lat, lon</span>
                </div>
              </div>
            )}
          </div>
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
        {(selectedDay || selectedPostcode) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand mb-4">
            {selectedDay && <span>Filter: {selectedDay.displayLabel}</span>}
            {selectedPostcode && <span>Postcode: {selectedPostcode}</span>}
            <button
              type="button"
              className="ml-auto text-xs font-semibold uppercase tracking-wide text-brand underline"
              onClick={() => {
                setSelectedDay(null);
                setSelectedPostcode(null);
              }}
            >
              Clear filters
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
                  <tr
                    key={row.id}
                    className={row.guests?.id ? 'border-t border-slate-100 cursor-pointer hover:bg-slate-50' : 'border-t border-slate-100'}
                    role={row.guests?.id ? 'button' : undefined}
                    tabIndex={row.guests?.id ? 0 : undefined}
                    onClick={() => {
                      if (row.guests?.id) {
                        navigate(`/contacts/${row.guests.id}`);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!row.guests?.id) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/contacts/${row.guests.id}`);
                      }
                    }}
                  >
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

