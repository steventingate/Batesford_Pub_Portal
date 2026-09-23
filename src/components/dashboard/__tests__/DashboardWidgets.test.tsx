// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { VisitsChart } from '../DashboardWidgets';
import type { DashboardAnalyticsResult } from '../../../lib/dashboardAnalytics';

type VisitPoint = DashboardAnalyticsResult['visitsOverTime'][number];

function makeData(days: number): VisitPoint[] {
  return Array.from({ length: days }, (_, index) => ({
    isoDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
    label: `${index + 1} September 2026`,
    shortLabel: `${index + 1} Sep`,
    visits: 5 + index,
    uniqueGuests: 3 + index
  }));
}

afterEach(() => {
  cleanup();
});

describe('VisitsChart', () => {
  it('keeps the active hover point in range when analytics data shrinks', () => {
    const { container, rerender } = render(<VisitsChart data={makeData(7)} />);
    const hoverTargets = container.querySelectorAll('svg.visits-chart g');

    expect(hoverTargets.length).toBe(7);
    fireEvent.mouseEnter(hoverTargets[6]);

    rerender(<VisitsChart data={makeData(2)} />);

    expect(container.querySelector('.chart-tooltip')).not.toBeNull();
    expect(container.textContent).toContain('2 September 2026');
  });
});
