# Task 2.1 Report: Client-Side Cache Utility

**Status:** DONE_WITH_CONCERNS
**Commit:** `4395db66f3f6b739a79577e2dd8347f07454d245` — "feat: add client-side cache layer with localStorage and TTL"

## Deliverables

- `src/lib/analyticsCache.ts` — cache utilities + `useDashboardCache` hook
- `src/lib/__tests__/analyticsCache.test.ts` — 23 tests

## Verification

- `npm test` — 3 files, 46 tests passed (23 new; baseline was 23)
- `npm run build` — exit 0 (`tsc -b` clean under `strict` + `noUnusedLocals` + `noUnusedParameters`)
- Mutation check: removing the post-`await` `if (cancelled) return;` guard makes the unmount test fail as expected, confirming the test is not vacuous.

## Exported API

| Export | Notes |
| --- | --- |
| `CACHE_KEY_PREFIX` | `'dashboard_cache'` |
| `CLIENT_CACHE_TTL` | `5 * 60 * 1000` |
| `DASHBOARD_ANALYTICS_FUNCTION` | `'get-dashboard-analytics'` |
| `buildCacheKey(preset, customStart?, customEnd?)` | Extra helper (not in brief); keeps key format testable and shared |
| `getCachedData(preset, customStart?, customEnd?)` | Returns `null` on miss/expiry/corruption; evicts expired + corrupt entries |
| `setCachedData(preset, data, customStart?, customEnd?)` | Never throws |
| `invalidateCache(preset?)` | Never throws |
| `useDashboardCache(preset, customStart?, customEnd?, options?)` | `{ data, loading, error }` |
| `UseDashboardCacheReturn`, `UseAnalyticsCacheOptions` | Types |

## Design decisions

1. **Key format.** `dashboard_cache:<preset>` when no custom bounds are supplied,
   `dashboard_cache:<preset>:<start>:<end>` when either is. Keying on the presence of
   custom dates (rather than on `preset === 'custom'`) means a preset paired with an
   explicit range never collides with the bare preset entry.
2. **`invalidateCache(preset)` also clears that preset's custom-range entries.** It matches
   the exact key `dashboard_cache:<preset>` plus the scoped prefix `dashboard_cache:<preset>:`.
   Exact-plus-delimiter matching avoids any chance of one preset name prefixing another.
3. **No loading flash.** Hook state is a single object seeded by a lazy `useState`
   initializer that reads the cache during the first render. A cache hit renders data
   immediately with `loading: false`; a miss starts at `loading: true`. Deriving these
   in `useEffect` instead would have flashed a wrong state for one paint in both directions.
4. **`onError` held in a ref** so callers passing an inline arrow function do not retrigger
   the fetch effect on every render.
5. **Defensive reads.** Entries are shape-validated (`timestamp` finite, `data` present)
   before use, so a foreign or truncated `dashboard_cache:*` value degrades to a miss.

## Concerns

1. **`Date` fields do not survive the JSON round-trip.** `DashboardAnalyticsResult.range`
   holds real `Date` objects (`start`, `end`, `compareStart`, `compareEnd`). `JSON.stringify`
   turns them into ISO strings, so a cache *hit* returns `range.start` as a `string` while a
   cache *miss* (fresh fetch) may return a `Date` — the static type says `Date` in both cases.
   Any consumer calling `range.start.getTime()` will break on cached reads. The brief
   specified no reviver, so none was added. **Task 2.2 or the consuming component should
   settle this** — either have the Edge Function return ISO strings and widen the type, or
   add a date-reviving step in `getCachedData`. This is the one item I would not ship without
   resolving.
2. **Test environment is per-file.** `vitest.config.ts` sets `environment: 'node'`, which has
   no `localStorage` and no DOM. The new test file opts in with a
   `// @vitest-environment jsdom` docblock rather than changing the global config, keeping
   the blast radius to this file. If more DOM-dependent suites appear, consider moving jsdom
   into the shared config.
3. **`supabaseClient` is mocked in tests**, as required — the real module touches
   `window.localStorage` at import time and returns a throwing proxy when Supabase env vars
   are absent. The `{ startDate, endDate, preset }` request body and the
   `{ data, error }` response shape are therefore verified against the brief's contract,
   not against a live function. Worth re-verifying once Task 2.2 lands.
4. **No cross-tab invalidation and no size cap.** A `storage` event listener and an LRU/quota
   sweep were out of scope; writes degrade gracefully on `QuotaExceededError` (logged, swallowed)
   but nothing proactively evicts.
