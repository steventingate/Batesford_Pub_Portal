import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { DashboardAnalyticsResult } from '../../lib/dashboardAnalytics';

export type DashboardMetric = DashboardAnalyticsResult['metrics'][number];
type Metric = DashboardMetric;
type VisitPoint = DashboardAnalyticsResult['visitsOverTime'][number];
type StatusSlice = DashboardAnalyticsResult['guestStatus']['slices'][number];
type Insight = DashboardAnalyticsResult['insights'][number];

const accentStyles = {
  green: { glow: 'rgba(34,197,94,0.22)', line: '#22c55e', bubble: 'rgba(34,197,94,0.14)' },
  lime: { glow: 'rgba(163,230,53,0.22)', line: '#a3e635', bubble: 'rgba(163,230,53,0.14)' },
  purple: { glow: 'rgba(168,85,247,0.22)', line: '#c084fc', bubble: 'rgba(168,85,247,0.14)' },
  blue: { glow: 'rgba(59,130,246,0.22)', line: '#3b82f6', bubble: 'rgba(59,130,246,0.14)' },
  amber: { glow: 'rgba(245,158,11,0.22)', line: '#facc15', bubble: 'rgba(245,158,11,0.14)' },
  teal: { glow: 'rgba(20,184,166,0.22)', line: '#14b8a6', bubble: 'rgba(20,184,166,0.14)' }
} as const;

function DashboardCard({
  title,
  action,
  children,
  className
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('dashboard-card', className)}>
      <header className="dashboard-card-header">
        <div>{title}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="dashboard-empty-state">{message}</div>;
}

