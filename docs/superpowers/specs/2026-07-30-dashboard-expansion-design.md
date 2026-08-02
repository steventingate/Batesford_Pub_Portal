# Dashboard Expansion Design
**Date:** 2026-07-30  
**Scope:** Multi-feature expansion: date filtering, caching layer, graph upgrade, email reporting  
**Target Users:** Management (venue operators)  
**Tech Stack:** React + Supabase + Recharts + Resend API

---

## Overview

This design expands the Batesford Hotel admin dashboard with four interconnected features:
1. **Date Preset Filtering** — Quick-access buttons for common time ranges (today, yesterday, this week, this month)
2. **Dual-Layer Caching** — Client-side (localStorage, 5min TTL) + server-side (Edge Function, 10min TTL) for faster data loads
3. **Interactive Graph Upgrade** — Replace SVG chart with Recharts component; add scrolling, tooltips, responsiveness
4. **Weekly Email Reporting** — Automated + manual weekly reports with HTML email and CSV guest metadata export via Resend API

---

## Architecture

```
User Interface (Dashboard)
    ↓
Date Preset Selector (buttons: Today | Yesterday | This Week | This Month | Custom)
    ↓
Analytics Cache Layer (lib/analyticsCache.ts)
    ├─ Client: React Context + localStorage (5min TTL)
    └─ Server: Edge Function wrapper (10min TTL)
    ↓
Supabase Queries
    ↓
Recharts Graph Component + Metric Cards
    ↓
(Separate) Email Reporting System
    ├─ Edge Function: send-weekly-report
    ├─ Trigger: pg_cron (weekly) + UI button (manual)
    └─ Delivery: Resend API
```

---

## 1. Date Preset System

### New Utility File: `lib/datePresets.ts`

**Types:**
```typescript
export type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'last7' | 'last30' | 'custom';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
  preset: DatePreset;
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  custom: 'Custom Range'
};
```

**Functions:**
- `getDateRange(preset, customStart?, customEnd?): DateRange` — Resolve preset to actual dates
- `presetToAnalyticsPreset(preset): string` — Map to existing analytics backend types if needed

**Dashboard Integration:**
- Add filter UI component with preset buttons
- Store selected preset in URL: `?datePreset=thisWeek&customStart=2026-07-20&customEnd=2026-07-30`
- Pass preset to analytics cache hook

---

## 2. Caching Layer

### New Cache Module: `lib/analyticsCache.ts`

**Client-Side Cache (React Context):**
- Uses localStorage with TTL tracking
- Key format: `dashboard_cache:${preset}:${dateRange}`
- TTL: 5 minutes (configurable)
- Auto-invalidates on expiry
- Cleared on manual refresh

**Server-Side Cache (Edge Function):**
- New Edge Function: `supabase/functions/get-dashboard-analytics/index.ts`
- Wraps existing Supabase queries with cache headers
- TTL: 10 minutes (HTTP Cache-Control header)
- Query aggregates: metrics, visits-over-time, guests-by-status, peak-times, live-now, etc.
- Returns `DashboardAnalyticsResult`

**Cache Hook:**
```typescript
export function useDashboardCache(preset: DatePreset, customRange?: {start: string; end: string}) {
  const [data, setData] = useState<DashboardAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const cached = getCachedData(preset, customRange);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    
    fetchFromEdgeFunction(preset, customRange)
      .then(result => {
        setCachedData(preset, customRange, result);
        setData(result);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [preset, customRange]);

  return { data, loading, error };
}

export function invalidateCache(preset?: DatePreset) {
  // Clear specific preset or all caches from localStorage
}
```

**Invalidation Strategy:**
- Time-based: automatic expiry after TTL
- Manual: "↻ Refresh" button next to date selector
- Event-based: clear on login/logout (optional)

---

## 3. Graph Component Upgrade

### New Component: `src/components/dashboard/VisitsOverTimeChart.tsx`

**Technology:**
- Recharts (LineChart/AreaChart with ComposedChart for dual axes)
- shadcn/ui chart wrapper (install via `npx shadcn-ui@latest add chart`)

