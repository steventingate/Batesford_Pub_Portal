import { useEffect, useMemo, useState } from 'react';
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

export default function Analytics() {
  const [profiles, setProfiles] = useState<GuestProfile[]>([]);
  const [postcodes, setPostcodes] = useState<PostcodeCount[]>([]);
  const [totalConnections, setTotalConnections] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [{ data: profileData }, { data: postcodeData }, { count: connectionCount }] = await Promise.all([
        supabase.from('guest_segments').select('email, postcode, segment, visit_count, visits_by_weekday'),
        supabase.from('guest_postcode_counts').select('postcode, guests').order('guests', { ascending: false }).limit(6),
        supabase.from('wifi_connections').select('id', { count: 'exact', head: true })
      ]);
      setProfiles((profileData as GuestProfile[]) ?? []);
      setPostcodes((postcodeData as PostcodeCount[]) ?? []);
      setTotalConnections(connectionCount ?? 0);
    };
    load();
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

      <Card>
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">Top postcode catchment</h3>
          <p className="mt-1 text-sm text-muted">Current postcode performance from stored guest portal records.</p>
        </div>
        <HorizontalBars items={postcodes.map((row) => ({ label: row.postcode, value: row.guests }))} />
      </Card>
    </div>
  );
}
