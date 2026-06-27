import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '../components/ui/Card';
import { ChartCard, HorizontalBars, Info } from '../components/admin/AdminComponents';
import { HeatStrip, StackedBarChart, TimelineChart } from '../components/admin/AdminCharts';
import { buildVenueInsightsSummary, getInsightsRange, loadVenueInsightsBundle, type DatePreset, type VenueInsightsSummary } from '../lib/venueInsights';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ToastProvider';
import { useTheme } from '../contexts/ThemeContext';

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
    () =>
      selectedPostcode
        ? (summary?.topPostcodes ?? []).filter((row) => row.postcode === selectedPostcode)
        : (summary?.topPostcodes ?? []),
    [selectedPostcode, summary?.topPostcodes]
  );

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Venue Intelligence</div>
          <h2 className="font-display text-4xl text-white">Insights</h2>
          <p className="max-w-2xl text-muted">One page for guest growth, repeat behaviour, consent quality, and postcode catchment with a manager-friendly date range switcher.</p>
        </div>
      </div>

      <Card className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Select label="Date range" value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)}>
          <option value="today">Today</option>
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="month">This month</option>
          <option value="custom">Custom range</option>
        </Select>
        <Input
          label="Custom start"
          type="date"
          value={customStart}
          onChange={(event) => setCustomStart(event.target.value)}
          disabled={preset !== 'custom'}
        />
        <Input
          label="Custom end"
          type="date"
          value={customEnd}
          onChange={(event) => setCustomEnd(event.target.value)}
          disabled={preset !== 'custom'}
        />
        <Card tone="muted" className="p-4">
          <Info label="Window" value={summary?.range.label ?? 'Loading'} />
        </Card>
        <Card tone="muted" className="p-4">
          <Info label="Status" value={loading ? 'Refreshing' : 'Live'} />
        </Card>
      </Card>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        <Card><Info label="Unique guests" value={loading || !summary ? '...' : String(summary.uniqueGuests)} /></Card>
        <Card><Info label="New guests" value={loading || !summary ? '...' : String(summary.newGuests)} /></Card>
        <Card><Info label="Returning guests" value={loading || !summary ? '...' : String(summary.returningGuests)} /></Card>
        <Card><Info label="Total visits" value={loading || !summary ? '...' : String(summary.totalVisits)} /></Card>
        <Card><Info label="Guests with email" value={loading || !summary ? '...' : String(summary.guestsWithEmail)} /></Card>
        <Card><Info label="Guests with mobile" value={loading || !summary ? '...' : String(summary.guestsWithMobile)} /></Card>
        <Card><Info label="Consent rate" value={loading || !summary ? '...' : `${summary.consentRate}%`} /></Card>
        <Card><Info label="Peak window" value={loading || !summary ? '...' : `${summary.peakDayOfWeek} / ${summary.peakHourOfDay}`} /></Card>
      </div>

      <div className="admin-grid xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Visits over time" subtitle="Wi-Fi visits for the selected window.">
          <TimelineChart points={summary?.visitSeries ?? []} />
        </ChartCard>
        <ChartCard title="Consent funnel" subtitle="Captured, opted in, and unsubscribed guests in this active set.">
          <HorizontalBars
            items={(summary?.consentFunnel ?? []).map((row) => ({
              label: row.label,
              value: row.value
            }))}
          />
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[1fr_1fr]">
        <ChartCard title="New vs returning over time" subtitle="Unique guests per day, split between first-timers and repeat visitors.">
          <StackedBarChart
            points={summary?.newReturningSeries ?? []}
            legends={['New', 'Returning']}
            colors={[
              'linear-gradient(180deg, rgba(110,240,193,0.95), rgba(38,186,127,0.95))',
              'linear-gradient(180deg, rgba(59,130,246,0.95), rgba(29,78,216,0.95))'
            ]}
          />
        </ChartCard>
        <ChartCard title="Peak visit times" subtitle="Hour-level pulse for when the venue gets busiest.">
          <HeatStrip items={summary?.hourSeries ?? []} />
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <ChartCard
          title="Top postcode catchment"
          subtitle="Click a postcode to isolate it on the map."
          action={selectedPostcode ? (
            <button type="button" className="text-xs font-semibold text-emerald-100" onClick={() => setSelectedPostcode(null)}>
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

        <ChartCard title="Guests by postcode map" subtitle={`Postcodes submitted in the guest portal, plotted on the ${theme === 'dark' ? 'dark' : 'light'} map style.`}>
          <div className="overflow-hidden rounded-[22px] border border-white/8">
            <div ref={mapContainerRef} className="h-[360px] w-full" />
          </div>
        </ChartCard>
      </div>

      <div className="admin-grid xl:grid-cols-[0.9fr_1.1fr]">
        <ChartCard title="Status breakdown" subtitle="Authorized sessions versus failures and other outcomes.">
          <HorizontalBars
            items={(summary?.statusBreakdown ?? []).map((row) => ({
              label: row.label,
              value: row.value
            }))}
          />
        </ChartCard>
        <ChartCard title="Generated readout" subtitle="Plain-English takeaways for the venue team.">
          <div className="space-y-3">
            {(summary?.insights ?? ['Loading insights...']).map((line) => (
              <div key={line} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
                {line}
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
