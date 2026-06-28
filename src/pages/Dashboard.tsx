import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  ConsentRateWidget,
  type DashboardMetric,
  DashboardSkeleton,
  GuestsByStatus,
  KeyInsightsStrip,
  LiveNowPanel,
  MetricCards,
  NewVsReturningChart,
  PeakTimesHeatmap,
  TopPostcodesPanel,
  VisitsChart
} from '../components/dashboard/DashboardWidgets';
import { buildDashboardExportCsv, fetchLiveClients, getDashboardAnalytics, type DashboardAnalyticsResult, type DashboardRangePreset } from '../lib/dashboardAnalytics';

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function mergeLiveGuestsIntoPeakTimes(analytics: DashboardAnalyticsResult, connectedAtValues: string[]) {
  if (!connectedAtValues.length) return analytics.peakTimes;

  const increments = new Map<string, number>();
  connectedAtValues.forEach((value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const day = DAY_ORDER[(date.getDay() + 6) % 7];
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    increments.set(key, (increments.get(key) ?? 0) + 1);
  });

  if (!increments.size) return analytics.peakTimes;

  const cells = analytics.peakTimes.cells.map((cell) => {
    const key = `${cell.day}-${cell.hour}`;
    const increment = increments.get(key) ?? 0;
    if (!increment) return cell;
    return {
      ...cell,
      value: Math.max(cell.value, increment)
    };
  });

  let peakHour = 0;
  let peakValue = -1;
  for (let hour = 0; hour < 24; hour += 1) {
    const windowValue = cells
      .filter((cell) => cell.hour === hour || cell.hour === (hour + 1) % 24)
      .reduce((sum, cell) => sum + cell.value, 0);
    if (windowValue > peakValue) {
      peakValue = windowValue;
      peakHour = hour;
    }
  }

  return {
    ...analytics.peakTimes,
    cells,
    peakWindowLabel: `${format(new Date(2026, 0, 1, peakHour), 'ha').toUpperCase()} - ${format(new Date(2026, 0, 1, (peakHour + 2) % 24), 'ha').toUpperCase()}`
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { session, status, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [preset, setPreset] = useState<DashboardRangePreset>('last7');
  const [analytics, setAnalytics] = useState<DashboardAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetric | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const result = await getDashboardAnalytics(preset);
        if (!cancelled) {
          setAnalytics(result);
        }
      } catch (error) {
        if (!cancelled) {
          const message = `Unable to load dashboard analytics: ${(error as Error).message}`;
          setErrorMessage(message);
          pushToast(message, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [preset, pushToast]);

  useEffect(() => {
    let cancelled = false;

    const loadLiveClients = async () => {
      if (status !== 'authed' || !session?.access_token || !analytics) return;

      try {
        const live = await fetchLiveClients(session.access_token);
        if (cancelled) return;

        setAnalytics((current) => {
          if (!current) return current;
          const liveGuestTimes = live.guests.map((guest) => guest.connectedAt).filter(Boolean) as string[];
          return {
            ...current,
            liveNow: {
              ...current.liveNow,
              count: live.count,
              trend: current.liveNow.trend.map((value, index, arr) => {
                if (index === arr.length - 1) return live.count;
                if (index === arr.length - 2) return Math.max(0, Math.round((value + live.count) / 2));
                return value;
              }),
              areas: live.areas,
              guests: live.guests,
              usesFallbackAreas: false
            },
            peakTimes: mergeLiveGuestsIntoPeakTimes(current, liveGuestTimes),
            fallbacksUsed: current.fallbacksUsed.filter((entry) => entry !== 'top active areas using fallback labels')
          };
        });
      } catch (error) {
        if (!cancelled) {
          console.error('[dashboard] live clients fetch failed', error);
        }
      }
    };

    void loadLiveClients();
    return () => {
      cancelled = true;
    };
  }, [analytics?.range.label, session?.access_token, status]);

  const handleExport = () => {
    if (!analytics) return;
    const csv = buildDashboardExportCsv(analytics);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `batesford-dashboard-${preset}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const ownerName = profile?.full_name || 'James Mitchell';
  const ownerRole = profile?.role || 'Owner';
  const initials = ownerName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const metricDetails = useMemo(() => {
    if (!selectedMetric || !analytics) return null;

    const config: Record<string, { title: string; body: string; ctaLabel: string; ctaPath: string; bullets: string[] }> = {
      uniqueGuests: {
        title: 'Unique Guests',
        body: 'A distinct count of guests seen in the selected range. Use this to understand total reach across your venue Wi-Fi.',
        ctaLabel: 'Open Guest List',
        ctaPath: '/guests',
        bullets: analytics.topPostcodes.slice(0, 3).map((row) => `${row.postcode}: ${row.guests} guests`)
      },
      newGuests: {
        title: 'New Guests',
        body: 'Guests whose first recorded visit happened inside the current window. This is the clearest acquisition signal in the dashboard.',
        ctaLabel: 'Open Insights',
        ctaPath: '/insights',
        bullets: analytics.newVsReturning.slice(-3).map((row) => `${row.label}: ${row.newGuests} new`)
      },
      returningGuests: {
        title: 'Returning Guests',
        body: 'Guests who were seen before this window and came back again. This is the retention signal for the venue.',
        ctaLabel: 'Open Segments',
        ctaPath: '/segments',
        bullets: analytics.newVsReturning.slice(-3).map((row) => `${row.label}: ${row.returningGuests} returning`)
      },
      totalVisits: {
        title: 'Total Visits',
        body: 'All recorded Wi-Fi visit events in the selected period. Compare this against unique guests to spot repeat traffic.',
        ctaLabel: 'Open Reports',
        ctaPath: '/reports',
        bullets: analytics.visitsOverTime.slice(-3).map((row) => `${row.label}: ${row.visits} visits`)
      },
      withEmail: {
        title: 'Guests With Email',
        body: 'Guests with an email address captured, ready for campaigns and newsletter lists.',
        ctaLabel: 'Open Campaigns',
        ctaPath: '/campaigns',
        bullets: [
          `${analytics.metrics.find((metric) => metric.key === 'withEmail')?.value || '0%'} capture rate`,
          `${analytics.consent.consented} consented contacts`,
          `${analytics.topPostcodes[0]?.postcode || 'No postcode'} top catchment`
        ]
      },
      withMobile: {
        title: 'Guests With Mobile',
        body: 'Guests with a mobile number captured, useful for SMS campaigns and re-engagement automation.',
        ctaLabel: 'Open Engagement',
        ctaPath: '/engagement',
        bullets: [
          `${analytics.metrics.find((metric) => metric.key === 'withMobile')?.value || '0%'} capture rate`,
          `${analytics.liveNow.count} guests online now`,
          `${analytics.consent.unsubscribed} unsubscribed contacts`
        ]
      }
    };

    return config[selectedMetric.key] || null;
  }, [analytics, selectedMetric]);

  if (loading && !analytics) {
    return (
      <div className="dashboard-page">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-topbar">
        <button type="button" className="dashboard-menu-button" aria-label="Navigation">
          <span />
          <span />
          <span />
        </button>
        <div className="dashboard-right-actions">
          <button type="button" className="dashboard-theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <div className="dashboard-top-status">
            <span className="dashboard-badge-dot">3</span>
            <button type="button" className="dashboard-icon-button" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17a2 2 0 0 1-.6 1.43L4 17h5" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
            </button>
          </div>
          <div className="dashboard-owner-pill">
            <div className="dashboard-owner-avatar">{initials}</div>
            <div>
              <strong>{ownerName}</strong>
              <span>{ownerRole}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Real-time insights into your guests and venue performance</p>
          {analytics ? <div className="dashboard-updated-at">Updated for {analytics.range.label}</div> : null}
        </div>
        <div className="dashboard-header-actions">
          <label className="dashboard-select-pill">
            <span className="dashboard-select-icon"><CalendarIcon /></span>
            <select value={preset} onChange={(event) => setPreset(event.target.value as DashboardRangePreset)}>
              <option value="last7">{analytics?.range.label || 'Last 7 days'}</option>
              <option value="last30">Last 30 days</option>
            </select>
          </label>
          <div className="dashboard-select-pill compare-pill">Compare: {analytics?.range.compareLabel || 'Previous 7 days'}</div>
          <Button onClick={handleExport}>Export Report</Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="dashboard-error-banner">
          <strong>Analytics warning</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {analytics ? <MetricCards metrics={analytics.metrics} onSelect={setSelectedMetric} /> : null}

      {analytics ? (
        <div className="dashboard-grid">
          <VisitsChart data={analytics.visitsOverTime} />
          <GuestsByStatus total={analytics.guestStatus.total} slices={analytics.guestStatus.slices} />
          <LiveNowPanel liveNow={analytics.liveNow} />
          <PeakTimesHeatmap peakTimes={analytics.peakTimes} />
          <NewVsReturningChart data={analytics.newVsReturning} />
          <ConsentRateWidget consent={analytics.consent} />
          <TopPostcodesPanel rows={analytics.topPostcodes} />
        </div>
      ) : null}

      {analytics ? <KeyInsightsStrip insights={analytics.insights} /> : null}

      {selectedMetric && metricDetails ? (
        <div className="dashboard-drilldown-backdrop" onClick={() => setSelectedMetric(null)}>
          <div className="dashboard-drilldown-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="dashboard-drilldown-header">
              <div>
                <div className="muted-kicker">Dashboard Detail</div>
                <h3>{metricDetails.title}</h3>
              </div>
              <button type="button" className="dashboard-icon-button" onClick={() => setSelectedMetric(null)} aria-label="Close drilldown">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="dashboard-drilldown-value">{selectedMetric.value}</div>
            <p className="dashboard-drilldown-body">{metricDetails.body}</p>
            <div className="dashboard-drilldown-list">
              {metricDetails.bullets.map((item) => (
                <div key={item} className="dashboard-drilldown-item">{item}</div>
              ))}
            </div>
            <div className="dashboard-drilldown-actions">
              <Button variant="outline" onClick={() => setSelectedMetric(null)}>Close</Button>
              <Button onClick={() => {
                setSelectedMetric(null);
                navigate(metricDetails.ctaPath);
              }}>{metricDetails.ctaLabel}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
