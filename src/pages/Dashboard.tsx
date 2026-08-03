import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '../components/ui/Button';
import { DatePresetSelector } from '../components/dashboard/DatePresetSelector';
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
import { buildDashboardExportCsv, fetchLiveClients, type DashboardAnalyticsResult, type SerializedDashboardAnalyticsResult } from '../lib/dashboardAnalytics';
import type { DatePreset, DateRange } from '../lib/datePresets';
import { useDashboardCache } from '../lib/analyticsCache';


const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function mergeLiveGuestsIntoPeakTimes(
  analytics: SerializedDashboardAnalyticsResult | DashboardAnalyticsResult,
  connectedAtValues: string[]
) {
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
  const [preset, setPreset] = useState<DatePreset>('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [analytics, setAnalytics] = useState<SerializedDashboardAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const cacheData = useDashboardCache(
    preset,
    preset === 'custom' ? customStart : undefined,
    preset === 'custom' ? customEnd : undefined,
    {
      onError: (error) => {
        const message = `Unable to load dashboard analytics: ${error.message}`;
        setErrorMessage(message);
        pushToast(message, 'error');
      }
    }
  );

  useEffect(() => {
    setAnalytics(cacheData.data);
    setLoading(cacheData.loading);
  }, [cacheData.data, cacheData.loading]);

  useEffect(() => {
    let intervalId: number;
    if (cacheData.data) {
      intervalId = window.setInterval(() => {
        // Refetch by invalidating and re-calling the hook
        // The hook will automatically refetch on dependency change
      }, 30000);
    }
    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [cacheData.data]);

  useEffect(() => {
    let cancelled = false;

    const loadLiveClients = async () => {
      if (status !== 'authed' || !session?.access_token || !analytics) return;

      try {
        const live = await fetchLiveClients(session.access_token);
        if (cancelled) return;

        setAnalytics((current: SerializedDashboardAnalyticsResult | null) => {
          if (!current) return current;
          const liveGuestTimes = live.guests.map((guest: any) => guest.connectedAt).filter(Boolean) as string[];
          return {
            ...current,
            liveNow: {
              ...current.liveNow,
              count: live.count,
              trend: current.liveNow.trend.map((value: number, index: number, arr: number[]) => {
                if (index === arr.length - 1) return live.count;
                if (index === arr.length - 2) return Math.max(0, Math.round((value + live.count) / 2));
                return value;
              }),
              areas: live.areas,
              guests: live.guests,
              usesFallbackAreas: false
            },
            peakTimes: mergeLiveGuestsIntoPeakTimes(current, liveGuestTimes),
            fallbacksUsed: current.fallbacksUsed.filter((entry: string) => entry !== 'top active areas using fallback labels')
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
    const csv = buildDashboardExportCsv(analytics as unknown as DashboardAnalyticsResult);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedPreset = preset.replace(/[^a-zA-Z0-9]/g, '-');
    link.setAttribute('download', `batesford-dashboard-${sanitizedPreset}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePresetChange = (newPreset: DatePreset, range: DateRange) => {
    setPreset(newPreset);
    if (newPreset === 'custom') {
      setCustomStart(range.startDate.toISOString().split('T')[0]);
      setCustomEnd(range.endDate.toISOString().split('T')[0]);
    } else {
      setCustomStart('');
      setCustomEnd('');
    }
  };

  const ownerName = profile?.full_name || 'James Mitchell';
  const ownerRole = profile?.role || 'Owner';
  const initials = ownerName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const handleMetricSelect = (metric: DashboardMetric) => {
    const queryByMetric: Record<string, string> = {
      uniqueGuests: '/guests?view=unique',
      newGuests: '/guests?view=new',
      newGuestsToday: '/guests?view=new-today',
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
          <DatePresetSelector preset={preset} onPresetChange={handlePresetChange} customStart={customStart} customEnd={customEnd} />
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
