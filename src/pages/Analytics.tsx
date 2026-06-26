import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '../components/ui/Card';
import { HorizontalBars, Info } from '../components/admin/AdminComponents';
import { supabase } from '../lib/supabaseClient';

type GuestProfile = {
  email: string | null;
  postcode: string | null;
  segment: string | null;
  visit_count: number | null;
  visits_by_weekday: Record<string, number> | null;
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

export default function Analytics() {
  const [profiles, setProfiles] = useState<GuestProfile[]>([]);
  const [postcodes, setPostcodes] = useState<PostcodeCount[]>([]);
  const [postcodeMapPoints, setPostcodeMapPoints] = useState<PostcodeMapPoint[]>([]);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [totalConnections, setTotalConnections] = useState(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: profileData }, { data: postcodeData }, { data: mapData }, { count: connectionCount }] = await Promise.all([
        supabase.from('guest_segments').select('email, postcode, segment, visit_count, visits_by_weekday'),
        supabase.from('guest_postcode_counts').select('postcode, guests').order('guests', { ascending: false }).limit(6),
        supabase.from('guest_postcode_centroid_counts').select('postcode, lat, lon, guests').order('guests', { ascending: false }),
        supabase.from('wifi_connections').select('id', { count: 'exact', head: true })
      ]);
      setProfiles((profileData as GuestProfile[]) ?? []);
      setPostcodes((postcodeData as PostcodeCount[]) ?? []);
      setPostcodeMapPoints((mapData as PostcodeMapPoint[]) ?? []);
      setTotalConnections(connectionCount ?? 0);
    };
    load();
  }, []);

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
      mapInstance.setView([-38.149, 144.359], 10);
      return;
    }

    const group = L.layerGroup();

    postcodeMapPoints.forEach((point) => {
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
      marker.bindTooltip(`${point.postcode} · ${point.guests} guest${point.guests === 1 ? '' : 's'}`, { direction: 'top', offset: [0, -8] });
      group.addLayer(marker);
    });

    group.addTo(mapInstance);
    mapLayerRef.current = group;

    const bounds = (group as L.FeatureGroup).getBounds?.();
    if (bounds && bounds.isValid()) {
      mapInstance.fitBounds(bounds.pad(0.28));
    }
  }, [postcodeMapPoints, selectedPostcode]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const metrics = useMemo(() => {
    const uniqueGuests = profiles.length;
    const withEmail = profiles.filter((profile) => Boolean(profile.email)).length;
    const returning = profiles.filter((profile) => Number(profile.visit_count ?? 0) >= 2).length;
    const localGuests = profiles.filter((profile) => profile.segment === 'local').length;
    const emailCaptureRate = uniqueGuests ? Math.round((withEmail / uniqueGuests) * 100) : 0;
    const repeatRate = uniqueGuests ? Math.round((returning / uniqueGuests) * 100) : 0;
    const localRate = uniqueGuests ? Math.round((localGuests / uniqueGuests) * 100) : 0;
    const weekdayTotals = profiles.reduce<Record<string, number>>((acc, profile) => {
      Object.entries(profile.visits_by_weekday ?? {}).forEach(([day, count]) => {
        acc[day] = (acc[day] ?? 0) + Number(count ?? 0);
      });
      return acc;
    }, {});
    const peakDayIndex = Object.entries(weekdayTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
    const topPostcode = postcodes[0]?.postcode ?? '-';

    return {
      guestGrowth: uniqueGuests,
      emailCaptureRate,
      repeatRate,
      topPostcode,
      peakDayIndex,
      localRate,
      nonLocalRate: Math.max(100 - localRate, 0),
      totalConnections
    };
  }, [postcodes, profiles, totalConnections]);

  const visiblePostcodes = useMemo(
    () => (selectedPostcode ? postcodes.filter((row) => row.postcode === selectedPostcode) : postcodes),
    [postcodes, selectedPostcode]
  );

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Reporting</div>
          <h2 className="font-display text-4xl text-white">Analytics</h2>
          <p className="max-w-2xl text-muted">Venue-level reporting across guest growth, capture quality, repeat visitation, and postcode catchment.</p>
        </div>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-3">
        <Card><Info label="Guest Growth" value={`${metrics.guestGrowth} guest profiles`} /></Card>
        <Card><Info label="Email Capture Rate" value={`${metrics.emailCaptureRate}%`} /></Card>
        <Card><Info label="Repeat Visitor Rate" value={`${metrics.repeatRate}%`} /></Card>
        <Card><Info label="Top Postcode Catchment" value={metrics.topPostcode} /></Card>
        <Card><Info label="Peak Visit Day" value={metrics.peakDayIndex} /></Card>
        <Card><Info label="Local vs Non-local" value={`${metrics.localRate}% / ${metrics.nonLocalRate}%`} /></Card>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="mb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Top postcode catchment</h3>
                <p className="mt-1 text-sm text-muted">Current postcode performance from stored guest portal records.</p>
              </div>
              {selectedPostcode ? (
                <button type="button" className="text-xs font-semibold text-emerald-100" onClick={() => setSelectedPostcode(null)}>
                  Clear postcode
                </button>
              ) : null}
            </div>
          </div>
          <HorizontalBars
            items={visiblePostcodes.map((row) => ({ label: row.postcode, value: row.guests }))}
            activeLabel={selectedPostcode}
            onSelect={(label) => setSelectedPostcode((current) => (current === label ? null : label))}
          />
        </Card>

        <Card>
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-white">Guests by postcode map</h3>
            <p className="mt-1 text-sm text-muted">Map view of the postcode catchment built from stored guest postcodes.</p>
          </div>
          <div className="overflow-hidden rounded-[22px] border border-white/8">
            <div ref={mapContainerRef} className="h-[360px] w-full" />
          </div>
        </Card>
      </div>
    </div>
  );
}
