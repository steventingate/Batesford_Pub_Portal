// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  VisitsOverTimeChart,
  VisitsTooltip,
  getTickInterval,
  getChartHeight,
  isScrollableRange,
  type VisitPoint
} from '../VisitsOverTimeChart';

// Recharts measures its container with ResizeObserver and refuses to draw at zero
// size. jsdom provides neither, so stub the observer and force ResponsiveContainer
// to a fixed desktop-ish box.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children, height }: { children: React.ReactNode; height?: number }) => (
      <div className="mock-responsive-container" style={{ width: 800, height: height ?? 300 }}>
        <actual.ResponsiveContainer width={800} height={height ?? 300}>
          {children as React.ReactElement}
        </actual.ResponsiveContainer>
      </div>
    )
  };
});

function makeData(days: number): VisitPoint[] {
  return Array.from({ length: days }, (_, index) => ({
    isoDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
    label: `${index + 1} July 2026`,
    shortLabel: `${index + 1} Jul`,
    visits: 10 + index,
    uniqueGuests: 5 + index
  }));
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
}

afterEach(() => {
  cleanup();
  setViewportWidth(1024);
  vi.restoreAllMocks();
});

describe('VisitsOverTimeChart', () => {
  it('should render loading state', () => {
    const { container } = render(<VisitsOverTimeChart data={[]} loading />);

    const status = screen.getByRole('status');
    expect(status).toBeDefined();
    expect(status.textContent).toContain('Loading visits');
    // No chart is drawn while loading.
    expect(container.querySelector('.recharts-surface')).toBeNull();
  });

  it('should render error state with message', () => {
    const { container } = render(
      <VisitsOverTimeChart data={makeData(5)} error={new Error('Analytics fetch failed')} />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('Analytics fetch failed');
    // Error takes precedence over data.
    expect(container.querySelector('.recharts-surface')).toBeNull();
  });

  it('should render empty state when no data', () => {
    const { container } = render(<VisitsOverTimeChart data={[]} />);

    expect(screen.getByText('No visit data for this period')).toBeDefined();
    expect(container.querySelector('.recharts-surface')).toBeNull();
  });

  it('should render chart with data', () => {
    const { container } = render(<VisitsOverTimeChart data={makeData(7)} />);

    // Recharts drew a real surface with both series.
    expect(container.querySelector('.recharts-surface')).not.toBeNull();
    expect(container.querySelector('.recharts-line')).not.toBeNull();
    expect(container.querySelector('.recharts-area')).not.toBeNull();
    expect(container.querySelector('.recharts-cartesian-grid')).not.toBeNull();

    // Gradient fill for the area series is defined.
    expect(container.querySelector('linearGradient#visitsUniqueGuestsGradient')).not.toBeNull();

    // Legend labels both series.
    expect(screen.getByText('Visits')).toBeDefined();
    expect(screen.getByText('Unique Guests')).toBeDefined();

    // Accessible description of the chart.
    expect(screen.getByRole('img', { name: /visits over time/i })).toBeDefined();
  });

  it('should display tooltip on hover', () => {
    const point = makeData(1)[0];
    render(
      <VisitsTooltip
        active
        label={point.shortLabel}
        payload={[{ dataKey: 'visits', value: point.visits, payload: point }]}
      />
    );

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeDefined();
    // Full date label, not the abbreviated axis label.
    expect(tooltip.textContent).toContain('1 July 2026');
    // Both metrics are shown even though only one series is in the payload.
    expect(tooltip.textContent).toContain('Visits');
    expect(tooltip.textContent).toContain('10');
    expect(tooltip.textContent).toContain('Unique Guests');
    expect(tooltip.textContent).toContain('5');
  });

  it('should not render tooltip when inactive or payload is empty', () => {
    const { container: inactive } = render(<VisitsTooltip active={false} payload={[]} />);
    expect(inactive.querySelector('[role="tooltip"]')).toBeNull();

    cleanup();

    const { container: noPayload } = render(<VisitsTooltip active payload={[]} />);
    expect(noPayload.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('should format labels correctly', () => {
    // Short ranges label every day; long ranges thin out to every 7th day.
    expect(getTickInterval(7)).toBe(0);
    expect(getTickInterval(14)).toBe(0);
    expect(getTickInterval(15)).toBe(6);
    expect(getTickInterval(30)).toBe(6);

    const { container } = render(<VisitsOverTimeChart data={makeData(7)} />);
    const axisText = Array.from(
      container.querySelectorAll('.recharts-xAxis-tick-labels text')
    ).map((node) => node.textContent);
    // Axis uses the abbreviated label, not the ISO date.
    expect(axisText).toContain('1 Jul');
    expect(axisText.join(' ')).not.toContain('2026-07-01');
  });

  it('should be responsive', () => {
    // Desktop: full height, legend visible.
    const desktop = render(<VisitsOverTimeChart data={makeData(7)} />);
    expect(desktop.container.querySelector('.recharts-legend-wrapper')).not.toBeNull();
    cleanup();

    // Mobile: shorter chart, legend hidden (series are still drawn).
    setViewportWidth(375);
    const mobile = render(<VisitsOverTimeChart data={makeData(7)} />);
    expect(mobile.container.querySelector('.recharts-legend-wrapper')).toBeNull();
    expect(mobile.container.querySelector('.recharts-line')).not.toBeNull();
    expect(mobile.container.querySelector('.recharts-area')).not.toBeNull();

    // Height tiers are distinct and shrink towards mobile.
    expect(getChartHeight(1440)).toBeGreaterThan(getChartHeight(800));
    expect(getChartHeight(800)).toBeGreaterThan(getChartHeight(375));
  });

  it('should react to viewport resize', () => {
    const { container } = render(<VisitsOverTimeChart data={makeData(7)} />);
    expect(container.querySelector('.recharts-legend-wrapper')).not.toBeNull();

    act(() => {
      setViewportWidth(375);
      window.dispatchEvent(new Event('resize'));
    });

    expect(container.querySelector('.recharts-legend-wrapper')).toBeNull();
  });

  it('should enable horizontal scroll for 30+ day ranges', () => {
    const short = render(<VisitsOverTimeChart data={makeData(7)} />);
    const shortInner = short.container.querySelector<HTMLElement>('.visits-chart-inner');
    expect(shortInner).not.toBeNull();
    expect(shortInner!.style.minWidth).toBe('');
    cleanup();

    const long = render(<VisitsOverTimeChart data={makeData(30)} />);
    const longInner = long.container.querySelector<HTMLElement>('.visits-chart-inner');
    expect(longInner).not.toBeNull();
    expect(longInner!.style.minWidth).not.toBe('');
    expect(parseInt(longInner!.style.minWidth, 10)).toBeGreaterThan(800);

    expect(isScrollableRange(29)).toBe(false);
    expect(isScrollableRange(30)).toBe(true);
  });
});
