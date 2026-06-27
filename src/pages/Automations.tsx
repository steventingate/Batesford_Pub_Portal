import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ToastProvider';
import { DataTable, Info } from '../components/admin/AdminComponents';
import { formatDateTime } from '../lib/format';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
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

type AutomationExecutionSummary = {
  automation_id: string;
  name: string;
  status: string;
  matched_guests?: number;
  processed_guests?: number;
  deduped_guests?: number;
  sent_count?: number;
  error?: string;
};

type AutomationRunResponse = {
  ok: boolean;
  simulated: boolean;
  results: AutomationExecutionSummary[];
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

const triggerLabelMap: Record<string, string> = {
  first_visit_welcome: 'First visit welcome',
  after_3_visits: 'After 3 visits thank-you',
  lapsed_30_days: 'Lapsed guest after 30 days',
  lapsed_45_days: 'Lapsed guest after 45 days',
  lapsed_60_days: 'Lapsed guest after 60 days',
  regular_customer_reward: 'Regular reward',
  failed_authorization_alert: 'Failed authorization alert'
};

const describeTrigger = (triggerType: string) => triggerLabelMap[triggerType] ?? triggerType;

const describeSegment = (segmentDefinition: Record<string, unknown> | null) => {
  const segment = typeof segmentDefinition?.segment === 'string' ? segmentDefinition.segment : 'all';
  if (segment === 'local') return 'Locals only';
  if (segment === 'visitor') return 'Visitors only';
  return 'All guests';
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
  const [lastRunResponse, setLastRunResponse] = useState<AutomationRunResponse | null>(null);

  const loadAll = async () => {
    const [{ data: automationData }, { data: runData }, { data: voucherData }] = await Promise.all([
      supabase.from('automations').select('*').order('created_at', { ascending: false }),
      supabase.from('automation_runs').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('vouchers').select('id, name, code').order('created_at', { ascending: false }).limit(100)
    ]);

    setAutomations((automationData as AutomationRow[]) ?? []);
    setRuns((runData as AutomationRunRow[]) ?? []);
    setVouchers((voucherData as VoucherOption[]) ?? []);

    const firstAutomationId = automationData?.[0]?.id ?? '';
    setSelectedAutomationId((current) => current || firstAutomationId);
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

  const latestSelectedRunSummary = useMemo(
    () =>
      lastRunResponse?.results.find((result) => result.automation_id === selectedAutomation?.id) ??
      lastRunResponse?.results[0] ??
      null,
    [lastRunResponse, selectedAutomation?.id]
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
    try {
      const response = await invokeEdgeFunction<AutomationRunResponse>('run-guest-wifi-automations', {
        automation_id: automationId ?? selectedAutomation?.id ?? null,
        dry_run: true
      });

      setLastRunResponse(response);
      pushToast(response.simulated ? 'Automation dry run completed.' : 'Automation run completed.', 'success');
      await loadAll();
    } catch (error) {
      pushToast((error as Error).message || 'Automation run failed.', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Lifecycle</div>
          <h2 className="font-display text-4xl text-white">Automations</h2>
          <p className="max-w-2xl text-muted">Choose a guest automation, run a safe dry test, and see who would be included before any real sending is enabled.</p>
        </div>
        <Button onClick={() => runAutomation()} disabled={running || !selectedAutomation}>
          {running ? 'Running...' : 'Run selected dry test'}
        </Button>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white">Saved automations</h3>
              <p className="mt-1 text-sm text-muted">Pick one to inspect, test, and review recent runs.</p>
            </div>
            <div className="status-pill">{automations.length} saved</div>
          </div>

          <div className="mt-5 space-y-3">
            {automations.map((automation) => {
              const active = selectedAutomation?.id === automation.id;

              return (
                <button
                  key={automation.id}
                  type="button"
                  onClick={() => setSelectedAutomationId(automation.id)}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${active ? 'border-emerald-300/25 bg-emerald-300/[0.05]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.03]'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white">{automation.name}</div>
                      <div className="mt-1 text-sm text-muted">{describeTrigger(automation.trigger_type)}</div>
                    </div>
                    <div className="status-pill">{automation.enabled ? 'Enabled' : 'Draft'}</div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Info label="Audience" value={describeSegment(automation.segment_definition)} />
                    <Info label="Channel" value={automation.channel.toUpperCase()} />
                    <Info label="Last run" value={automation.last_run_at ? formatDateTime(automation.last_run_at) : 'Not run yet'} />
                  </div>
                </button>
              );
            })}

            {!automations.length ? <p className="py-8 text-center text-sm text-muted">No automations created yet.</p> : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white">Selected automation</h3>
              <p className="mt-1 text-sm text-muted">Dry runs stay safe until real provider secrets are enabled.</p>
            </div>
            {selectedAutomation ? (
              <Button variant="outline" onClick={() => runAutomation(selectedAutomation.id)} disabled={running}>
                {running ? 'Running...' : 'Test this automation'}
              </Button>
            ) : null}
          </div>

          {selectedAutomation ? (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card tone="muted" className="p-4"><Info label="Trigger" value={describeTrigger(selectedAutomation.trigger_type)} /></Card>
                <Card tone="muted" className="p-4"><Info label="Audience" value={describeSegment(selectedAutomation.segment_definition)} /></Card>
                <Card tone="muted" className="p-4"><Info label="Channel" value={selectedAutomation.channel.toUpperCase()} /></Card>
                <Card tone="muted" className="p-4"><Info label="Run logs" value={String(selectedRuns.length)} /></Card>
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="muted-kicker">Latest dry run</div>
                    <h4 className="mt-2 text-lg font-semibold text-white">
                      {latestSelectedRunSummary ? latestSelectedRunSummary.name : 'No dry run captured in this session'}
                    </h4>
                    <p className="mt-1 text-sm text-muted">
                      {latestSelectedRunSummary
                        ? `Status: ${latestSelectedRunSummary.status}${lastRunResponse?.simulated ? ' - simulated only' : ''}`
                        : 'Run a dry test to see how many guests match, how many are new to process, and whether any duplicates are skipped.'}
                    </p>
                  </div>
                  {latestSelectedRunSummary ? <div className="status-pill">{latestSelectedRunSummary.status}</div> : null}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card tone="muted" className="p-4"><Info label="Matched guests" value={String(Number(latestSelectedRunSummary?.matched_guests ?? 0))} /></Card>
                  <Card tone="muted" className="p-4"><Info label="To process" value={String(Number(latestSelectedRunSummary?.processed_guests ?? 0))} /></Card>
                  <Card tone="muted" className="p-4"><Info label="Skipped duplicates" value={String(Number(latestSelectedRunSummary?.deduped_guests ?? 0))} /></Card>
                  <Card tone="muted" className="p-4"><Info label="Would send" value={String(Number(latestSelectedRunSummary?.sent_count ?? 0))} /></Card>
                </div>

                {latestSelectedRunSummary?.error ? (
                  <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                    {latestSelectedRunSummary.error}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-muted">Select an automation to inspect it.</p>
          )}
        </Card>
      </div>

      <div className="admin-grid xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <h3 className="text-xl font-semibold text-white">Create automation</h3>
          <p className="mt-1 text-sm text-muted">Start from a preset, keep the copy clear, and attach a voucher only when needed.</p>
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
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-semibold text-white">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} />
              Enabled immediately
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-muted">Message / template</span>
              <textarea
                className="input min-h-[120px] resize-y"
                value={form.body}
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Message body or internal note for the automation."
              />
            </label>
          </div>
          <Button className="mt-5" onClick={saveAutomation} disabled={saving}>
            {saving ? 'Saving...' : 'Save automation'}
          </Button>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-white">Recent run log</h3>
          <p className="mt-1 text-sm text-muted">This stays useful for troubleshooting without becoming a developer-only screen.</p>
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
            {!selectedRuns.length ? <p className="py-8 text-center text-sm text-muted">No runs recorded yet for the selected automation.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
