# Task 2.1: Create Client-Side Cache Utility

**Goal:** Implement `src/lib/analyticsCache.ts` — a React hook and utility functions for client-side caching of analytics data with localStorage and TTL.

**Scope:** Single file (`src/lib/analyticsCache.ts`) + test file (`src/lib/__tests__/analyticsCache.test.ts`).

**Dependencies:**
- From Task 1.1: `DatePreset`, `getDateRange`, `formatDateForQuery` from `lib/datePresets`
- From existing: `DashboardAnalyticsResult` type (from `lib/dashboardAnalytics`)
- Supabase client: `supabase` from `lib/supabaseClient`
- React: `useState`, `useEffect`

**Types & Interfaces:**

```typescript
// Cache entry structure (internal)
interface CacheEntry {
  data: DashboardAnalyticsResult;
  timestamp: number;
}

// Hook return type
interface UseDashboardCacheReturn {
  data: DashboardAnalyticsResult | null;
  loading: boolean;
  error: Error | null;
}

interface UseAnalyticsCacheOptions {
  onError?: (error: Error) => void;
}
```

**Functions to Implement:**

1. **`getCachedData(preset, customStart?, customEnd?): DashboardAnalyticsResult | null`**
   - Check localStorage for cached entry
   - Key format: `dashboard_cache:${preset}:${customStart}:${customEnd}` (for custom) or `dashboard_cache:${preset}` (for presets)
   - Return data if found AND not expired
   - Return null if expired or not found
   - Silently handle JSON parse errors (log warn)

2. **`setCachedData(preset, data, customStart?, customEnd?): void`**
   - Store data in localStorage with timestamp
   - Silently handle errors (log warn)
   - Do not throw

3. **`invalidateCache(preset?): void`**
   - If preset provided: remove that preset's cache entry
   - If no preset: clear ALL dashboard cache entries (scan localStorage for `dashboard_cache:*` keys)
   - Do not throw

4. **`useDashboardCache(preset, customStart?, customEnd?, options?): UseDashboardCacheReturn`** (React hook)
   - Check client cache first (call `getCachedData`)
   - If hit: return immediately (set data, loading=false)
   - If miss: fetch from Edge Function `get-dashboard-analytics`
   - Call the Edge Function with `{ startDate, endDate, preset }`
   - Store result in client cache
   - Return { data, loading, error }
   - Cleanup: cancellation flag on unmount to prevent state updates
   - Call `options.onError?.(error)` if provided

**Constants:**

- `CACHE_KEY_PREFIX = 'dashboard_cache'`
- `CLIENT_CACHE_TTL = 5 * 60 * 1000` (5 minutes, milliseconds)

**Test Requirements (Vitest):**

1. `should store and retrieve data from cache`
2. `should return null for expired cache`
3. `should invalidate specific preset cache`
4. `should invalidate all caches when no preset specified`
5. `should silently handle localStorage errors`
6. `should handle custom date range caching separately`
7. `should clear expired entry on read`

Use fake timers (`vi.useFakeTimers()`) to test TTL expiry. Mock localStorage if needed for error cases.

**Edge Function Integration Notes:**

- The hook calls `supabase.functions.invoke('get-dashboard-analytics', { body: {...} })`
- The Edge Function will be created in Task 2.2
- For now, the hook must be tested with mocked Supabase calls
- Edge Function returns: `{ data: DashboardAnalyticsResult, error?: { message: string } }`

**Deliverables:**

1. `src/lib/analyticsCache.ts` — cache utilities + React hook
2. `src/lib/__tests__/analyticsCache.test.ts` — comprehensive tests
3. Commit: "feat: add client-side cache layer with localStorage and TTL"

**Quality Checklist:**

- ✅ Build passes (`npm run build` exit 0)
- ✅ All tests pass
- ✅ No `noUnusedLocals` violations
- ✅ Proper cleanup on hook unmount (cancellation flag)
- ✅ Error handling is silent/graceful (no crashes)
- ✅ Cache key format is deterministic and handles both preset and custom ranges

