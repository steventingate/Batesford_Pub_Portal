import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { SegmentCard, DataTable } from '../components/admin/AdminComponents';
import { supabase } from '../lib/supabaseClient';
import { formatDateTime, toCsv } from '../lib/format';

type GuestRow = {
  guest_id: string;
  email: string | null;
  full_name: string | null;
  mobile: string | null;
  postcode: string | null;
  segment: string | null;
  visit_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  visits_by_weekday: Record<string, number> | null;
  visits_by_hour: Record<string, number> | null;
  marketing_consent: boolean | null;
  unsubscribe_status: boolean | null;
  tags: string[] | null;
};

type SegmentDefinition = {
  id: string;
  title: string;
  description: string;
  matches: (guest: GuestRow) => boolean;
};

const getGuestKey = (guest: GuestRow) =>
  String(guest.email || guest.mobile || guest.guest_id).trim().toLowerCase();

const getDaysSince = (value: string | null) => {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
};

const hasVisitWindow = (guest: GuestRow, hours: number[]) =>
  hours.some((hour) => Number(guest.visits_by_hour?.[String(hour)] ?? 0) > 0);

const hasWeekendVisits = (guest: GuestRow) =>
  Number(guest.visits_by_weekday?.['0'] ?? 0) > 0 || Number(guest.visits_by_weekday?.['6'] ?? 0) > 0;

