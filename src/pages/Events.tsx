import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { DataTable, HorizontalBars, Info } from '../components/admin/AdminComponents';
import { formatDateTime } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

type EventRow = {
  id: string;
  name: string;
  type: string;
  start_at: string;
  end_at: string;
  description: string | null;
  campaign_id: string | null;
  voucher_id: string | null;
};

type CampaignOption = {
  id: string;
  name: string;
};

type VoucherOption = {
  id: string;
  name: string;
  code: string;
};

type GuestProfile = {
  guest_id: string;
  full_name: string | null;
  postcode: string | null;
  first_seen_at: string | null;
};

type ConnectionRow = {
  guest_id: string;
  connected_at: string;
};

const initialForm = {
  name: '',
  type: 'trivia',
  startAt: '',
  endAt: '',
  description: '',
  campaignId: '',
  voucherId: ''
};

export default function Events() {
  const { pushToast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [vouchers, setVouchers] = useState<VoucherOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [eventConnections, setEventConnections] = useState<ConnectionRow[]>([]);
  const [postEventConnections, setPostEventConnections] = useState<ConnectionRow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadBase = async () => {
    const [{ data: eventData }, { data: campaignData }, { data: voucherData }, { data: guestData }] = await Promise.all([
      supabase.from('venue_events').select('*').order('start_at', { ascending: false }),
      supabase.from('campaigns').select('id, name').order('created_at', { ascending: false }).limit(100),
      supabase.from('vouchers').select('id, name, code').order('created_at', { ascending: false }).limit(100),
      supabase.from('guest_summary_view').select('guest_id, full_name, postcode, first_seen_at')
    ]);

    setEvents((eventData as EventRow[]) ?? []);
    setCampaigns((campaignData as CampaignOption[]) ?? []);
    setVouchers((voucherData as VoucherOption[]) ?? []);
    setGuestProfiles((guestData as GuestProfile[]) ?? []);
    if (!selectedEventId && eventData?.[0]?.id) {
      setSelectedEventId(eventData[0].id);
    }
  };

  useEffect(() => {
    void loadBase();
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? events[0] ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    const loadEventConnections = async () => {
      if (!selectedEvent) {
        setEventConnections([]);
        setPostEventConnections([]);
        return;
      }

      const eventEndPlus30 = new Date(new Date(selectedEvent.end_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: eventData }, { data: afterData }] = await Promise.all([
        supabase
          .from('wifi_connections')
          .select('guest_id, connected_at')
          .gte('connected_at', selectedEvent.start_at)
          .lte('connected_at', selectedEvent.end_at),
        supabase
          .from('wifi_connections')
          .select('guest_id, connected_at')
          .gt('connected_at', selectedEvent.end_at)
          .lte('connected_at', eventEndPlus30)
      ]);

      setEventConnections((eventData as ConnectionRow[]) ?? []);
      setPostEventConnections((afterData as ConnectionRow[]) ?? []);
    };

    void loadEventConnections();
  }, [selectedEvent?.id]);

  const createEvent = async () => {
    if (!form.name.trim() || !form.startAt || !form.endAt) {
      pushToast('Event name, start, and end are required.', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('venue_events').insert({
      name: form.name.trim(),
      type: form.type,
      start_at: new Date(form.startAt).toISOString(),
      end_at: new Date(form.endAt).toISOString(),
      description: form.description.trim() || null,
      campaign_id: form.campaignId || null,
      voucher_id: form.voucherId || null
    });
    setSaving(false);

    if (error) {
      pushToast(error.message, 'error');
      return;
    }

    pushToast('Event saved.', 'success');
    setForm(initialForm);
    await loadBase();
  };

  const metrics = useMemo(() => {
    if (!selectedEvent) {
      return null;
    }

    const eventGuestIds = [...new Set(eventConnections.map((row) => row.guest_id))];
    const eventGuests = guestProfiles.filter((guest) => eventGuestIds.includes(guest.guest_id));
    const newGuests = eventGuests.filter((guest) => {
      if (!guest.first_seen_at) return false;
      const firstSeen = new Date(guest.first_seen_at).getTime();
      return firstSeen >= new Date(selectedEvent.start_at).getTime() && firstSeen <= new Date(selectedEvent.end_at).getTime();
    });
    const returningGuests = Math.max(eventGuests.length - newGuests.length, 0);

    const postcodeMap = new Map<string, number>();
    eventGuests.forEach((guest) => {
      if (!guest.postcode) return;
      postcodeMap.set(guest.postcode, (postcodeMap.get(guest.postcode) ?? 0) + 1);
    });
    const topPostcodes = [...postcodeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([postcode, guests]) => ({ postcode, guests }));

    const withinWindow = (days: number) => {
      const threshold = new Date(new Date(selectedEvent.end_at).getTime() + days * 24 * 60 * 60 * 1000).getTime();
      const set = new Set(
        postEventConnections
          .filter((row) => eventGuestIds.includes(row.guest_id))
          .filter((row) => new Date(row.connected_at).getTime() <= threshold)
          .map((row) => row.guest_id)
      );
      return set.size;
    };

    const voucherRedemptionCount = selectedEvent.voucher_id
      ? 0
      : 0;

    return {
      totalGuests: eventGuests.length,
      newGuests: newGuests.length,
      returningGuests,
      topPostcodes,
      returned7: withinWindow(7),
      returned14: withinWindow(14),
      returned30: withinWindow(30),
      voucherRedemptionCount
    };
  }, [eventConnections, guestProfiles, postEventConnections, selectedEvent]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Venue Performance</div>
          <h2 className="font-display text-4xl text-white">Events</h2>
          <p className="max-w-2xl text-muted">Create venue events and read back how many guests connected during the window, where they came from, and how many returned afterward.</p>
        </div>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <h3 className="text-xl font-semibold text-white">Create event</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Event name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Select label="Type" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
              <option value="trivia">Trivia</option>
              <option value="live_music">Live music</option>
              <option value="sport">Sport</option>
              <option value="special">Special</option>
              <option value="private">Private</option>
              <option value="other">Other</option>
            </Select>
            <Input label="Start" type="datetime-local" value={form.startAt} onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))} />
            <Input label="End" type="datetime-local" value={form.endAt} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))} />
            <Select label="Linked campaign" value={form.campaignId} onChange={(event) => setForm((prev) => ({ ...prev, campaignId: event.target.value }))}>
              <option value="">No linked campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </Select>
            <Select label="Linked voucher" value={form.voucherId} onChange={(event) => setForm((prev) => ({ ...prev, voucherId: event.target.value }))}>
              <option value="">No linked voucher</option>
              {vouchers.map((voucher) => (
                <option key={voucher.id} value={voucher.id}>{voucher.name} ({voucher.code})</option>
              ))}
            </Select>
            <Input label="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <Button className="mt-5" onClick={createEvent} disabled={saving}>
            {saving ? 'Saving...' : 'Save event'}
          </Button>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-white">Event list</h3>
          <div className="mt-4">
            <DataTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="cursor-pointer" onClick={() => setSelectedEventId(event.id)}>
                    <td className="font-semibold text-white">{event.name}</td>
                    <td>{event.type}</td>
                    <td>{formatDateTime(event.start_at)}</td>
                    <td>{formatDateTime(event.end_at)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {!events.length ? <p className="py-8 text-center text-sm text-muted">No events created yet.</p> : null}
          </div>
        </Card>
      </div>

      {selectedEvent && metrics ? (
        <>
          <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
            <Card><Info label="Guests connected" value={String(metrics.totalGuests)} /></Card>
            <Card><Info label="New guests" value={String(metrics.newGuests)} /></Card>
            <Card><Info label="Returning guests" value={String(metrics.returningGuests)} /></Card>
            <Card><Info label="Returned in 30 days" value={String(metrics.returned30)} /></Card>
          </div>

          <div className="admin-grid xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <h3 className="text-xl font-semibold text-white">Event detail</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                  <div className="font-semibold text-white">{selectedEvent.name}</div>
                  <div className="mt-1 text-muted">{selectedEvent.description || 'No description'}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Card tone="muted" className="p-4">
                    <Info label="Campaign sent before event" value={campaigns.find((campaign) => campaign.id === selectedEvent.campaign_id)?.name || 'None linked'} />
                  </Card>
                  <Card tone="muted" className="p-4">
                    <Info label="Linked voucher" value={vouchers.find((voucher) => voucher.id === selectedEvent.voucher_id)?.code || 'None linked'} />
                  </Card>
                  <Card tone="muted" className="p-4">
                    <Info label="Returned within 7 days" value={String(metrics.returned7)} />
                  </Card>
                  <Card tone="muted" className="p-4">
                    <Info label="Returned within 14 days" value={String(metrics.returned14)} />
                  </Card>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-xl font-semibold text-white">Top postcodes</h3>
              <div className="mt-4">
                <HorizontalBars items={metrics.topPostcodes.map((row) => ({ label: row.postcode, value: row.guests }))} />
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