**Features:**
- **Dual Series:**
  - Primary: Visits (line, #22c55e green)
  - Secondary: Unique Guests (area overlay, semi-transparent)
- **Interactivity:**
  - Hover tooltips (date, visit count, guest count)
  - Legend toggle (show/hide series)
  - Click to drill down (optional future feature)
- **Responsiveness:**
  - Mobile: Stacked layout, reduced label density
  - Tablet/Desktop: Full width with legend
- **Scrolling:**
  - Horizontal scroll container for 30+ day ranges
  - X-axis shows every 7th day label (avoid crowding)
  - Smooth scroll UX
- **Styling:**
  - Match existing dashboard theme (dark mode support)
  - Use CSS variables for colors (inherit from theme context)

**Props:**
```typescript
interface VisitsOverTimeChartProps {
  data: VisitPoint[]; // from DashboardAnalyticsResult.visitsOverTime
  loading?: boolean;
  error?: Error | null;
}
```

**Replacement:**
- Remove custom SVG chart from `DashboardWidgets.tsx` `VisitsOverTimeChart` export
- Import and render new Recharts component
- Pass data from cache hook

---

## 4. Email Reporting Feature

### New Edge Function: `supabase/functions/send-weekly-report/index.ts`

**Functionality:**

1. **Query guest data** (for the specified week):
   - Get all unique guests from `guest_summaries` or join `wifi_connections` + `guest_profiles`
   - Aggregate: visit_count, first_seen_at, last_seen_at
   - Filter by email/marketing consent if needed

2. **Generate CSV:**
   - Columns: `full_name | email | phone | postcode | visit_count | first_seen_at | last_seen_at`
   - Format dates as `YYYY-MM-DD HH:mm:ss`
   - UTF-8 encoding, proper escaping

3. **Generate HTML Email:**
   - Header: Batesford Hotel branding
   - Subtitle: "Weekly Guest Report — [Date Range]"
   - Summary Stats: "Total Guests: X | Total Visits: Y | Avg Visits/Guest: Z"
   - Top 5 Guests: Table with name, email, visit count
   - Call-to-action: Link to dashboard or "View Full Report"
   - Footer: Timestamp, unsubscribe link (optional)

4. **Send via Resend API:**
   - Load `RESEND_API_KEY` from env
   - Send to configured email list (e.g., from settings or hardcoded)
   - Attach CSV as file

5. **Logging:**
   - Log to `venue_reports` table: `{id, venue_id, sent_at, email_count, recipient, status, error_message?}`

**Function Signature:**
```typescript
// Triggered by pg_cron or manual request
// Query params: ?preset=thisWeek or ?startDate=2026-07-21&endDate=2026-07-27
// Body (manual): { manual: true, recipientEmail?: string }

// Response: { success: true, reportId, emailsSent, csvRows }
```

### pg_cron Trigger

**Database Migration:**
```sql
-- Enable pg_cron extension (if not already enabled)
create extension if not exists pg_cron;

-- Schedule: Every Monday at 9:00 AM
select cron.schedule('send-weekly-guest-report', '0 9 * * 1', $$
  select
    net.http_post(
      url:='https://<SUPABASE_PROJECT>.supabase.co/functions/v1/send-weekly-report',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SUPABASE_SERVICE_ROLE_KEY>"}'::jsonb,
      body:=jsonb_build_object('scheduled', true)
    ) as request_id;
$$);
```

**Configuration:**
- Day: Monday (configurable to any day)
- Time: 9:00 AM (configurable)
- Recipient: Stored in `admin_settings.report_email` or hardcoded list
- Frequency: Weekly

### Manual Trigger (UI)

**Location:** Admin > Settings > Reporting (new page/section)

**Button:** "Send Report Now"
- Shows date range selector (default: this week)
- Shows recipient email field (pre-populated from settings)
- On click: calls Edge Function with manual flag
- Toast feedback: "Report sent to X recipients" or error message

**Optional:** History view showing past reports sent (from `venue_reports` table)

---

## 5. Database Schema Changes

### New Table: `venue_reports`

```sql
create table public.venue_reports (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  report_type varchar default 'weekly_guests',
  date_range_start date not null,
  date_range_end date not null,
  sent_at timestamp with time zone default now(),
  recipient_email varchar not null,
  email_count int,
  csv_rows int,
  status varchar default 'sent', -- 'sent', 'failed', 'pending'
  error_message text,
  created_at timestamp with time zone default now()
);

create index idx_venue_reports_venue_id on venue_reports(venue_id);
create index idx_venue_reports_sent_at on venue_reports(sent_at desc);
```

### Settings Table (if needed)

```sql
-- Add to existing admin_settings or create new:
alter table admin_settings add column report_email varchar;
alter table admin_settings add column report_schedule_day int default 1; -- 0=Sunday, 1=Monday, etc.
alter table admin_settings add column report_schedule_time time default '09:00:00';
```

---

## 6. Dependencies & Setup

### New Packages

```bash
npm install recharts
npx shadcn-ui@latest add chart
npm install resend
```

### Environment Variables

Add to `.env.portal`:
```
VITE_RESEND_API_KEY=re_xxxxxxxxxxxxx
```

Add to Supabase secrets (via dashboard):
```
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

### File Structure

```
src/
  components/
    dashboard/
      VisitsOverTimeChart.tsx (NEW)
      DatePresetSelector.tsx (NEW)
  lib/
    datePresets.ts (NEW)
    analyticsCache.ts (NEW)
  pages/
    AdminReporting.tsx (NEW - manual report trigger UI)

supabase/
  functions/
    get-dashboard-analytics/
      index.ts (NEW - cached analytics endpoint)
    send-weekly-report/
      index.ts (NEW - email generation & sending)
```

---

## 7. Implementation Order

1. **Date Presets** — Extract `datePresets.ts`, update Dashboard UI
2. **Caching** — Implement `analyticsCache.ts` + Edge Function
3. **Graph** — Install Recharts, build `VisitsOverTimeChart.tsx`
4. **Email** — Build Edge Function + manual UI + pg_cron trigger

---

## 8. Testing & Validation

**Unit Tests:**
- `datePresets.ts`: Verify date calculations for each preset
- `analyticsCache.ts`: Mock cache hits/misses, TTL expiry

**Integration Tests:**
- Dashboard loads data with cache, verifies performance
- Graph renders data correctly, scroll works
- Email function generates valid CSV + HTML, sends via Resend

**Manual QA:**
- Dashboard: Test each preset button, custom date range
- Graph: Test hover, scroll on mobile/desktop, zoom
- Email: Send test report, verify CSV attachment, HTML rendering
- Cron: Monitor first scheduled send (Monday 9am)

---

## 9. Success Criteria

- ✓ Dashboard shows new date preset buttons (today, yesterday, this week, this month)
- ✓ Data loads faster (client + server cache working, measured <1s repeat loads)
- ✓ Visits Over Time graph is interactive, scrollable, responsive
- ✓ Weekly email reports send automatically (pg_cron) and on-demand (UI button)
- ✓ CSV export contains accurate guest metadata
- ✓ HTML email renders beautifully in Outlook, Gmail, etc.

---

## 10. Future Enhancements (Out of Scope)

- Drill-down from graph to guest list
- Report customization (columns, format)
- Multi-recipient email distribution list
- Report scheduling per user
- Dashboard export as PDF/PNG
- Guest segmentation in reports