function Icon({ kind }: { kind: 'users' | 'user-plus' | 'returning' | 'wifi' | 'mail' | 'phone' | 'activity' | 'clock' | 'pin' | 'star' | 'bell' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'user-plus':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M16 11h6" /></svg>;
    case 'returning':
      return <svg {...common}><path d="M17 3h4v4" /><path d="M20 7a8 8 0 1 0 1.4 5.1" /><path d="M8 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" /><path d="M14 17a5 5 0 0 0-12 0" /></svg>;
    case 'wifi':
      return <svg {...common}><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><path d="M12 20h.01" /><path d="M2 8.82a16 16 0 0 1 20 0" /></svg>;
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case 'phone':
      return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.77 19.77 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.77 19.77 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.88.32 1.74.59 2.56a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.52-1.25a2 2 0 0 1 2.11-.45c.82.27 1.68.47 2.56.59A2 2 0 0 1 22 16.92Z" /></svg>;
    case 'activity':
      return <svg {...common}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case 'pin':
      return <svg {...common}><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z" /><circle cx="12" cy="11" r="2.5" /></svg>;
    case 'star':
      return <svg {...common}><path d="m12 3 2.7 5.46 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6L3.27 9.34l6.03-.88L12 3Z" /></svg>;
    case 'bell':
      return <svg {...common}><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17a2 2 0 0 1-.6 1.43L4 17h5" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>;
    default:
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
}

function MiniSparkline({ values, accent }: { values: number[]; accent: Metric['accent'] }) {
  const points = useMemo(() => {
    const safe = values.length ? values : [0];
    const max = Math.max(...safe, 1);
    return safe.map((value, index) => {
      const x = safe.length === 1 ? 0 : (index / (safe.length - 1)) * 100;
      const y = 38 - (value / max) * 24;
      return `${x},${y}`;
    }).join(' ');
  }, [values]);

  const style = accentStyles[accent];
  return (
    <svg viewBox="0 0 100 40" className="metric-sparkline" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`metric-glow-${accent}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={style.line} stopOpacity="0.18" />
          <stop offset="100%" stopColor={style.line} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={`M0 40 L${points} L100 40 Z`} fill={`url(#metric-glow-${accent})`} />
      <polyline points={points} fill="none" stroke={style.line} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MetricCards({ metrics, onSelect }: { metrics: Metric[]; onSelect?: (metric: DashboardMetric) => void }) {
  const iconMap: Record<string, Parameters<typeof Icon>[0]['kind']> = {
    uniqueGuests: 'users',
    newGuests: 'user-plus',
    returningGuests: 'returning',
    totalVisits: 'wifi',
    withEmail: 'mail',
    withMobile: 'phone'
  };

  return (
    <div className="dashboard-metrics">
      {metrics.map((metric) => {
        const accent = accentStyles[metric.accent];
        return (
          <button
            key={metric.key}
            type="button"
            className="metric-card metric-card-button"
            style={{ '--metric-glow': accent.glow } as React.CSSProperties}
            onClick={() => onSelect?.(metric)}
          >
            <div className="metric-card-top">
              <div className="metric-icon" style={{ background: accent.bubble, color: accent.line }}>
                <Icon kind={iconMap[metric.key] || 'users'} />
              </div>
              <div className={clsx('metric-delta', metric.delta > 0 ? 'is-up' : metric.delta < 0 ? 'is-down' : 'is-flat')}>
                {metric.delta > 0 ? '+' : metric.delta < 0 ? '-' : ''}{Math.abs(metric.delta)}%
              </div>
            </div>
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
            <div className="metric-helper">{metric.helper}</div>
            <MiniSparkline values={metric.trend} accent={metric.accent} />
          </button>
        );
      })}
    </div>
  );
}

export function VisitsChart({ data }: { data: VisitPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(data.length ? data.length - 1 : null);
  const safe = data.length ? data : [{ isoDate: '', label: 'No data', shortLabel: 'No data', visits: 0, uniqueGuests: 0 }];
  const max = Math.max(...safe.flatMap((point) => [point.visits, point.uniqueGuests]), 1);
  const toPoints = (key: 'visits' | 'uniqueGuests') =>
    safe.map((point, index) => {
      const x = safe.length === 1 ? 20 : 20 + (index / (safe.length - 1)) * 560;
      const y = 210 - (point[key] / max) * 150;
      return { x, y, value: point[key], label: point.label };
    });

  const visitPoints = toPoints('visits');
  const uniquePoints = toPoints('uniqueGuests');
  const activeIndex = hoverIndex ?? safe.length - 1;

  return (
    <DashboardCard
      className="span-6"
      title={<><h3>Visits Over Time</h3><p>By day</p></>}
      action={<button type="button" className="dashboard-icon-button" aria-label="Download"><Icon kind="activity" /></button>}
    >
      <div className="chart-legend">
        <span><i className="solid-legend" /> Visits</span>
        <span><i className="dashed-legend" /> Unique Guests</span>
      </div>
      <div className="visits-chart-wrap">
        <svg viewBox="0 0 600 260" className="visits-chart">
          {[0, 1, 2, 3].map((line) => (
            <line key={line} x1="20" y1={40 + line * 50} x2="580" y2={40 + line * 50} className="chart-grid-line" />
          ))}
          <polyline fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" points={visitPoints.map((point) => `${point.x},${point.y}`).join(' ')} />
          <polyline fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" points={uniquePoints.map((point) => `${point.x},${point.y}`).join(' ')} />
          {visitPoints.map((point, index) => (
            <g key={`${point.label}-${index}`} onMouseEnter={() => setHoverIndex(index)}>
              <circle cx={point.x} cy={point.y} r="3.8" fill="#22c55e" />
              <circle cx={uniquePoints[index].x} cy={uniquePoints[index].y} r="3.2" fill="#94a3b8" />
            </g>
          ))}
          {hoverIndex !== null ? (
            <>
              <line x1={visitPoints[activeIndex].x} y1="28" x2={visitPoints[activeIndex].x} y2="220" className="chart-focus-line" />
              <foreignObject x={Math.max(18, visitPoints[activeIndex].x - 54)} y="26" width="124" height="88">
                <div className="chart-tooltip">
                  <div className="chart-tooltip-date">{safe[activeIndex].label}</div>
                  <div className="chart-tooltip-row"><span className="green-dot" /> Visits <strong>{visitPoints[activeIndex].value}</strong></div>
                  <div className="chart-tooltip-row"><span className="blue-dot" /> Unique Guests <strong>{uniquePoints[activeIndex].value}</strong></div>
                </div>
              </foreignObject>
            </>
          ) : null}
        </svg>
        <div className="chart-x-axis">
          {safe.map((point, index) => (
            <span key={point.isoDate || index}>{point.shortLabel}</span>
          ))}
        </div>
      </div>
    </DashboardCard>
  );
}

export function GuestsByStatus({ total, slices }: { total: number; slices: StatusSlice[] }) {
  const circumference = 2 * Math.PI * 70;
  let offset = 0;
  return (
    <DashboardCard className="span-3" title={<><h3>Guests By Status</h3></>}>
      <div className="status-card">
        <div className="status-donut-wrap">
          <svg viewBox="0 0 180 180" className="status-donut">
            <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="22" />
            {slices.map((slice) => {
              const dash = circumference * (slice.percentage / 100);
              const circle = (
                <circle
                  key={slice.label}
                  cx="90"
                  cy="90"
                  r="70"
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="22"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return circle;
            })}
          </svg>
          <div className="status-donut-center">
            <strong>{total}</strong>
            <span>Total Guests</span>
          </div>
        </div>
        <div className="status-legend">
          {slices.map((slice) => (
            <div key={slice.label} className="status-legend-row">
              <div className="status-legend-label">
                <span className="status-legend-dot" style={{ background: slice.color }} />
                {slice.label}
              </div>
              <div className="status-legend-value">{slice.value} <span>{slice.percentage}%</span></div>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  );
}

export function LiveNowPanel({
  liveNow,
  onViewAll
}: {
  liveNow: DashboardAnalyticsResult['liveNow'];
  onViewAll?: () => void;
}) {
  const maxArea = Math.max(...liveNow.areas.map((item) => item.value), 1);
  return (
    <DashboardCard
      className="span-3"
      title={<><h3>Live Now</h3></>}
      action={<button type="button" className="dashboard-link-button" onClick={onViewAll}>View All</button>}
    >
      <div className="live-panel-top">
        <div>
          <div className="live-count">{liveNow.count}</div>
          <div className="live-label">Guests online now</div>
        </div>
        <div className="live-trend">
          <MiniSparkline values={liveNow.trend} accent="green" />
        </div>
      </div>
      <div className="live-section-title">Top Active Areas</div>
      {liveNow.areas.length ? (
        <div className="live-area-list">
          {liveNow.areas.map((area, index) => (
            <div key={area.label} className="live-area-row">
              <span>{area.label}</span>
              <strong>{area.value}</strong>
              <div className="live-area-bar">
                <div style={{ width: `${(area.value / maxArea) * 100}%` }} className={clsx('live-area-fill', `tone-${index}`)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No active access points right now." />
      )}
      <div className="live-section-title">Connected Users</div>
      {liveNow.guests.length ? (
        <div className="live-guest-list">
          {liveNow.guests.map((guest) => (
            <div key={guest.key} className="live-guest-row">
              <div>
                <div className="live-guest-name">{guest.name}</div>
                <div className="live-guest-meta">{guest.contact} / {guest.area}</div>
              </div>
              <div className="live-guest-time">{guest.timeLabel}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No connected guests are currently online." />
      )}
    </DashboardCard>
  );
}

export function PeakTimesHeatmap({ peakTimes }: { peakTimes: DashboardAnalyticsResult['peakTimes'] }) {
  const max = Math.max(...peakTimes.cells.map((cell) => cell.value), 1);
  return (
    <DashboardCard className="span-4" title={<><h3>Peak Times</h3><p>By Hour</p></>} action={<button type="button" className="dashboard-filter-button">All Days</button>}>
      <div className="heatmap-grid">
        <div className="heatmap-days">
          {peakTimes.days.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="heatmap-cells">
          {peakTimes.days.map((day) => (
            <div key={day} className="heatmap-row">
              {peakTimes.cells.filter((cell) => cell.day === day).map((cell) => (
                <div key={`${day}-${cell.hour}`} className="heatmap-cell" title={`${day} ${cell.label}: ${cell.value} visits`} style={{ opacity: 0.12 + (cell.value / max) * 0.88 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-hours">
        {['12AM', '3AM', '6AM', '9AM', '12PM', '3PM', '6PM', '9PM', '12AM'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </DashboardCard>
  );
}

export function NewVsReturningChart({ data }: { data: DashboardAnalyticsResult['newVsReturning'] }) {
  const max = Math.max(...data.map((point) => point.newGuests + point.returningGuests), 1);
  return (
    <DashboardCard className="span-4" title={<><h3>New vs Returning Guests</h3></>} action={<button type="button" className="dashboard-filter-button">By day</button>}>
      <div className="chart-legend">
        <span><i className="legend-green" /> New Guests</span>
        <span><i className="legend-blue" /> Returning Guests</span>
      </div>
      <div className="stacked-bars">
        {data.map((point) => {
          const total = point.newGuests + point.returningGuests;
          const totalHeight = (total / max) * 100;
          const newHeight = total ? (point.newGuests / total) * 100 : 0;
          const returningHeight = total ? (point.returningGuests / total) * 100 : 0;
          return (
            <div key={point.label} className="stacked-bar-col">
              <div className="stacked-bar-track" title={`${point.label}: ${point.newGuests} new, ${point.returningGuests} returning`} style={{ height: `${Math.max(12, totalHeight)}%` }}>
                <div className="stacked-bar-new" style={{ height: `${newHeight}%` }} />
                <div className="stacked-bar-returning" style={{ height: `${returningHeight}%` }} />
              </div>
              <span>{point.label}</span>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

export function ConsentRateWidget({ consent }: { consent: DashboardAnalyticsResult['consent'] }) {
  const circumference = 2 * Math.PI * 56;
  const dash = circumference * (consent.rate / 100);
  return (
    <DashboardCard className="span-2" title={<><h3>Consent Rate</h3></>}>
      <div className="consent-widget">
        <div className="consent-ring-wrap">
          <svg viewBox="0 0 144 144" className="consent-ring">
            <circle cx="72" cy="72" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" />
            <circle cx="72" cy="72" r="56" fill="none" stroke="#22c55e" strokeWidth="16" strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" transform="rotate(-90 72 72)" />
          </svg>
          <div className="consent-ring-center">
            <strong>{consent.rate}%</strong>
            <span>Consented</span>
          </div>
        </div>
        <div className="consent-detail-list">
          <div><span>Consented</span><strong>{consent.consented}</strong><em className={consent.consentedDelta >= 0 ? 'up' : 'down'}>{consent.consentedDelta >= 0 ? '+' : '-'}{Math.abs(consent.consentedDelta)}%</em></div>
          <div><span>Not Consented</span><strong>{consent.notConsented}</strong><em className={consent.notConsentedDelta >= 0 ? 'up' : 'down'}>{consent.notConsentedDelta >= 0 ? '+' : '-'}{Math.abs(consent.notConsentedDelta)}%</em></div>
          <div><span>Unsubscribed</span><strong>{consent.unsubscribed}</strong><em className={consent.unsubscribedDelta >= 0 ? 'up' : 'down'}>{consent.unsubscribedDelta >= 0 ? '+' : '-'}{Math.abs(consent.unsubscribedDelta)}%</em></div>
        </div>
      </div>
    </DashboardCard>
  );
}

export function TopPostcodesPanel({ rows }: { rows: DashboardAnalyticsResult['topPostcodes'] }) {
  const max = Math.max(...rows.map((row) => row.percentage), 1);
  return (
    <DashboardCard className="span-2" title={<><h3>Top Postcodes</h3></>} action={<button type="button" className="dashboard-link-button">View All</button>}>
      {rows.length ? (
        <div className="postcode-list">
          {rows.map((row) => (
            <div key={row.postcode} className="postcode-row">
              <div className="postcode-row-top">
                <span>{row.postcode}</span>
                <strong>{row.percentage}%</strong>
              </div>
              <div className="postcode-bar"><div style={{ width: `${(row.percentage / max) * 100}%` }} /></div>
              <div className="postcode-row-meta">{row.guests} guests</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No postcode data captured in this range." />
      )}
    </DashboardCard>
  );
}

export function KeyInsightsStrip({ insights }: { insights: Insight[] }) {
  return (
    <section className="insights-strip">
      <div className="insights-strip-heading">
        <div className="insights-strip-icon"><Icon kind="activity" /></div>
        <div><h3>Key Insights</h3></div>
      </div>
      <div className="insights-strip-grid">
        {insights.map((insight) => (
          <article key={insight.title} className="insight-item">
            <div className={clsx('insight-icon', `insight-${insight.accent}`)}>
              <Icon kind={insight.icon === 'trend' ? 'activity' : insight.icon === 'pin' ? 'pin' : insight.icon === 'clock' ? 'clock' : insight.icon === 'mail' ? 'mail' : 'star'} />
            </div>
            <div>
              <h4>{insight.title}</h4>
              <p>{insight.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="dashboard-metrics">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="dashboard-skeleton-card" />)}
      </div>
      <div className="dashboard-grid">
        {Array.from({ length: 7 }, (_, index) => <div key={index} className="dashboard-skeleton-panel" />)}
      </div>
    </div>
  );
}
