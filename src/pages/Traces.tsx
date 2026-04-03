import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { formatDateTime } from '../lib/format';

type TraceRow = {
  trace_id: string;
  venue_slug: string | null;
  site_id: string | null;
  client_mac: string | null;
  ssid: string | null;
  ap_mac: string | null;
  request_url: string | null;
  created_at: string;
  completed_at: string | null;
  total_duration_ms: number | null;
  backend_duration_ms: number | null;
  frontend_duration_ms: number | null;
  outcome: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

type TraceEventRow = {
  id: number;
  trace_id: string;
  stage_name: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type VenueSummaryRow = {
  venue: string;
  count: number;
  avg: number;
  p95: number;
  max: number;
};

const SLOW_THRESHOLDS = {
  dbMs: 500,
  unifiLoginMs: 1000,
  unifiAuthorizeMs: 1500,
  totalFlowMs: 5000
} as const;

const TRACE_FETCH_LIMIT = 200;

const toDurationMs = (event: TraceEventRow) => {
  if (typeof event.duration_ms === 'number' && Number.isFinite(event.duration_ms)) {
    return Math.max(0, Math.round(event.duration_ms));
  }
  const startMs = Date.parse(event.started_at);
  const endMs = Date.parse(event.ended_at ?? event.started_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round(endMs - startMs));
};

const toIsoStart = (dateInput: string, endOfDay: boolean) => {
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const date = new Date(`${dateInput}${suffix}`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
};

const toP95 = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
};

const average = (values: number[]) => {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
};

const getStageThresholdMs = (stageName: string) => {
  const normalized = stageName.toLowerCase();
  if (normalized.includes('db_insert')) return SLOW_THRESHOLDS.dbMs;
  if (normalized.includes('unifi_login')) return SLOW_THRESHOLDS.unifiLoginMs;
  if (normalized.includes('unifi_authorize')) return SLOW_THRESHOLDS.unifiAuthorizeMs;
  return null;
};

const parseTraceContext = (trace: TraceRow | null) => {
  const metadata = trace?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const rawContext = (metadata as Record<string, unknown>).trace_context;
  if (!rawContext || typeof rawContext !== 'object') return null;
  return rawContext as Record<string, unknown>;
};

export default function Traces() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [events, setEvents] = useState<TraceEventRow[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string>('');
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venueFilter, setVenueFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [ssidFilter, setSsidFilter] = useState('');
  const [minDurationFilter, setMinDurationFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');

  const loadTraces = useCallback(async () => {
    setListLoading(true);
    setError(null);

    let query = supabase
      .from('wifi_auth_traces')
      .select('trace_id, venue_slug, site_id, client_mac, ssid, ap_mac, request_url, created_at, completed_at, total_duration_ms, backend_duration_ms, frontend_duration_ms, outcome, notes, metadata')
      .order('created_at', { ascending: false })
      .limit(TRACE_FETCH_LIMIT);

    if (venueFilter.trim()) {
      query = query.eq('venue_slug', venueFilter.trim());
    }
    if (outcomeFilter.trim()) {
      query = query.eq('outcome', outcomeFilter.trim());
    }
    if (ssidFilter.trim()) {
      query = query.ilike('ssid', `%${ssidFilter.trim()}%`);
    }

    const minDuration = Number(minDurationFilter);
    if (Number.isFinite(minDuration) && minDuration >= 0) {
      query = query.gte('total_duration_ms', Math.round(minDuration));
    }

    if (startDateFilter) {
      const startIso = toIsoStart(startDateFilter, false);
      if (startIso) {
        query = query.gte('created_at', startIso);
      }
    }

    if (endDateFilter) {
      const endIso = toIsoStart(endDateFilter, true);
      if (endIso) {
        query = query.lte('created_at', endIso);
      }
    }

    const { data, error: tracesError } = await query;
    if (tracesError) {
      setTraces([]);
      setSelectedTraceId('');
      setEvents([]);
      setError(tracesError.message);
      setListLoading(false);
      return;
    }

    const rows = (data as TraceRow[] | null) ?? [];
    setTraces(rows);
    if (!rows.length) {
      setSelectedTraceId('');
      setEvents([]);
    } else if (!selectedTraceId || !rows.some((row) => row.trace_id === selectedTraceId)) {
      setSelectedTraceId(rows[0].trace_id);
    }

    setListLoading(false);
  }, [endDateFilter, minDurationFilter, outcomeFilter, selectedTraceId, ssidFilter, startDateFilter, venueFilter]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  useEffect(() => {
    const loadEvents = async () => {
      if (!selectedTraceId) {
        setEvents([]);
        return;
      }
      setDetailLoading(true);
      const { data, error: eventsError } = await supabase
        .from('wifi_auth_trace_events')
        .select('id, trace_id, stage_name, started_at, ended_at, duration_ms, status, message, metadata, created_at')
        .eq('trace_id', selectedTraceId)
        .order('started_at', { ascending: true });

      if (eventsError) {
        setEvents([]);
        setError(eventsError.message);
      } else {
        setEvents((data as TraceEventRow[] | null) ?? []);
      }
      setDetailLoading(false);
    };

    loadEvents();
  }, [selectedTraceId]);

  const selectedTrace = useMemo(
    () => traces.find((trace) => trace.trace_id === selectedTraceId) ?? null,
    [selectedTraceId, traces]
  );

  const venueOptions = useMemo(() => {
    const values = new Set<string>();
    traces.forEach((trace) => {
      if (trace.venue_slug) {
        values.add(trace.venue_slug);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [traces]);

  const outcomes = useMemo(() => {
    const values = new Set<string>();
    traces.forEach((trace) => {
      if (trace.outcome) {
        values.add(trace.outcome);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [traces]);

  const totalSlow = useMemo(() => {
    return traces.filter((trace) => (trace.total_duration_ms ?? 0) > SLOW_THRESHOLDS.totalFlowMs).length;
  }, [traces]);

  const venueSummaries = useMemo<VenueSummaryRow[]>(() => {
    const grouped = new Map<string, number[]>();
    traces.forEach((trace) => {
      if (!Number.isFinite(trace.total_duration_ms ?? null)) return;
      const key = trace.venue_slug || trace.site_id || 'unknown';
      const next = grouped.get(key) ?? [];
      next.push(Math.max(0, Math.round(trace.total_duration_ms ?? 0)));
      grouped.set(key, next);
    });

    return Array.from(grouped.entries())
      .map(([venue, values]) => ({
        venue,
        count: values.length,
        avg: average(values),
        p95: toP95(values),
        max: Math.max(...values)
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [traces]);

  const timelineRows = useMemo(() => {
    if (!events.length) return [];

    const parsed = events
      .map((event) => {
        const startMs = Date.parse(event.started_at);
        const endMs = Date.parse(event.ended_at ?? event.started_at);
        const duration = toDurationMs(event);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
          return null;
        }
        return {
          ...event,
          startMs,
          endMs,
          duration
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (!parsed.length) return [];

    const minStart = Math.min(...parsed.map((row) => row.startMs));
    const maxEnd = Math.max(...parsed.map((row) => row.endMs));
    const range = Math.max(1, maxEnd - minStart);

    return parsed.map((row) => {
      const threshold = getStageThresholdMs(row.stage_name);
      const isSlow = threshold !== null && row.duration > threshold;
      return {
        ...row,
        offsetPct: ((row.startMs - minStart) / range) * 100,
        widthPct: Math.max(1, (row.duration / range) * 100),
        isSlow,
        threshold
      };
    });
  }, [events]);

  const backendFastFrontendSlow = useMemo(() => {
    if (!selectedTrace) return false;
    const backendMs = selectedTrace.backend_duration_ms ?? 0;
    const frontendMs = selectedTrace.frontend_duration_ms ?? 0;
    return backendMs > 0 && backendMs <= 2000 && frontendMs > SLOW_THRESHOLDS.totalFlowMs;
  }, [selectedTrace]);

  const handleCopyTraceId = useCallback(async () => {
    if (!selectedTraceId) return;
    try {
      await navigator.clipboard.writeText(selectedTraceId);
      setCopyFeedback('Copied trace_id');
      window.setTimeout(() => setCopyFeedback(''), 1500);
    } catch {
      setCopyFeedback('Copy failed');
      window.setTimeout(() => setCopyFeedback(''), 1500);
    }
  }, [selectedTraceId]);

  const handleExportJson = useCallback(() => {
    if (!selectedTrace) return;
    const payload = {
      trace: selectedTrace,
      events,
      exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wifi-trace-${selectedTrace.trace_id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [events, selectedTrace]);

  const traceContext = parseTraceContext(selectedTrace);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="text-3xl font-display text-brand">Wi-Fi Traces</h2>
          <p className="text-muted">End-to-end auth timing for captive portal attempts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadTraces()} disabled={listLoading}>
            {listLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Card className="space-y-4">
        <form
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            loadTraces();
          }}
        >
          <Select label="Venue" value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}>
            <option value="">All venues</option>
            {venueOptions.map((venue) => (
              <option key={venue} value={venue}>
                {venue}
              </option>
            ))}
          </Select>

          <Select label="Outcome" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)}>
            <option value="">All outcomes</option>
            {outcomes.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcome}
              </option>
            ))}
          </Select>

          <Input
            label="SSID contains"
            value={ssidFilter}
            onChange={(event) => setSsidFilter(event.target.value)}
            placeholder="Batesford Free Wi-Fi"
          />

          <Input
            label="Min total (ms)"
            value={minDurationFilter}
            onChange={(event) => setMinDurationFilter(event.target.value)}
            placeholder="5000"
            inputMode="numeric"
          />

          <Input
            label="Start date"
            type="date"
            value={startDateFilter}
            onChange={(event) => setStartDateFilter(event.target.value)}
          />

          <Input
            label="End date"
            type="date"
            value={endDateFilter}
            onChange={(event) => setEndDateFilter(event.target.value)}
          />

          <div className="md:col-span-2 xl:col-span-6 flex items-center gap-2">
            <Button type="submit" disabled={listLoading}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setVenueFilter('');
                setOutcomeFilter('');
                setSsidFilter('');
                setMinDurationFilter('');
                setStartDateFilter('');
                setEndDateFilter('');
              }}
            >
              Clear
            </Button>
            <span className="text-xs text-muted ml-auto">
              Slow flow threshold: {SLOW_THRESHOLDS.totalFlowMs}ms ({totalSlow} traces in current results)
            </span>
          </div>
        </form>
      </Card>

      {error && (
        <Card className="border border-red-200 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6">
        <Card className="space-y-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent traces</h3>
            <span className="text-sm text-muted">{traces.length} rows</span>
          </div>
          <div className="overflow-auto max-h-[560px] border border-slate-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-muted">
                  <th className="px-3 py-2">Trace</th>
                  <th className="px-3 py-2">Venue</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Total (ms)</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Client</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => {
                  const selected = trace.trace_id === selectedTraceId;
                  const totalMs = trace.total_duration_ms ?? 0;
                  const rowSlow = totalMs > SLOW_THRESHOLDS.totalFlowMs;
                  return (
                    <tr
                      key={trace.trace_id}
                      className={`border-t border-slate-100 cursor-pointer ${selected ? 'bg-brand/10' : 'hover:bg-slate-50'} ${rowSlow ? 'trace-row-slow' : ''}`}
                      onClick={() => setSelectedTraceId(trace.trace_id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{trace.trace_id}</td>
                      <td className="px-3 py-2">{trace.venue_slug || trace.site_id || '-'}</td>
                      <td className="px-3 py-2">{formatDateTime(trace.created_at)}</td>
                      <td className="px-3 py-2">{totalMs || '-'}</td>
                      <td className="px-3 py-2">{trace.outcome || '-'}</td>
                      <td className="px-3 py-2">{trace.client_mac || trace.ssid || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!traces.length && !listLoading && (
              <p className="p-6 text-sm text-muted text-center">No traces match the current filters.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">Trace details</h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleCopyTraceId} disabled={!selectedTraceId}>
                Copy trace_id
              </Button>
              <Button variant="outline" onClick={handleExportJson} disabled={!selectedTrace}>
                Export JSON
              </Button>
            </div>
          </div>

          {copyFeedback && <p className="text-xs text-brand">{copyFeedback}</p>}

          {!selectedTrace && <p className="text-sm text-muted">Select a trace to inspect timeline details.</p>}

          {selectedTrace && (
            <div className="space-y-3">
              <div className="text-sm space-y-1">
                <div><strong>Trace ID:</strong> <span className="font-mono text-xs">{selectedTrace.trace_id}</span></div>
                <div><strong>Venue:</strong> {selectedTrace.venue_slug || selectedTrace.site_id || '-'}</div>
                <div><strong>Outcome:</strong> {selectedTrace.outcome}</div>
                <div><strong>Total:</strong> {selectedTrace.total_duration_ms ?? '-'} ms</div>
                <div><strong>Backend:</strong> {selectedTrace.backend_duration_ms ?? '-'} ms</div>
                <div><strong>Frontend:</strong> {selectedTrace.frontend_duration_ms ?? '-'} ms</div>
                <div><strong>SSID:</strong> {selectedTrace.ssid || '-'}</div>
                <div><strong>Client MAC:</strong> {selectedTrace.client_mac || '-'}</div>
                <div><strong>Created:</strong> {formatDateTime(selectedTrace.created_at)}</div>
              </div>

              {backendFastFrontendSlow && (
                <div className="trace-note-slow">
                  Backend completed quickly, but frontend/captive release appears slow for this trace.
                </div>
              )}

              {traceContext && (
                <div className="trace-context-box">
                  <p className="font-semibold mb-1">Trace context</p>
                  <pre>{JSON.stringify(traceContext, null, 2)}</pre>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold mb-2">Stage timeline</p>
                {detailLoading ? (
                  <p className="text-sm text-muted">Loading timeline...</p>
                ) : !timelineRows.length ? (
                  <p className="text-sm text-muted">No stage events recorded.</p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                    {timelineRows.map((event) => (
                      <div key={`${event.id}-${event.stage_name}`} className={`trace-stage-row ${event.isSlow ? 'trace-stage-slow' : ''}`}>
                        <div className="trace-stage-header">
                          <span className="font-mono text-xs">{event.stage_name}</span>
                          <span className="text-xs text-muted">{event.duration} ms</span>
                        </div>
                        <div className="trace-bar-track">
                          <span
                            className={`trace-bar-fill ${event.isSlow ? 'trace-bar-fill-slow' : ''}`}
                            style={{ left: `${event.offsetPct}%`, width: `${event.widthPct}%` }}
                          />
                        </div>
                        <div className="trace-stage-meta text-xs text-muted">
                          <span>{formatDateTime(event.started_at)}</span>
                          {event.threshold !== null && (
                            <span>slow threshold: {event.threshold} ms</span>
                          )}
                        </div>
                        {event.message && <p className="text-xs text-red-700 mt-1">{event.message}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-semibold mb-3">Venue timing summary (current filtered result set)</h3>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Venue</th>
                <th className="py-2 pr-4">Traces</th>
                <th className="py-2 pr-4">Avg total (ms)</th>
                <th className="py-2 pr-4">P95 total (ms)</th>
                <th className="py-2 pr-4">Max total (ms)</th>
              </tr>
            </thead>
            <tbody>
              {venueSummaries.map((row) => (
                <tr key={row.venue} className="border-t border-slate-100">
                  <td className="py-2 pr-4">{row.venue}</td>
                  <td className="py-2 pr-4">{row.count}</td>
                  <td className="py-2 pr-4">{row.avg}</td>
                  <td className="py-2 pr-4">{row.p95}</td>
                  <td className="py-2 pr-4">{row.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!venueSummaries.length && <p className="text-sm text-muted py-3">No summary data available yet.</p>}
        </div>
      </Card>
    </div>
  );
}
