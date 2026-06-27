import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { DataTable, Info } from '../components/admin/AdminComponents';
import { formatDateTime } from '../lib/format';
import { supabase } from '../lib/supabaseClient';

type VoucherRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number | null;
  start_at: string | null;
  end_at: string | null;
  max_redemptions: number | null;
  per_guest_limit: number | null;
  status: string;
  campaign_id: string | null;
  created_at: string;
};

type RedemptionRow = {
  id: string;
  voucher_id: string;
  guest_id: string;
  redeemed_at: string;
  redeemed_by: string | null;
  estimated_revenue: number | null;
  notes: string | null;
};

type GuestOption = {
  guest_id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
};

const initialForm = {
  name: '',
  code: '',
  description: '',
  discountType: 'custom',
  discountValue: '',
  startAt: '',
  endAt: '',
  maxRedemptions: '',
  perGuestLimit: '',
  status: 'active'
};

export default function Vouchers() {
  const { pushToast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [guestMatches, setGuestMatches] = useState<GuestOption[]>([]);
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [redeemedBy, setRedeemedBy] = useState('');
  const [estimatedRevenue, setEstimatedRevenue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const loadAll = async () => {
    const [{ data: voucherData }, { data: redemptionData }] = await Promise.all([
      supabase.from('vouchers').select('*').order('created_at', { ascending: false }),
      supabase.from('voucher_redemptions').select('*').order('redeemed_at', { ascending: false })
    ]);

    setVouchers((voucherData as VoucherRow[]) ?? []);
    setRedemptions((redemptionData as RedemptionRow[]) ?? []);
    if (!selectedVoucherId && voucherData?.[0]?.id) {
      setSelectedVoucherId(voucherData[0].id);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setGuestMatches([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const query = search.trim();
      const { data } = await supabase
        .from('guest_summary_view')
        .select('guest_id, full_name, email, mobile')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,mobile.ilike.%${query}%`)
        .limit(8);

      setGuestMatches((data as GuestOption[]) ?? []);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search]);

  const selectedVoucher = useMemo(
    () => vouchers.find((voucher) => voucher.id === selectedVoucherId) ?? vouchers[0] ?? null,
    [selectedVoucherId, vouchers]
  );

  const selectedVoucherRedemptions = useMemo(
    () => redemptions.filter((row) => row.voucher_id === selectedVoucher?.id),
    [redemptions, selectedVoucher?.id]
  );

  const metrics = useMemo(() => {
    const totalRedemptions = selectedVoucherRedemptions.length;
    const estimatedRevenueTotal = selectedVoucherRedemptions.reduce((sum, row) => sum + Number(row.estimated_revenue ?? 0), 0);
    return {
      totalRedemptions,
      estimatedRevenueTotal
    };
  }, [selectedVoucherRedemptions]);

  const createVoucher = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      pushToast('Voucher name and code are required.', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('vouchers').insert({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      discount_type: form.discountType,
      discount_value: form.discountValue ? Number(form.discountValue) : null,
      start_at: form.startAt ? new Date(form.startAt).toISOString() : null,
      end_at: form.endAt ? new Date(form.endAt).toISOString() : null,
      max_redemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      per_guest_limit: form.perGuestLimit ? Number(form.perGuestLimit) : null,
      status: form.status
    });
    setSaving(false);

    if (error) {
      pushToast(error.message, 'error');
      return;
    }

    pushToast('Voucher created.', 'success');
    setForm(initialForm);
    await loadAll();
  };

  const redeemVoucher = async () => {
    if (!selectedVoucher || !selectedGuestId) {
      pushToast('Choose a voucher and guest.', 'error');
      return;
    }

    const guestRedemptionCount = selectedVoucherRedemptions.filter((row) => row.guest_id === selectedGuestId).length;
    if (selectedVoucher.per_guest_limit && guestRedemptionCount >= selectedVoucher.per_guest_limit) {
      pushToast('Per-guest redemption limit reached for this voucher.', 'error');
      return;
    }

    if (selectedVoucher.max_redemptions && selectedVoucherRedemptions.length >= selectedVoucher.max_redemptions) {
      pushToast('This voucher has reached its maximum redemptions.', 'error');
      return;
    }

    setRedeeming(true);
    const { error } = await supabase.from('voucher_redemptions').insert({
      voucher_id: selectedVoucher.id,
      guest_id: selectedGuestId,
      campaign_id: selectedVoucher.campaign_id,
      redeemed_by: redeemedBy.trim() || null,
      estimated_revenue: estimatedRevenue ? Number(estimatedRevenue) : null,
      notes: notes.trim() || null
    });
    setRedeeming(false);

    if (error) {
      pushToast(error.message, 'error');
      return;
    }

    pushToast('Voucher redemption saved.', 'success');
    setSearch('');
    setGuestMatches([]);
    setSelectedGuestId('');
    setRedeemedBy('');
    setEstimatedRevenue('');
    setNotes('');
    await loadAll();
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Offer Tracking</div>
          <h2 className="font-display text-4xl text-white">Vouchers</h2>
          <p className="max-w-2xl text-muted">Track offers from creation through redemption so James can tie campaigns back to actual return visits.</p>
        </div>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <h3 className="text-xl font-semibold text-white">Create voucher</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Input label="Code" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
            <Input label="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            <Select label="Discount type" value={form.discountType} onChange={(event) => setForm((prev) => ({ ...prev, discountType: event.target.value }))}>
              <option value="custom">Custom</option>
              <option value="dollar">Dollar</option>
              <option value="percent">Percent</option>
              <option value="free_item">Free item</option>
            </Select>
            <Input label="Discount value" type="number" value={form.discountValue} onChange={(event) => setForm((prev) => ({ ...prev, discountValue: event.target.value }))} />
            <Select label="Status" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Input label="Start date" type="datetime-local" value={form.startAt} onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))} />
            <Input label="End date" type="datetime-local" value={form.endAt} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))} />
            <Input label="Max redemptions" type="number" value={form.maxRedemptions} onChange={(event) => setForm((prev) => ({ ...prev, maxRedemptions: event.target.value }))} />
            <Input label="Per guest limit" type="number" value={form.perGuestLimit} onChange={(event) => setForm((prev) => ({ ...prev, perGuestLimit: event.target.value }))} />
          </div>
          <Button className="mt-5" onClick={createVoucher} disabled={saving}>
            {saving ? 'Saving...' : 'Create voucher'}
          </Button>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-white">Redeem voucher</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Select label="Voucher" value={selectedVoucher?.id ?? ''} onChange={(event) => setSelectedVoucherId(event.target.value)}>
              <option value="">Select a voucher</option>
              {vouchers.map((voucher) => (
                <option key={voucher.id} value={voucher.id}>
                  {voucher.name} ({voucher.code})
                </option>
              ))}
            </Select>
            <Input label="Search guest" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, mobile" />
            <Select label="Matched guest" value={selectedGuestId} onChange={(event) => setSelectedGuestId(event.target.value)}>
              <option value="">Select guest</option>
              {guestMatches.map((guest) => (
                <option key={guest.guest_id} value={guest.guest_id}>
                  {(guest.full_name || 'Guest')} - {guest.email || guest.mobile || 'No contact'}
                </option>
              ))}
            </Select>
            <Input label="Redeemed by" value={redeemedBy} onChange={(event) => setRedeemedBy(event.target.value)} placeholder="Staff name" />
            <Input label="Estimated revenue" type="number" value={estimatedRevenue} onChange={(event) => setEstimatedRevenue(event.target.value)} />
            <Input label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" />
          </div>
          <Button className="mt-5" onClick={redeemVoucher} disabled={redeeming}>
            {redeeming ? 'Saving...' : 'Mark redeemed'}
          </Button>
        </Card>
      </div>

      {selectedVoucher ? (
        <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
          <Card><Info label="Voucher code" value={selectedVoucher.code} /></Card>
          <Card><Info label="Status" value={selectedVoucher.status} /></Card>
          <Card><Info label="Redemptions" value={String(metrics.totalRedemptions)} /></Card>
          <Card><Info label="Est. revenue" value={`$${metrics.estimatedRevenueTotal.toFixed(0)}`} /></Card>
        </div>
      ) : null}

      <Card>
        <h3 className="text-xl font-semibold text-white">Voucher list</h3>
        <div className="mt-4">
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Status</th>
                <th>Redemptions</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((voucher) => (
                <tr key={voucher.id} className="cursor-pointer" onClick={() => setSelectedVoucherId(voucher.id)}>
                  <td className="font-semibold text-white">{voucher.name}</td>
                  <td>{voucher.code}</td>
                  <td>{voucher.discount_type}</td>
                  <td>{voucher.discount_value ?? '-'}</td>
                  <td>{voucher.status}</td>
                  <td>{redemptions.filter((row) => row.voucher_id === voucher.id).length}</td>
                  <td>{voucher.start_at ? formatDateTime(voucher.start_at) : '-'} / {voucher.end_at ? formatDateTime(voucher.end_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>

      <Card>
        <h3 className="text-xl font-semibold text-white">Redemption log</h3>
        <div className="mt-4">
          <DataTable>
            <thead>
              <tr>
                <th>Redeemed at</th>
                <th>Voucher</th>
                <th>Guest</th>
                <th>Redeemed by</th>
                <th>Estimated revenue</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {selectedVoucherRedemptions.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.redeemed_at)}</td>
                  <td>{selectedVoucher?.code}</td>
                  <td>{row.guest_id}</td>
                  <td>{row.redeemed_by || '-'}</td>
                  <td>{row.estimated_revenue ?? '-'}</td>
                  <td>{row.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!selectedVoucherRedemptions.length ? <p className="py-8 text-center text-sm text-muted">No redemptions recorded for this voucher yet.</p> : null}
        </div>
      </Card>
    </div>
  );
}
