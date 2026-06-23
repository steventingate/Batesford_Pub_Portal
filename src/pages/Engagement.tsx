import { useEffect, useMemo, useState } from 'react';
import { CampaignCard } from '../components/admin/AdminComponents';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabaseClient';

type GuestProfile = {
  email: string | null;
  segment: string | null;
  visit_count: number | null;
};

export default function Engagement() {
  const [profiles, setProfiles] = useState<GuestProfile[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('guest_segments').select('email, segment, visit_count');
      setProfiles((data as GuestProfile[]) ?? []);
    };
    load();
  }, []);

  const audiences = useMemo(() => {
    const total = profiles.length;
    const allContacts = total;
    const localGuests = profiles.filter((profile) => profile.segment === 'local').length;
    const returningGuests = profiles.filter((profile) => Number(profile.visit_count ?? 0) >= 2).length;
    const guestsWithEmail = profiles.filter((profile) => Boolean(profile.email)).length;
    const postcodeBased = profiles.filter((profile) => profile.segment === 'visitor').length;

    return [
      { title: 'Win back locals', audience: 'Local guests', recipients: localGuests, openRate: '42%', lastSent: 'Not sent' },
      { title: 'Friday lunch promo', audience: 'Returning guests', recipients: returningGuests, openRate: '38%', lastSent: 'Not sent' },
      { title: 'Birthday / loyalty placeholder', audience: 'Guests with email', recipients: guestsWithEmail, openRate: '35%', lastSent: 'Not sent' },
      { title: 'All contacts', audience: 'All contacts', recipients: allContacts, openRate: '40%', lastSent: 'Not sent' },
      { title: 'Postcode based segment', audience: 'Visitor catchment', recipients: postcodeBased, openRate: '31%', lastSent: 'Not sent' }
    ];
  }, [profiles]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Campaign Planning</div>
          <h2 className="font-display text-4xl text-white">Engagement</h2>
          <p className="max-w-2xl text-muted">Audience previews and campaign concepts built from the current guest dataset.</p>
        </div>
        <Button>Create campaign</Button>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-3">
        {audiences.map((campaign) => (
          <CampaignCard key={campaign.title} {...campaign}>
            <Button variant="outline" className="w-full">Use audience</Button>
          </CampaignCard>
        ))}
      </div>
    </div>
  );
}
