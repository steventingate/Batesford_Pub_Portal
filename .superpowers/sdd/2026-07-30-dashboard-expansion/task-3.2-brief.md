# Task 3.2: Build VisitsOverTimeChart Component with Recharts

**Goal:** Create `src/components/dashboard/VisitsOverTimeChart.tsx` — an interactive graph component using Recharts that displays visits over time with dual axes, tooltips, responsive design, and horizontal scrolling.

**Scope:** Install Recharts, build component, add CSS styling, comprehensive tests.

**Dependencies:**
- From Task 1.1: VisitPoint type from `dashboardAnalytics`
- React: useState, useEffect, basic hooks
- Recharts library (to be installed)

**Component Interface:**

```typescript
interface VisitsOverTimeChartProps {
  data: VisitPoint[];  // Array of {isoDate, label, shortLabel, visits, uniqueGuests}
  loading?: boolean;
  error?: Error | null;
}

export function VisitsOverTimeChart(props: VisitsOverTimeChartProps): JSX.Element
```

**Visual Design (from frontend-design review):**

- **Primary series (Visits):** Solid green line (#22c55e), weight 2.5px
- **Secondary series (Unique Guests):** Soft green gradient area underneath (same hue, 20% opacity)
- **Grid:** Subtle, light gray lines (rgba(255,255,255,0.08))
- **Tooltip:** Dark card (rgba(0,0,0,0.8)), white text, small green accent for metric name
  - Shows date, both values (Visits and Unique Guests)
- **Labels:** Small, light gray text on axes; show every 7th day to avoid crowding
- **Container:** Slight border or outline, light background tint to frame as a "viewport"
- **Responsive:** Mobile reduces height and hides secondary series in legend (but still draws it)

**Recharts Implementation:**

Use `ComposedChart` with:
- Line for visits (primary)
- Area for unique guests (secondary, with gradient fill)
- CartesianGrid with subtle styling
- Tooltip with custom component
- Legend with proper formatting
- XAxis with day labels (every 7th day)
- YAxis for both series

**Interactivity:**

- Hover tooltips show date, visit count, unique guest count
- Legend toggle (show/hide series)
- Responsive: adjust dimensions based on viewport
- Horizontal scroll container for 30+ day ranges

**Features:**

- ✅ Loading state (show Spinner)
- ✅ Error state (show error message)
- ✅ Empty state (show "no data" message)
- ✅ Responsive layout (desktop, tablet, mobile)
- ✅ Dark theme support (use CSS variables)
- ✅ Gradient fill for area chart
- ✅ Custom tooltip with colors and formatting

**Dependencies to Install:**

```bash
npm install recharts
npx shadcn-ui@latest add chart
```

**Files to Create:**

1. `src/components/dashboard/VisitsOverTimeChart.tsx` — main component
2. `src/components/dashboard/__tests__/VisitsOverTimeChart.test.tsx` — tests
3. CSS additions to dashboard stylesheet or inline styles

**Tests Required:**

1. `should render loading state`
2. `should render error state with message`
3. `should render empty state when no data`
4. `should render chart with data`
5. `should display tooltip on hover`
6. `should format labels correctly`
7. `should be responsive`

**Integration Notes:**

- Component will be used in Dashboard.tsx to replace the old SVG VisitsChart
- Receives data from `analytics.visitsOverTime` (array of VisitPoint)
- Component is pure; no data fetching inside
- Styling should match existing dashboard theme (dark mode, green accent)

**Deliverables:**

1. `src/components/dashboard/VisitsOverTimeChart.tsx` — fully implemented Recharts component
2. `src/components/dashboard/__tests__/VisitsOverTimeChart.test.tsx` — comprehensive tests
3. CSS styling added to dashboard stylesheet
4. Build passes (`npm run build` exit 0)
5. Tests pass
6. Commit: "feat: add VisitsOverTimeChart with Recharts and interactive tooltips"

**Quality Checklist:**

- ✅ Build passes (exit 0)
- ✅ All tests pass
- ✅ No `noUnusedLocals` violations
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Dark theme compatible
- ✅ Gradient area chart with dual axes
- ✅ Tooltip shows both metrics
- ✅ Horizontal scroll for large date ranges
- ✅ Loading/error/empty states

