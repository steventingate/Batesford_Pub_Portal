import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { SegmentCard } from '../components/admin/AdminComponents';
import { supabase } from '../lib/supabaseClient';

type GuestProfile = {
  guest_id: string;
  email: string | null;
  postcode: string | null;
  segment: string | null;
  visit_count: number | null;
  last_seen_at: string | null;
};

export default function Segments() {
  const [profiles, setProfiles] = useState<GuestProfile[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('guest_segments')
        .select('guest_id, email, postcode, segment, visit_count, last_seen_at')
        .order('last_seen_at', { ascending: false });
      setProfiles((data as GuestProfile[]) ?? []);
    };
    load();
  }, []);

  const counts = useMemo(() => {
    const byPostcode3216 = profiles.filter((profile) => profile.postcode === '3216').length;
    const withEmail = profiles.filter((profile) => Boolean(profile.email)).length;
    const missingEmail = profiles.filter((profile) => !profile.email).length;
    const returning = profiles.filter((profile) => Number(profile.visit_count ?? 0) >= 2).length;
    const highFrequency = profiles.filter((profile) => Number(profile.visit_count ?? 0) >= 4).length;
    const localGuests = profiles.filter((profile) => profile.segment === 'local').length;
    const newVisitors = profiles.filter((profile) => Number(profile.visit_count ?? 0) <= 1).length;

    return [
      { title: 'Local guests', count: localGuests, description: 'Guests classified as local via postcode settings.' },
      { title: 'Returning guests', count: returning, description: 'Profiles with repeat venue visits.' },
      { title: 'New visitors', count: newVisitors, description: 'Freshly captured guests with only one visit on record.' },
      { title: 'High frequency visitors', count: highFrequency, description: 'Guests with four or more visits, ideal for loyalty offers.' },
      { title: 'Postcode 3216', count: byPostcode3216, description: 'Catchment subset for Geelong-adjacent outreach.' },
      { title: 'Guests with email', count: withEmail, description: 'Campaign-ready contacts with an email address captured.' },
      { title: 'Guests missing email', count: missingEmail, description: 'Profiles that need an onsite capture prompt or staff follow-up.' }
    ];
  }, [profiles]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Audience Library</div>
          <h2 className="font-display text-4xl text-white">Segments</h2>
          <p className="max-w-2xl text-muted">Pre-built marketing audiences shaped from the existing guest capture data.</p>
        </div>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-3">
        {counts.map((segment) => (
          <SegmentCard
            key={segment.title}
            title={segment.title}
            count={segment.count}
            description={segment.description}
            action={
              <Link to="/campaigns">
                <Button className="w-full">Create campaign</Button>
              </Link>
            }
          />
        ))}
      </div>
    </div>
  );
}
