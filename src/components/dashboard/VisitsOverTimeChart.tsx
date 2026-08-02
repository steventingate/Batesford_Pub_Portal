import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Spinner } from '../ui/Spinner';
import type { DashboardAnalyticsResult } from '../../lib/dashboardAnalytics';

export type VisitPoint = DashboardAnalyticsResult['visitsOverTime'][number];

const VISITS_COLOR = '#22c55e';
const UNIQUE_GUESTS_COLOR = '#4ade80';
const GRADIENT_ID = 'visitsUniqueGuestsGradient';

const SERIES = {
  visits: { key: 'visits', name: 'Visits', color: VISITS_COLOR },
  uniqueGuests: { key: 'uniqueGuests', name: 'Unique Guests', color: UNIQUE_GUESTS_COLOR }
} as const;

/** Breakpoint past which a range is wide enough to need horizontal scrolling. */
const SCROLL_THRESHOLD_DAYS = 30;
/** Horizontal room each day needs before labels start colliding. */
const PX_PER_DAY = 34;

/**
 * Recharts renders every Nth+1 tick, so `interval={6}` yields every 7th day.
 * Short ranges stay fully labelled.
 */
export function getTickInterval(pointCount: number): number {
  return pointCount > 14 ? 6 : 0;
}

/** Chart height tiers: mobile, tablet, desktop. */
export function getChartHeight(viewportWidth: number): number {
  if (viewportWidth < 640) return 220;
  if (viewportWidth < 1024) return 260;
  return 300;
}

/** Ranges of 30+ days get a horizontally scrollable viewport. */
export function isScrollableRange(pointCount: number): boolean {
  return pointCount >= SCROLL_THRESHOLD_DAYS;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}

export type VisitsTooltipPayloadItem = {
  dataKey?: string | number;
  value?: number | string;
  payload?: VisitPoint;
};

export type VisitsTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: VisitsTooltipPayloadItem[];
};

/**
 * Dark tooltip card. Reads the whole datum off the payload so both metrics stay
 * visible even when one series has been toggled off via the legend.
 */
export function VisitsTooltip({ active, payload, label }: VisitsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="visits-chart-tooltip" role="tooltip">
      <div className="visits-chart-tooltip-date">{point.label ?? label}</div>
      <div className="visits-chart-tooltip-row">
        <span className="visits-chart-tooltip-swatch" style={{ background: SERIES.visits.color }} />
        <span className="visits-chart-tooltip-name">{SERIES.visits.name}</span>
        <strong className="visits-chart-tooltip-value">{point.visits}</strong>
      </div>
      <div className="visits-chart-tooltip-row">
        <span
          className="visits-chart-tooltip-swatch"
          style={{ background: SERIES.uniqueGuests.color }}
        />
        <span className="visits-chart-tooltip-name">{SERIES.uniqueGuests.name}</span>
        <strong className="visits-chart-tooltip-value">{point.uniqueGuests}</strong>
      </div>
    </div>
  );
}

export type VisitsOverTimeChartProps = {
  data: VisitPoint[];
  loading?: boolean;
  error?: Error | null;
};

export function VisitsOverTimeChart({ data, loading, error }: VisitsOverTimeChartProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const viewportWidth = useViewportWidth();

  const isMobile = viewportWidth < 640;
  const chartHeight = getChartHeight(viewportWidth);
  const scrollable = isScrollableRange(data.length);
  const tickInterval = getTickInterval(data.length);

  // Recharts types dataKey as string | number | accessor fn; only our string keys toggle.
  const toggleSeries = useCallback((key: unknown) => {
    if (typeof key !== 'string') return;
    setHiddenSeries((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const summary = useMemo(() => {
    if (data.length === 0) return 'Visits over time';
    const totalVisits = data.reduce((sum, point) => sum + point.visits, 0);
    return `Visits over time: ${totalVisits} visits across ${data.length} days, from ${data[0].label} to ${data[data.length - 1].label}`;
  }, [data]);

  if (loading) {
    return (
      <div className="visits-chart-state" role="status" aria-live="polite">
        <Spinner label="Loading visits…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="visits-chart-state visits-chart-error" role="alert">
        <p className="visits-chart-error-title">Could not load visits</p>
        <p className="visits-chart-error-message">{error.message}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="visits-chart-state dashboard-empty-state">No visit data for this period</div>
    );
  }

  return (
    <div className="visits-chart-container" role="img" aria-label={summary}>
      <div className="visits-chart-scroll">
        <div
          className="visits-chart-inner"
          style={scrollable ? { minWidth: data.length * PX_PER_DAY } : undefined}
        >
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -12 }}>
              <defs>
                <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={UNIQUE_GUESTS_COLOR} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={UNIQUE_GUESTS_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                vertical={false}
                stroke="var(--visits-chart-grid)"
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="shortLabel"
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={4}
                tick={{ fill: 'var(--visits-chart-axis)', fontSize: 12 }}
              />

              {/* Both series are plain visit counts, so they share one axis —
                  unique guests is a subset of visits and separate scales would
                  make the area appear to exceed the line. */}
              <YAxis
                allowDecimals={false}
                width={48}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--visits-chart-axis)', fontSize: 12 }}
              />

              <Tooltip
                content={<VisitsTooltip />}
                cursor={{ stroke: 'var(--visits-chart-cursor)', strokeDasharray: '4 4' }}
              />

              {!isMobile && (
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  onClick={(entry) => toggleSeries(entry.dataKey)}
                  formatter={(value: string) => (
                    <span className="visits-chart-legend-label">{value}</span>
                  )}
                />
              )}

              <Area
                type="monotone"
                dataKey={SERIES.uniqueGuests.key}
                name={SERIES.uniqueGuests.name}
                stroke={UNIQUE_GUESTS_COLOR}
                strokeWidth={1.5}
                strokeOpacity={0.6}
                fill={`url(#${GRADIENT_ID})`}
                hide={hiddenSeries[SERIES.uniqueGuests.key]}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />

              <Line
                type="monotone"
                dataKey={SERIES.visits.key}
                name={SERIES.visits.name}
                stroke={VISITS_COLOR}
                strokeWidth={2.5}
                strokeLinecap="round"
                dot={false}
                hide={hiddenSeries[SERIES.visits.key]}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--visits-chart-dot-ring)' }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      {scrollable && (
        <p className="visits-chart-scroll-hint">Scroll horizontally to see the full range</p>
      )}
    </div>
  );
}
