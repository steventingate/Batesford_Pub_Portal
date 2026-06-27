import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { DataTable, Info } from '../components/admin/AdminComponents';
import { formatDateTime } from '../lib/format';
import { supabase } from '../lib/supabaseClient';
import { automationPresets } from '../lib/automationPresets';

type AutomationRow = {
  id: string;
  name: string;
  trigger_type: string;
  channel: string;
  segment_definition: Record<string, unknown> | null;
  template: { subject?: string; body?: string } | null;
  linked_voucher_id: string | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};

type AutomationRunRow = {
  id: string;
  automation_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
};

type VoucherOption = {
  id: string;
  name: string;
  code: string;
};

const initialForm = {
  name: '',
  triggerType: 'first_visit_welcome',
  channel: 'email',
  subject: '',
  body: '',
  segment: 'all',
  linkedVoucherId: '',
  enabled: false
};

export default function Automations() {
  const { pushToast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [runs, setRuns] = useState<AutomationRunRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherOption[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const loadAll = async () => {
    const [{ data: automationData }, { data: runData }, { data: voucherData }] = await Promise.all([
      supabase.from('automations').select('*').order('created_at', { ascending: false }),
      supabase.from('automation_runs').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('vouchers').select('id, name, code').order('created_at', { ascending: false }).limit(100)
    ]);

    setAutomations((automationData as AutomationRow[]) ?? []);
    setRuns((runData as AutomationRunRow[]) ?? []);
    setVouchers((voucherData as VoucherOption[]) ?? []);
    if (!selectedAutomationId && automationData?.[0]?.id) {
      setSelectedAutomationId(automationData[0].id);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const selectedAutomation = useMemo(
    () => automations.find((automation) => automation.id === selectedAutomationId) ?? automations[0] ?? null,
    [automations, selectedAutomationId]
  );

  const selectedRuns = useMemo(
    () => runs.filter((run) => run.automation_id === selectedAutomation?.id),
    [runs, selectedAutomation?.id]
  );

  const applyPreset = (presetName: string) => {
    const preset = automationPresets.find((item) => item.name === presetName);
    if (!preset) return;
    setForm({
      name: preset.name,
      triggerType: preset.triggerType,
      channel: preset.channel,
      subject: preset.template.subject || '',
      body: preset.template.body,
      segment: String(preset.segmentDefinition?.segment || 'all'),
      linkedVoucherId: '',
      enabled: false
    });
  };

  const saveAutomation = async () => {
    if (!form.name.trim()) {
      pushToast('Automation name is required.', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('automations').insert({
      name: form.name.trim(),
      trigger_type: form.triggerType,
      channel: form.channel,
      segment_definition: form.segment === 'all' ? {} : { segment: form.segment },
      template: {
        subject: form.subject.trim() || null,
        body: form.body.trim() || null
      },
      linked_voucher_id: form.linkedVoucherId || null,
      enabled: form.enabled
    });
    setSaving(false);

    if (error) {
      pushToast(error.message, 'error');
      return;
    }

    pushToast('Automation saved.', 'success');
    setForm(initialForm);
    await loadAll();
  };

  const runAutomation = async (automationId?: string) => {
    setRunning(true);
    const { error } = await supabase.functions.invoke('run-guest-wifi-automations', {
      body: {
        automation_id: automationId ?? selectedAutomation?.id ?? null,
        dry_run: true
      }
    });
    setRunning(false);

    if (error) {
      pushToast(error.message || 'Automation run failed.', 'error');
      return;
    }

    pushToast('Automation dry run completed.', 'success');
    await loadAll();
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Lifecycle</div>
          <h2 className="font-display text-4xl text-white">Automations</h2>
          <p className="max-w-2xl text-muted">Define repeatable guest automations now, and dry-run the Edge Function safely without sending unless provider envs are explicitly enabled.</p>
        </div>
        <Button onClick={() => runAutomation()} disabled={running}>
          {running ? 'Running...' : 'Run dry test'}
        </Button>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <h3 className="text-xl font-semibold text-white">Create automation</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Select label="Preset" value="" onChange={(event) => applyPreset(event.target.value)}>
              <option value="">Choose a preset</option>
              {automationPresets.map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
            </Select>
            <Input label="Name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Select label="Trigger" value={form.triggerType} onChange={(event) => setForm((prev) => ({ ...prev, triggerType: event.target.value }))}>
              <option value="first_visit_welcome">First visit welcome</option>
              <option value="after_3_visits">After 3 visits thank-you</option>
              <option value="lapsed_30_days">Lapsed guest after 30 days</option>
              <option value="lapsed_45_days">Lapsed guest after 45 days</option>
              <option value="lapsed_60_days">Lapsed guest after 60 days</option>
              <option value="regular_customer_reward">Regular reward</option>
              <option value="failed_authorization_alert">Failed authorization alert</option>
            </Select>
            <Select label="Channel" value={form.channel} onChange={(event) => setForm((prev) => ({ ...prev, channel: event.target.value }))}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="internal">Internal</option>
            </Select>
            <Select label="Audience segment" value={form.segment} onChange={(event) => setForm((prev) => ({ ...prev, segment: event.target.value }))}>
              <option value="all">All guests</option>
              <option value="local">Locals</option>
              <option value="visitor">Visitors</option>
            </Select>
            <Input label="Subject" value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))} />
            <Select label="Linked voucher" value={form.linkedVoucherId} onChange={(event) => setForm((prev) => ({ ...prev, linkedVoucherId: event.target.value }))}>
              <option value="">No linked voucher</option>
              {vouchers.map((voucher) => (
                <option key={voucher.id} value={voucher.id}>{voucher.name} ({voucher.code})</option>
              ))}
            </Select>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-muted">Message / template</span>
              <textarea
                className="input min-h-[120px] resize-y"
                value={form.body}
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Message body or internal note for the automation."
              />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-semibold text-white">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} />
              Enabled
            </label>
          </div>
          <Button className="mt-5" onClick={saveAutomation} disabled={saving}>
            {saving ? 'Saving...' : 'Save automation'}
          </Button>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-white">Automation list</h3>
          <div className="mt-4">
            <DataTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Channel</th>
                  <th>Enabled</th>
                  <th>Last run</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((automation) => (
                  <tr key={automation.id} className="cursor-pointer" onClick={() => setSelectedAutomationId(automation.id)}>
                    <td className="font-semibold text-white">{automation.name}</td>
                    <td>{automation.trigger_type}</td>
                    <td>{automation.channel}</td>
                    <td>{automation.enabled ? 'Yes' : 'No'}</td>
                    <td>{automation.last_run_at ? formatDateTime(automation.last_run_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {!automations.length ? <p className="py-8 text-center text-sm text-muted">No automations created yet.</p> : null}
          </div>
        </Card>
      </div>

      {selectedAutomation ? (
        <>
          <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
            <Card><Info label="Trigger" value={selectedAutomation.trigger_type} /></Card>
            <Card><Info label="Channel" value={selectedAutomation.channel} /></Card>
            <Card><Info label="Enabled" value={selectedAutomation.enabled ? 'Yes' : 'No'} /></Card>
            <Card><Info label="Run logs" value={String(selectedRuns.length)} /></Card>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">Run log</h3>
                <p className="mt-1 text-sm text-muted">Dry-run and execution records from the new Edge Function skeleton.</p>
              </div>
              <Button variant="outline" onClick={() => runAutomation(selectedAutomation.id)} disabled={running}>
                {running ? 'Running...' : 'Run selected automation'}
              </Button>
            </div>
            <div className="mt-4">
              <DataTable>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Status</th>
                    <th>Result</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.started_at)}</td>
                      <td>{run.finished_at ? formatDateTime(run.finished_at) : '-'}</td>
                      <td>{run.status}</td>
                      <td className="text-xs text-muted">{run.result ? JSON.stringify(run.result) : '-'}</td>
                      <td className="text-xs text-muted">{run.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {!selectedRuns.length ? <p className="py-8 text-center text-sm text-muted">No runs recorded yet.</p> : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
