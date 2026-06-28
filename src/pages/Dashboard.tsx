import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';
import {
  ConsentRateWidget,
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

export default function Dashboard() {
  const { pushToast } = useToast();
  const { session, status } = useAuth();
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
          return {
            ...current,
            liveNow: {
              ...current.liveNow,
              count: live.count,
              trend: current.liveNow.trend.map((value, index, arr) => {
                if (index === arr.length - 1) return Math.max(live.count, 1);
                if (index === arr.length - 2) return Math.max(1, Math.round((value + live.count) / 2));
                return value;
              }),
              areas: live.areas.length ? live.areas : current.liveNow.areas,
              guests: live.guests,
              usesFallbackAreas: false
            },
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
  }, [analytics?.range.label, preset, session?.access_token, status]);

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
        <button type="button" className="dashboard-menu-button" aria-label="Open menu">
          <span />
          <span />
          <span />
        </button>
        <div className="dashboard-right-actions">
          <div className="dashboard-top-status">
            <span className="dashboard-badge-dot">3</span>
            <button type="button" className="dashboard-icon-button" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17a2 2 0 0 1-.6 1.43L4 17h5" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
            </button>
          </div>
          <div className="dashboard-owner-pill">
            <div className="dashboard-owner-avatar">JM</div>
            <div>
              <strong>James Mitchell</strong>
              <span>Owner</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Real-time insights into your guests and venue performance</p>
        </div>
        <div className="dashboard-header-actions">
          <label className="dashboard-select-pill">
            <span className="dashboard-select-icon">📅</span>
            <select value={preset} onChange={(event) => setPreset(event.target.value as DashboardRangePreset)}>
              <option value="last7">{analytics?.range.label || '21 Jun - 28 Jun 2026'}</option>
              <option value="last30">Last 30 days</option>
            </select>
          </label>
          <label className="dashboard-select-pill compare-pill">
            <select value={preset} onChange={(event) => setPreset(event.target.value as DashboardRangePreset)}>
              <option value="last7">Compare: Previous 7 days</option>
              <option value="last30">Compare: Previous 30 days</option>
            </select>
          </label>
          <Button onClick={handleExport}>Export Report</Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="dashboard-error-banner">
          <strong>Analytics warning</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {analytics ? <MetricCards metrics={analytics.metrics} /> : null}

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
    </div>
  );
}
