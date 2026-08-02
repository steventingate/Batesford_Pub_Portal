# Task 2.2: Create Edge Function for Cached Analytics

**Goal:** Implement `supabase/functions/get-dashboard-analytics/index.ts` — an Edge Function that wraps analytics queries and provides server-side caching via HTTP Cache-Control headers.

**Scope:** Single Edge Function file (`supabase/functions/get-dashboard-analytics/index.ts`).

**Dependencies:**
- Supabase SDK: `@supabase/supabase-js`
- Existing: The actual analytics logic is called as an RPC or direct query (implementation detail)

**Function Behavior:**

The Edge Function receives a POST request with:
```json
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "preset": "today|yesterday|thisWeek|thisMonth|last7|last30|custom"
}
```

**Steps:**
1. Validate `startDate` and `endDate` are provided (return 400 if missing)
2. Extract JWT token from `Authorization: Bearer <token>` header
3. Verify user is authenticated (verify JWT with Supabase, return 401 if not)
4. Query analytics data using existing logic or RPC calls to Supabase
   - Use the `dashboardAnalytics.ts` functions or create RPC calls to aggregate data
   - Or directly call existing Supabase queries with the date range
5. Return `DashboardAnalyticsResult` as JSON with HTTP cache headers:
   - `Cache-Control: public, max-age=600` (10 minutes)
6. Handle errors gracefully:
   - RPC/query errors: return 500 with error message
   - Auth errors: return 401
   - Missing params: return 400
7. Log errors to console

**Return Format:**

```typescript
{
  "range": {
    "preset": "custom",
    "startDate": "2026-07-20",
    "endDate": "2026-07-30",
    "label": "Custom Range"
  },
  "metrics": [...],
  "visitsOverTime": [...],
  "guestStatus": {...},
  "peakTimes": {...},
  "newVsReturning": [...],
  "liveNow": {...},
  "insights": [...]
}
```

**Implementation Strategy:**

The simplest approach:
1. Invoke existing Supabase RPC functions or direct queries that already exist in `dashboardAnalytics.ts`
2. OR: Copy the logic from dashboardAnalytics.ts into this function (may be duplicated)
3. Return the aggregated result with Cache-Control headers

**For testing:** The client-side hook (Task 2.1) will test calling this function. This function can be tested by:
1. Calling `supabase functions invoke get-dashboard-analytics --env-file .env.local` locally
2. Verifying it returns the correct schema
3. Verifying Cache-Control headers are present

**Configuration:**

- Environment: Deno (TypeScript)
- Should be deployable with `supabase functions deploy get-dashboard-analytics`
- Import from `https://esm.sh/@supabase/supabase-js@2.49.1`

**Deliverables:**

1. `supabase/functions/get-dashboard-analytics/index.ts` — fully implemented Edge Function
2. Local testing: verify function is callable and returns proper schema
3. Commit: "feat: add cached analytics Edge Function with 10-minute TTL"

**Quality Checklist:**

- ✅ Handles all auth/validation error cases
- ✅ Returns Cache-Control headers with 10min TTL
- ✅ Returns complete `DashboardAnalyticsResult` shape
- ✅ Logs errors for debugging
- ✅ CORS headers enabled for client calls
- ✅ Tested locally (at minimum, verified it doesn't crash)

