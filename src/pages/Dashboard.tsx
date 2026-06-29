import { useEffect, useState } from 'react';
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
    const intervalId = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
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
    const intervalId = window.setInterval(() => {
      void loadLiveClients();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
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
  const handleMetricSelect = (metric: DashboardMetric) => {
    const queryByMetric: Record<string, string> = {
      uniqueGuests: '/guests?view=unique',
      newGuests: '/guests?view=new',
      returningGuests: '/guests?view=returning',
      totalVisits: '/guests?view=recent',
      withEmail: '/guests?view=with-email',
      withMobile: '/guests?view=with-mobile'
    };

    navigate(queryByMetric[metric.key] || '/guests');
  };

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

      {analytics ? <MetricCards metrics={analytics.metrics} onSelect={handleMetricSelect} /> : null}

      {analytics ? (
        <div className="dashboard-grid">
          <VisitsChart data={analytics.visitsOverTime} />
          <GuestsByStatus total={analytics.guestStatus.total} slices={analytics.guestStatus.slices} />
          <LiveNowPanel liveNow={analytics.liveNow} onViewAll={() => navigate('/guests?live=1')} />
          <PeakTimesHeatmap peakTimes={analytics.peakTimes} />
          <NewVsReturningChart data={analytics.newVsReturning} />
          <ConsentRateWidget consent={analytics.consent} />
          <TopPostcodesPanel rows={analytics.topPostcodes} />
        </div>
      ) : null}

      {analytics ? <KeyInsightsStrip insights={analytics.insights} /> : null}
    </div>
  );
}
