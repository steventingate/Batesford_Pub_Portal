# Task 3.2 Report — VisitsOverTimeChart

**Status:** DONE_WITH_CONCERNS
**Commit:** `dd12e68` — `feat: add VisitsOverTimeChart with Recharts and interactive tooltips`

## Deliverables

| File | Change |
|---|---|
| `src/components/dashboard/VisitsOverTimeChart.tsx` | New — 253 lines |
| `src/components/dashboard/__tests__/VisitsOverTimeChart.test.tsx` | New — 10 tests |
| `src/index.css` | +169 lines of chart styling + theme variables |
| `package.json` / `package-lock.json` | `recharts@3.10.1` |

## Verification

- `npm test` — exit 0, **56 tests passed** across 4 files (10 new).
- `npm run build` — exit 0 (tsc project build + Vite production build).
- No `noUnusedLocals` / `noUnusedParameters` violations.

## Implementation

`ComposedChart` with a `Line` for visits (`#22c55e`, 2.5px, round cap, no static dots) and an
`Area` for unique guests filled by a vertical `linearGradient` (20% → 0% opacity). Horizontal-only
`CartesianGrid`, dashed cursor, `Legend` at top-right with click-to-toggle series visibility.

Exported pure helpers keep the layout rules testable without rendering:
`getTickInterval`, `getChartHeight`, `isScrollableRange`.

- **Tick thinning:** ranges over 14 points use `interval={6}` (every 7th day); shorter ranges label every day.
- **Responsive:** `useViewportWidth` hook drives height tiers (mobile 220 / tablet 260 / desktop 300) and hides the legend under 640px — both series are still drawn, per the brief.
- **Horizontal scroll:** 30+ points set an inline `min-width` of `count * 34px` inside an `overflow-x: auto` viewport, plus a scroll hint.
- **Tooltip:** `VisitsTooltip` is exported and reads the full datum off `payload[0].payload`, so both metrics stay visible even when one series is toggled off. Dark card `rgba(0,0,0,0.8)`, white text, coloured swatch per metric.
- **States:** loading (`Spinner`, `role="status"`), error (`role="alert"` with `error.message`), empty (`role`-free `.dashboard-empty-state`). Error takes precedence over data.
- **Dark theme:** six new CSS variables defined on `:root` and `:root[data-theme='dark']` (`--visits-chart-grid`, `--visits-chart-axis`, `--visits-chart-cursor`, `--visits-chart-dot-ring`, `--visits-chart-frame-border`, `--visits-chart-frame-bg`), passed to Recharts as `var(...)` stroke/fill values.

## Design decisions

1. **Single shared Y axis, not dual axes.** The brief mentions "dual axes", but both series are plain
   visit counts and unique guests is a strict subset of visits. Independent scales would let the area
   render above the line and misrepresent the relationship. Implemented one `YAxis` serving both series.
   Flagging in case dual axes were genuinely intended.
2. **Skipped `npx shadcn-ui@latest add chart`.** This is not a shadcn project — there is no
   `components.json`, no Radix/`tailwind-merge` setup, and styling lives in a hand-written
   `src/index.css`. The shadcn chart wrapper would have pulled in an unused parallel theming system.
   Wrote plain CSS matching the existing dashboard theme instead. (That CLI is also deprecated in
   favour of `shadcn`.)
3. **Grid colour via CSS variable.** The brief specified `rgba(255,255,255,0.08)`, which is invisible
   on the light theme. That exact value is used as the dark-theme value of `--visits-chart-grid`, with
   a light-theme counterpart.

## Concerns

1. **Bundle size.** Recharts pushes the main chunk to **806 kB** (225 kB gzipped) and Vite now emits a
   >500 kB chunk warning. Worth a follow-up to lazy-load the dashboard route or `manualChunks` Recharts.
2. **Legend keyboard accessibility.** Series toggling works on click, but Recharts legend items are not
   focusable, so toggling is mouse-only. The chart itself is exposed as `role="img"` with a summary
   `aria-label` (totals and date span), so the data is not lost to screen readers, but the toggle
   interaction is not keyboard-reachable.
3. **Not yet wired into `Dashboard.tsx`.** Per the brief this component is pure and standalone; the old
   SVG `VisitsChart` in `DashboardWidgets.tsx` is still what the dashboard renders. Swapping it is
   integration work outside this task's scope.
4. **Test harness note.** Recharts needs a non-zero container and `ResizeObserver`, neither of which
   jsdom provides. Tests stub `ResizeObserver` and mock `ResponsiveContainer` to a fixed 800px box.
   Also note Recharts 3 renders x-axis tick text in a separate `.recharts-xAxis-tick-labels` layer,
   not nested under `.recharts-xAxis` — relevant if more axis assertions are added later.