export default function Segments() {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [failedAuthKeys, setFailedAuthKeys] = useState<Set<string>>(new Set());
  const [activeSegmentId, setActiveSegmentId] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      const [{ data: guestData }, { data: failedData }] = await Promise.all([
        supabase
          .from('guest_summary_view')
          .select('guest_id, email, full_name, mobile, postcode, segment, visit_count, first_seen_at, last_seen_at, visits_by_weekday, visits_by_hour, marketing_consent, unsubscribe_status, tags')
          .order('last_seen_at', { ascending: false }),
        supabase
          .from('portal_sessions')
          .select('guest_email, guest_phone')
          .not('submitted_at', 'is', null)
          .is('authorized_at', null)
      ]);

      const failures = new Set(
        ((failedData ?? []) as Array<{ guest_email: string | null; guest_phone: string | null }>)
          .map((row) => String(row.guest_email || row.guest_phone || '').trim().toLowerCase())
          .filter(Boolean)
      );

      setGuests((guestData as GuestRow[]) ?? []);
      setFailedAuthKeys(failures);
    };

    void load();
  }, []);

  const definitions = useMemo<SegmentDefinition[]>(() => [
    {
      id: 'all',
      title: 'All Guests',
      description: 'Everyone captured through the guest Wi-Fi portal.',
      matches: () => true
    },
    {
      id: 'locals',
      title: 'Locals',
      description: 'Guests classified as local from your configured postcodes.',
      matches: (guest) => guest.segment === 'local'
    },
    {
      id: 'new',
      title: 'New Guests',
      description: 'Guests with their first recorded visit only.',
      matches: (guest) => Number(guest.visit_count ?? 0) <= 1
    },
    {
      id: 'returning',
      title: 'Returning Guests',
      description: 'Guests who have visited more than once.',
      matches: (guest) => Number(guest.visit_count ?? 0) >= 2
    },
    {
      id: 'regulars',
      title: 'Regulars',
      description: 'Guests with 3+ visits and recent activity in the last 30 days.',
      matches: (guest) => Number(guest.visit_count ?? 0) >= 3 && getDaysSince(guest.last_seen_at) <= 30
    },
    {
      id: 'lapsed30',
      title: 'Lapsed 30 Days',
      description: 'Guests not seen in at least 30 days.',
      matches: (guest) => getDaysSince(guest.last_seen_at) >= 30
    },
    {
      id: 'lapsed60',
      title: 'Lapsed 60 Days',
      description: 'Guests not seen in at least 60 days.',
      matches: (guest) => getDaysSince(guest.last_seen_at) >= 60
    },
    {
      id: 'lapsed90',
      title: 'Lapsed 90 Days',
      description: 'Guests not seen in at least 90 days.',
      matches: (guest) => getDaysSince(guest.last_seen_at) >= 90
    },
    {
      id: 'has-email',
      title: 'Has Email',
      description: 'Guest profiles ready for email outreach.',
      matches: (guest) => Boolean(guest.email)
    },
    {
      id: 'has-mobile',
      title: 'Has Mobile',
      description: 'Guest profiles with a captured mobile number.',
      matches: (guest) => Boolean(guest.mobile)
    },
    {
      id: 'consented',
      title: 'Consented to Marketing',
      description: 'Guests with recorded marketing consent.',
      matches: (guest) => guest.marketing_consent === true && guest.unsubscribe_status !== true
    },
    {
      id: 'unsubscribed',
      title: 'Unsubscribed',
      description: 'Guests who should be excluded from marketing sends.',
      matches: (guest) => guest.unsubscribe_status === true
    },
    {
      id: 'failed-auth',
      title: 'Failed Authorization',
      description: 'Guests with portal submissions that did not end in authorization.',
      matches: (guest) => failedAuthKeys.has(getGuestKey(guest))
    },
    {
      id: 'weekend',
      title: 'Weekend Visitors',
      description: 'Guests with Saturday or Sunday visit behaviour.',
      matches: hasWeekendVisits
    },
    {
      id: 'lunch',
      title: 'Lunch Crowd',
      description: 'Guests active around lunchtime hours.',
      matches: (guest) => hasVisitWindow(guest, [11, 12, 13, 14])
    },
    {
      id: 'dinner',
      title: 'Dinner Crowd',
      description: 'Guests active around dinner hours.',
      matches: (guest) => hasVisitWindow(guest, [17, 18, 19, 20, 21])
    },
    {
      id: 'event',
      title: 'Event Visitors',
      description: 'Guests tagged for events, music, trivia, or venue activations.',
      matches: (guest) => (guest.tags ?? []).some((tag) => /event|trivia|music/i.test(tag))
    }
  ], [failedAuthKeys]);

  const counts = useMemo(
    () =>
      definitions.map((definition) => ({
        ...definition,
        count: guests.filter(definition.matches).length
      })),
    [definitions, guests]
  );

  const activeDefinition = counts.find((item) => item.id === activeSegmentId) ?? counts[0];

  const visibleGuests = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return guests
      .filter(activeDefinition.matches)
      .filter((guest) => {
        if (statusFilter === 'consented' && guest.marketing_consent !== true) return false;
        if (statusFilter === 'unsubscribed' && guest.unsubscribe_status !== true) return false;
        if (statusFilter === 'failed-auth' && !failedAuthKeys.has(getGuestKey(guest))) return false;

        if (!searchLower) return true;
        return [guest.full_name, guest.email, guest.mobile, guest.postcode]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchLower));
      });
  }, [activeDefinition, failedAuthKeys, guests, search, statusFilter]);

  const exportCsv = () => {
    const csv = toCsv(
      visibleGuests.map((guest) => ({
        name: guest.full_name ?? '',
        email: guest.email ?? '',
        mobile: guest.mobile ?? '',
        postcode: guest.postcode ?? '',
        visits: Number(guest.visit_count ?? 0),
        first_seen: guest.first_seen_at ?? '',
        last_seen: guest.last_seen_at ?? '',
        consent: guest.marketing_consent ? 'Yes' : 'No',
        unsubscribed: guest.unsubscribe_status ? 'Yes' : 'No',
        status: failedAuthKeys.has(getGuestKey(guest)) ? 'Failed authorization' : 'Authorized / known'
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `batesford-segment-${activeDefinition.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Audience Library</div>
          <h2 className="font-display text-4xl text-white">Segments</h2>
          <p className="max-w-2xl text-muted">System segments are now actionable. Choose a segment, inspect matching guests, then export or build a campaign from that exact audience.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportCsv}>Export segment CSV</Button>
          <Link to="/campaigns" className="btn btn-primary">Create campaign</Link>
        </div>
      </div>

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        {counts.map((segment) => (
          <button key={segment.id} type="button" className="text-left" onClick={() => setActiveSegmentId(segment.id)}>
            <SegmentCard
              title={segment.title}
              count={segment.count}
              description={segment.description}
              action={
                <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold ${activeSegmentId === segment.id ? 'bg-emerald-400 text-[#07110f]' : 'bg-white/5 text-muted'}`}>
                  {activeSegmentId === segment.id ? 'Selected' : 'View guests'}
                </span>
              }
            />
          </button>
        ))}
      </div>

      <Card className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Card tone="muted" className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Active segment</div>
          <div className="mt-2 text-lg font-semibold text-white">{activeDefinition.title}</div>
          <div className="mt-2 text-sm text-muted">{activeDefinition.description}</div>
        </Card>
        <Card tone="muted" className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Matching guests</div>
          <div className="mt-2 text-3xl font-display text-white">{visibleGuests.length}</div>
        </Card>
        <Input
          label="Search guests"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, email, mobile, postcode"
        />
        <Select label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="consented">Consented only</option>
          <option value="unsubscribed">Unsubscribed only</option>
          <option value="failed-auth">Failed auth only</option>
        </Select>
        <Card tone="muted" className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Custom builder</div>
          <div className="mt-2 text-sm text-muted">System segments are live now. A saved custom segment builder is the next pass.</div>
        </Card>
      </Card>

      <Card>
        <DataTable>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Postcode</th>
              <th>Visits</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Consent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleGuests.map((guest) => (
              <tr key={guest.guest_id}>
                <td>
                  <div className="font-semibold text-white">{guest.full_name || 'Guest'}</div>
                  <div className="mt-1 text-xs text-muted">{(guest.tags ?? []).join(', ') || 'No tags'}</div>
                </td>
                <td>{guest.email || '-'}</td>
                <td>{guest.mobile || '-'}</td>
                <td>{guest.postcode || '-'}</td>
                <td>{Number(guest.visit_count ?? 0)}</td>
                <td>{guest.first_seen_at ? formatDateTime(guest.first_seen_at) : '-'}</td>
                <td>{guest.last_seen_at ? formatDateTime(guest.last_seen_at) : '-'}</td>
                <td>{guest.marketing_consent ? 'Consented' : 'No consent'}</td>
                <td>{failedAuthKeys.has(getGuestKey(guest)) ? 'Failed authorization' : 'Known guest'}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!visibleGuests.length ? <p className="py-8 text-center text-sm text-muted">No guests match this segment.</p> : null}
      </Card>
    </div>
  );
}
