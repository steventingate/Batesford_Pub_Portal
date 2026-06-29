import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { subDays } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { formatDateTime } from '../lib/format';
import { HorizontalBars } from '../components/admin/AdminComponents';

type TraceRow = {
  trace_id: string;
  venue_slug: string | null;
  site_id: string | null;
  client_mac: string | null;
  ssid: string | null;
  created_at: string;
  total_duration_ms: number | null;
  outcome: string;
  notes: string | null;
  release_result: string | null;
  metadata: Record<string, unknown> | null;
};

type TraceEventRow = {
  id: number;
  trace_id: string;
  stage_name: string;
  started_at: string;
  status: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

type PortalIssueRow = {
  id: string;
  session_key: string;
  site_slug: string;
  client_mac: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: string | null;
  last_error: string | null;
  trace_id: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type Incident = {
  id: string;
  source: 'trace' | 'session';
  severity: 'critical' | 'warning';
  category: string;
  title: string;
  detail: string;
  venue: string;
  timestamp: string;
  reference: string;
  contact: string;
  raw: TraceRow | PortalIssueRow;
};

const windowOptions = [
  { value: '24h', label: 'Last 24 hours', days: 1 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 }
] as const;

const normalize = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const isCriticalTrace = (trace: TraceRow) => {
  const outcome = normalize(trace.outcome);
  const release = normalize(trace.release_result);
  return outcome.includes('error') || outcome.includes('status_error') || outcome.includes('fail') || release.includes('fail');
};

const isTraceIncident = (trace: TraceRow) => {
  const outcome = normalize(trace.outcome);
  if (isCriticalTrace(trace)) return true;
  return outcome !== '' && !['ok', 'success', 'authorized', 'completed'].includes(outcome);
};

const toTraceIncident = (trace: TraceRow): Incident => {
  const critical = isCriticalTrace(trace);
  const outcome = trace.outcome || 'Unknown outcome';
  return {
    id: `trace-${trace.trace_id}`,
    source: 'trace',
    severity: critical ? 'critical' : 'warning',
    category: critical ? 'Backend Error' : 'Auth Flow Warning',
    title: outcome.replace(/_/g, ' '),
    detail: trace.notes || `Captured in wifi_auth_traces with release result ${trace.release_result || 'n/a'}.`,
    venue: trace.venue_slug || trace.site_id || 'default',
    timestamp: trace.created_at,
    reference: trace.trace_id,
    contact: trace.client_mac || trace.ssid || 'Unknown device',
    raw: trace
  };
};

const toSessionIncident = (session: PortalIssueRow): Incident | null => {
  const status = normalize(session.status);
  const hasError = Boolean(session.last_error);
  const isFailed = status.includes('fail') || status.includes('error') || status.includes('reject') || status.includes('den');
  const isClosedEarly = status.includes('present') || status.includes('close') || status.includes('dismiss') || status.includes('timeout') || status.includes('abandon');

  if (!hasError && !isFailed && !isClosedEarly) return null;

  return {
    id: `session-${session.id}`,
    source: 'session',
    severity: hasError || isFailed ? 'critical' : 'warning',
    category: hasError ? 'Portal Error' : isFailed ? 'Failed Auth' : 'Closed Early',
    title: hasError ? 'Portal session recorded an error' : isFailed ? 'Guest failed authorization' : 'Guest closed before completion',
    detail: session.last_error || `portal_sessions status stored as ${session.status || 'unknown'}.`,
    venue: session.site_slug,
    timestamp: session.updated_at || session.submitted_at || new Date().toISOString(),
    reference: session.trace_id || session.session_key,
    contact: session.guest_email || session.guest_phone || session.client_mac || 'Unknown guest',
    raw: session
  };
};

export default function Traces() {
  const [windowValue, setWindowValue] = useState<(typeof windowOptions)[number]['value']>('7d');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [venueFilter, setVenueFilter] = useState('all');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [selectedTraceEvents, setSelectedTraceEvents] = useState<TraceEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const rangeDays = windowOptions.find((option) => option.value === windowValue)?.days ?? 7;
    const startIso = subDays(new Date(), rangeDays).toISOString();

    const [traceRes, sessionRes] = await Promise.all([
      supabase
        .from('wifi_auth_traces')
        .select('trace_id, venue_slug, site_id, client_mac, ssid, created_at, total_duration_ms, outcome, notes, release_result, metadata')
        .gte('created_at', startIso)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('portal_sessions')
        .select('id, session_key, site_slug, client_mac, guest_email, guest_phone, status, last_error, trace_id, submitted_at, updated_at')
        .gte('updated_at', startIso)
        .order('updated_at', { ascending: false })
        .limit(300)
    ]);

    if (traceRes.error || sessionRes.error) {
      setError(traceRes.error?.message || sessionRes.error?.message || 'Unable to load alert records.');
      setIncidents([]);
      setSelectedIncidentId('');
      setLoading(false);
      return;
    }

    const traceIncidents = ((traceRes.data as TraceRow[] | null) ?? []).filter(isTraceIncident).map(toTraceIncident);
    const sessionIncidents = (((sessionRes.data as PortalIssueRow[] | null) ?? []).map(toSessionIncident).filter(Boolean) as Incident[]);
    const merged = [...traceIncidents, ...sessionIncidents].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    setIncidents(merged);
    setSelectedIncidentId((current) => current && merged.some((incident) => incident.id === current) ? current : merged[0]?.id || '');
    setLoading(false);
  }, [windowValue]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId]
  );

  useEffect(() => {
    const loadEvents = async () => {
      if (!selectedIncident || selectedIncident.source !== 'trace') {
        setSelectedTraceEvents([]);
        return;
      }

      setDetailLoading(true);
      const { data, error: eventsError } = await supabase
        .from('wifi_auth_trace_events')
        .select('id, trace_id, stage_name, started_at, status, message, metadata')
        .eq('trace_id', selectedIncident.reference)
        .order('started_at', { ascending: true });

      if (eventsError) {
        setSelectedTraceEvents([]);
      } else {
        const rows = (data as TraceEventRow[] | null) ?? [];
        setSelectedTraceEvents(rows.filter((row) => normalize(row.status) !== 'ok'));
      }

      setDetailLoading(false);
    };

    void loadEvents();
  }, [selectedIncident]);

  const venues = useMemo(() => {
    const values = new Set<string>();
    incidents.forEach((incident) => values.add(incident.venue));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      if (severityFilter !== 'all' && incident.severity !== severityFilter) return false;
      if (venueFilter !== 'all' && incident.venue !== venueFilter) return false;
      return true;
    });
  }, [incidents, severityFilter, venueFilter]);

  const metrics = useMemo(() => {
    const last24h = subDays(new Date(), 1).getTime();
    const critical = filteredIncidents.filter((incident) => incident.severity === 'critical').length;
    const failedAuth = filteredIncidents.filter((incident) => incident.category === 'Failed Auth').length;
    const closedEarly = filteredIncidents.filter((incident) => incident.category === 'Closed Early').length;
    const recent = filteredIncidents.filter((incident) => Date.parse(incident.timestamp) >= last24h).length;
    return {
      total: filteredIncidents.length,
      recent,
      critical,
      failedAuth,
      closedEarly,
      venues: new Set(filteredIncidents.map((incident) => incident.venue)).size
    };
  }, [filteredIncidents]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    filteredIncidents.forEach((incident) => counts.set(incident.category, (counts.get(incident.category) ?? 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [filteredIncidents]);

  const topVenues = useMemo(() => {
    const counts = new Map<string, number>();
    filteredIncidents.forEach((incident) => counts.set(incident.venue, (counts.get(incident.venue) ?? 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [filteredIncidents]);

  const activeIncident = useMemo(() => {
    if (!selectedIncidentId) return filteredIncidents[0] ?? null;
    return filteredIncidents.find((incident) => incident.id === selectedIncidentId) ?? filteredIncidents[0] ?? null;
  }, [filteredIncidents, selectedIncidentId]);

  return (
    <div className="admin-page ops-page">
      <div className="page-header">
        <div>
          <div className="muted-kicker">Operations Monitor</div>
          <h2 className="text-3xl font-display">Alerts</h2>
          <p className="text-muted">This surface is now focused on DB-backed failures, guest drop-offs, and captive portal incidents that need operational follow-up.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void loadIncidents()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Link to="/automations" className="btn btn-outline">Open automations</Link>
        </div>
      </div>

      <Card className="settings-section-card">
        <div className="settings-card-header">
          <div>
            <h3>Incident Filters</h3>
            <p>Monitoring `wifi_auth_traces`, `wifi_auth_trace_events`, and `portal_sessions.last_error` for operational issues only.</p>
          </div>
        </div>
        <div className="ops-filter-grid">
          <Select label="Window" value={windowValue} onChange={(event) => setWindowValue(event.target.value as typeof windowValue)}>
            {windowOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <Select label="Severity" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}>
            <option value="all">All severities</option>
            <option value="critical">Critical only</option>
            <option value="warning">Warnings only</option>
          </Select>
          <Select label="Venue" value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}>
            <option value="all">All venues</option>
            {venues.map((venue) => (
              <option key={venue} value={venue}>{venue}</option>
            ))}
          </Select>
        </div>
      </Card>

      {error ? <Card className="settings-feedback error">{error}</Card> : null}

      <div className="admin-grid md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="muted-kicker">Open Incidents</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{metrics.total}</p>
          <p className="mt-2 text-sm text-muted">Current filtered incident set across auth traces and portal sessions.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Last 24 Hours</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{metrics.recent}</p>
          <p className="mt-2 text-sm text-muted">Fresh incidents that likely still need a venue-side check.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Critical Errors</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{metrics.critical}</p>
          <p className="mt-2 text-sm text-muted">Backend failures, portal errors, and failed authorization records.</p>
        </Card>
        <Card>
          <div className="muted-kicker">Closed Early</div>
          <p className="mt-3 font-display text-4xl text-[var(--dashboard-text)]">{metrics.closedEarly}</p>
          <p className="mt-2 text-sm text-muted">Guests who closed or abandoned the flow before authorization completed.</p>
        </Card>
      </div>

      <div className="admin-grid xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="settings-section-card">
          <div className="settings-card-header">
            <div>
              <h3>Recent Incident Feed</h3>
              <p>Use this list as the operational source of truth instead of the old raw trace explorer.</p>
            </div>
            <Badge tone="dark">{filteredIncidents.length} records</Badge>
          </div>
          <div className="ops-incident-list">
            {filteredIncidents.length ? (
              filteredIncidents.slice(0, 18).map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  className={`ops-incident-row${activeIncident?.id === incident.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedIncidentId(incident.id)}
                >
                  <div className="ops-incident-top">
                    <div>
                      <div className="ops-incident-title">{incident.title}</div>
                      <div className="ops-incident-meta">{incident.venue} · {incident.category} · {incident.source === 'trace' ? 'wifi_auth_traces' : 'portal_sessions'}</div>
                    </div>
                    <span className={`ops-severity ${incident.severity}`}>{incident.severity}</span>
                  </div>
                  <div className="ops-incident-detail">{incident.detail}</div>
                  <div className="ops-incident-foot">
                    <span>{incident.contact}</span>
                    <span>{formatDateTime(incident.timestamp)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="dashboard-empty-state">No incidents matched the current filters.</div>
            )}
          </div>
        </Card>

        <Card className="settings-section-card">
          <div className="settings-card-header">
            <div>
              <h3>Selected Incident</h3>
              <p>Context for the currently selected failure, including the record source and stored reference.</p>
            </div>
          </div>
          {activeIncident ? (
            <div className="ops-detail-stack">
              <div className="ops-detail-grid">
                <div><span>Severity</span><strong>{activeIncident.severity}</strong></div>
                <div><span>Category</span><strong>{activeIncident.category}</strong></div>
                <div><span>Venue</span><strong>{activeIncident.venue}</strong></div>
                <div><span>Reference</span><strong>{activeIncident.reference}</strong></div>
                <div><span>Source</span><strong>{activeIncident.source === 'trace' ? 'wifi_auth_traces' : 'portal_sessions'}</strong></div>
                <div><span>Seen At</span><strong>{formatDateTime(activeIncident.timestamp)}</strong></div>
              </div>
              <div className="ops-callout">
                <strong>{activeIncident.title}</strong>
                <p>{activeIncident.detail}</p>
              </div>
              {activeIncident.source === 'trace' ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-[var(--dashboard-text)]">Trace event errors</div>
                  {detailLoading ? (
                    <div className="dashboard-empty-state">Loading event stages...</div>
                  ) : selectedTraceEvents.length ? (
                    <div className="ops-event-list">
                      {selectedTraceEvents.map((event) => (
                        <div key={event.id} className="ops-event-row">
                          <div className="ops-event-top">
                            <strong>{event.stage_name}</strong>
                            <span>{formatDateTime(event.started_at)}</span>
                          </div>
                          <p>{event.message || event.status}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-empty-state">No non-ok stage rows were stored for this trace.</div>
                  )}
                </div>
              ) : null}
              <div className="ops-raw-block">
                <div className="text-sm font-semibold text-[var(--dashboard-text)]">Raw record</div>
                <pre>{JSON.stringify(activeIncident.raw, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="dashboard-empty-state">Select an incident from the feed to inspect the stored record.</div>
          )}
        </Card>
      </div>

      <div className="admin-grid xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="settings-section-card">
          <div className="settings-card-header">
            <div>
              <h3>Top Incident Types</h3>
              <p>Most common error categories in the selected window.</p>
            </div>
          </div>
          <HorizontalBars items={topCategories} />
        </Card>

        <Card className="settings-section-card">
          <div className="settings-card-header">
            <div>
              <h3>Venue Impact</h3>
              <p>Where the current issue volume is concentrated.</p>
            </div>
          </div>
          <HorizontalBars items={topVenues} />
          <div className="ops-guidance">
            <div>
              <strong>{metrics.failedAuth}</strong>
              <span>Failed auth incidents</span>
            </div>
            <div>
              <strong>{metrics.venues}</strong>
              <span>Venues impacted</span>
            </div>
            <div>
              <strong>Internal alert preset</strong>
              <span>Use the Failed Authorization Alert automation for DB-backed escalation.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

