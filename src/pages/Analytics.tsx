import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '../components/ui/Card';
import { ChartCard, HorizontalBars } from '../components/admin/AdminComponents';
import { HeatStrip, StackedBarChart, TimelineChart } from '../components/admin/AdminCharts';
import { buildVenueInsightsSummary, getInsightsRange, loadVenueInsightsBundle, type DatePreset, type VenueInsightsSummary } from '../lib/venueInsights';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ToastProvider';
import { useTheme } from '../contexts/ThemeContext';

function InsightStatCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="insight-stat-card">
      <div className="muted-kicker">{label}</div>
      <div className="insight-stat-value">{value}</div>
      <p className="insight-stat-helper">{helper}</p>
    </Card>
  );
}

export default function Analytics() {
  const { pushToast } = useToast();
  const { theme } = useTheme();
  const [preset, setPreset] = useState<DatePreset>('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [summary, setSummary] = useState<VenueInsightsSummary | null>(null);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapLayerRef = useRef<L.LayerGroup | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const range = getInsightsRange(preset, customStart, customEnd);
        const bundle = await loadVenueInsightsBundle(range);
        if (!cancelled) {
          setSummary(buildVenueInsightsSummary(bundle, range));
        }
      } catch (error) {
        if (!cancelled) {
          pushToast(`Unable to load insights: ${(error as Error).message}`, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [customEnd, customStart, preset, pushToast]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        scrollWheelZoom: false
      });
    }

    const mapInstance = mapRef.current;
    const postcodeMapPoints = summary?.topPostcodes ?? [];
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    if (baseLayerRef.current) {
      mapInstance.removeLayer(baseLayerRef.current);
    }

    baseLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    });
    baseLayerRef.current.addTo(mapInstance);

    mapContainerRef.current.classList.remove('map-dark', 'map-light');
    mapContainerRef.current.classList.add(theme === 'dark' ? 'map-dark' : 'map-light');

    if (mapLayerRef.current) {
      mapInstance.removeLayer(mapLayerRef.current);
    }

    if (!postcodeMapPoints.length) {
      mapInstance.setView([-38.149, 144.359], 10);
      return;
    }

    const group = L.layerGroup();
    postcodeMapPoints.forEach((point) => {
      if (typeof point.lat !== 'number' || typeof point.lon !== 'number') return;

      const active = selectedPostcode === point.postcode;
      const size = Math.max(18, Math.min(52, 16 + Math.sqrt(point.guests) * 7));
      const marker = L.marker([point.lat, point.lon], {
        icon: L.divIcon({
          className: 'postcode-dot',
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${active ? 'radial-gradient(circle at 30% 30%, rgba(110,240,193,1), rgba(39,174,96,0.9))' : 'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.95), rgba(56,189,248,0.38))'};border:1px solid ${active ? 'rgba(187,247,208,0.9)' : 'rgba(186,230,253,0.5)'};box-shadow:0 0 0 8px ${active ? 'rgba(34,197,94,0.12)' : 'rgba(56,189,248,0.08)'};"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      });

      marker.on('click', () => setSelectedPostcode((current) => (current === point.postcode ? null : point.postcode)));
      marker.bindTooltip(`${point.postcode} - ${point.guests} visit${point.guests === 1 ? '' : 's'}`, { direction: 'top', offset: [0, -8] });
      group.addLayer(marker);
    });

    group.addTo(mapInstance);
    mapLayerRef.current = group;

    const bounds = (group as L.FeatureGroup).getBounds?.();
    if (bounds && bounds.isValid()) {
      mapInstance.fitBounds(bounds.pad(0.28));
    }
  }, [selectedPostcode, summary?.topPostcodes, theme]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
    };
  }, []);

  const visiblePostcodes = useMemo(
    () => selectedPostcode ? (summary?.topPostcodes ?? []).filter((row) => row.postcode === selectedPostcode) : (summary?.topPostcodes ?? []),
    [selectedPostcode, summary?.topPostcodes]
  );

  const windowLabel = summary?.range.label ?? 'Loading';
  const statusBreakdownItems = (summary?.statusBreakdown ?? []).map((row) => ({ label: row.label, value: row.value }));
  const consentFunnelItems = (summary?.consentFunnel ?? []).map((row) => ({ label: row.label, value: row.value }));

  return (
    <div className="admin-page insights-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Venue Intelligence</div>
          <h2 className="font-display text-4xl">Insights</h2>
          <p>Professional venue reporting for guest growth, catchment strength, consent quality, and operational outcomes across the selected window.</p>
        </div>
      </div>

      <Card className="settings-section-card">
        <div className="settings-card-header">
          <div>
            <h3>Reporting Window</h3>
            <p>Switch between live windows or set a custom range for campaigns, event recaps, and venue performance reviews.</p>
          </div>
        </div>
        <div className="insights-filter-grid">
          <Select label="Date range" value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)}>
            <option value="today">Today</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </Select>
          <Input label="Custom start" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} disabled={preset !== 'custom'} />
          <Input label="Custom end" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} disabled={preset !== 'custom'} />
          <Card tone="muted" className="p-4">
            <div className="muted-kicker">Window</div>
            <div className="mt-3 text-lg font-semibold text-[var(--dashboard-text)]">{windowLabel}</div>
          </Card>
          <Card tone="muted" className="p-4">
            <div className="muted-kicker">Status</div>
            <div className="mt-3 text-lg font-semibold text-[var(--dashboard-text)]">{loading ? 'Refreshing' : 'Live'}</div>
          </Card>
        </div>
      </Card>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        <InsightStatCard label="Unique Guests" value={loading || !summary ? '...' : String(summary.uniqueGuests)} helper="Distinct guests active in the selected window." />
        <InsightStatCard label="New Guests" value={loading || !summary ? '...' : String(summary.newGuests)} helper="First-time visitors captured during this reporting period." />
        <InsightStatCard label="Returning Guests" value={loading || !summary ? '...' : String(summary.returningGuests)} helper="Guests who came back after a previous visit." />
        <InsightStatCard label="Total Visits" value={loading || !summary ? '...' : String(summary.totalVisits)} helper="All Wi-Fi sessions recorded in this range." />
        <InsightStatCard label="Guests With Email" value={loading || !summary ? '...' : String(summary.guestsWithEmail)} helper="Campaign-ready profiles with an email address." />
        <InsightStatCard label="Guests With Mobile" value={loading || !summary ? '...' : String(summary.guestsWithMobile)} helper="Profiles that can be reused for SMS or outbound contact." />
        <InsightStatCard label="Consent Rate" value={loading || !summary ? '...' : `${summary.consentRate}%`} helper="Share of active guests who are currently opted in." />
        <InsightStatCard label="Peak Window" value={loading || !summary ? '...' : `${summary.peakDayOfWeek} / ${summary.peakHourOfDay}`} helper="Busiest day and hour based on guest session activity." />
      </div>

      <div className="admin-grid xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Visits Over Time" subtitle="Wi-Fi visits for the selected window, suitable for weekly and event reporting.">
          <TimelineChart points={summary?.visitSeries ?? []} />
        </ChartCard>
        <ChartCard title="Consent Funnel" subtitle="Captured guests compared with opted-in and unsubscribed contacts.">
          <HorizontalBars items={consentFunnelItems} />
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[1fr_1fr]">
        <ChartCard title="New vs Returning Over Time" subtitle="Unique guests per day, split between first-timers and repeat visitors.">
          <StackedBarChart
            points={summary?.newReturningSeries ?? []}
            legends={['New', 'Returning']}
            colors={[
              'linear-gradient(180deg, rgba(110,240,193,0.95), rgba(38,186,127,0.95))',
              'linear-gradient(180deg, rgba(59,130,246,0.95), rgba(29,78,216,0.95))'
            ]}
          />
        </ChartCard>
        <ChartCard title="Peak Visit Times" subtitle="Hour-level pulse for when the venue gets busiest.">
          <HeatStrip items={summary?.hourSeries ?? []} />
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <ChartCard
          title="Top Postcode Catchment"
          subtitle="Click a postcode to isolate it on the map and assess where repeat visitation is coming from."
          action={selectedPostcode ? (
            <button type="button" className="dashboard-link-button" onClick={() => setSelectedPostcode(null)}>
              Clear postcode
            </button>
          ) : undefined}
        >
          <HorizontalBars
            items={visiblePostcodes.map((row) => ({ label: row.postcode, value: row.guests }))}
            activeLabel={selectedPostcode}
            onSelect={(label) => setSelectedPostcode((current) => (current === label ? null : label))}
          />
        </ChartCard>

        <ChartCard title="Guests by Postcode Map" subtitle={`Postcodes submitted in the guest portal, plotted on the ${theme === 'dark' ? 'dark' : 'light'} map style.`}>
          <div className="overflow-hidden rounded-[22px] border border-[color:var(--dashboard-card-border)]">
            <div ref={mapContainerRef} className="h-[360px] w-full" />
          </div>
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[0.9fr_1.1fr]">
        <ChartCard title="Status Breakdown" subtitle="Authorized sessions versus failures and other outcomes for the same reporting window.">
          <HorizontalBars items={statusBreakdownItems} />
        </ChartCard>
        <ChartCard title="Executive Readout" subtitle="Plain-English takeaways ready for operators, marketers, or weekly management updates.">
          <div className="insights-readout-list">
            {(summary?.insights ?? ['Loading insights...']).map((line, index) => (
              <div key={line} className="insights-readout-item">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{line}</p>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
