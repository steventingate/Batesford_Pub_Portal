# Task 2.2 Report: `get-dashboard-analytics` Edge Function

**Status:** DONE_WITH_CONCERNS
**Commit:** `2e978e1e8f860875f5fa01065f913a39f62de59a` — "feat: add cached analytics Edge Function with 10-minute TTL" (on `main`, matching the branch the earlier tasks in this series committed to)

## Deliverables

- `supabase/functions/get-dashboard-analytics/index.ts` — the Edge Function
- `supabase/tests/get-dashboard-analytics.harness.ts` — Docker-free local test harness (46 checks)
- `src/lib/dashboardAnalytics.ts` — added exported `SerializedDashboardAnalyticsResult`
- `src/lib/analyticsCache.ts` — cache layer now typed against the serialized shape
- `src/lib/__tests__/analyticsCache.test.ts` — fixture retyped to match

## Date serialization: Option A

**Chosen: Option A** — the function declares and returns
`SerializedDashboardAnalyticsResult`, with `range.start` / `end` / `compareStart` /
`compareEnd` as ISO-8601 strings. The type now describes what actually crosses
the wire.

Reasoning:

1. **One shape on every path.** JSON is the only transport, and localStorage
   stores the response verbatim. With Option A a cache hit and a cache miss are
   byte-identical — asserted directly in the harness ("JSON round-trip is
   byte-identical"). Option B would have had to revive on the fetch path and
   then again on the cache-read path, with two chances to drift apart.
2. **The lie was in the type, not the data.** `DashboardAnalyticsResult.range`
   claimed `Date` for values that could never survive `supabase.functions.invoke`.
   Correcting the declaration fixes the hazard at its source; a reviver only
   papers over it.
3. **Revival is a consumer concern.** A component that needs a `Date` writes
   `new Date(result.range.start)`. Nothing else in the payload carries dates —
   `visitsOverTime[].isoDate`, `insights`, and the heatmap were already strings —
   so `range` was the only affected surface.
4. **Explicitly not done in the cache layer.** `getCachedData` / `setCachedData`
   remain pure pass-throughs, per the task instruction.

`SerializedDashboardAnalyticsResult` is derived from `DashboardAnalyticsResult`
via `Omit`, so the two cannot drift as the payload grows. Its `range.preset` is
widened from `DashboardRangePreset` (`last7 | last30`) to the full `DatePreset`
union, since the function accepts every preset the Task 1.x date picker offers.
No production code consumed `useDashboardCache` yet, so the retype was contained
to the hook and its tests.

## Behaviour

| Case | Response |
| --- | --- |
| `OPTIONS` | 204 + CORS |
| non-POST | 405 |
| missing/blank `Authorization: Bearer` | 401 (before any DB work) |
| JWT rejected by GoTrue | 401 |
| unparseable body | 400 |
| missing / malformed / impossible date (e.g. `2026-02-31`) | 400 |
| `startDate > endDate` | 400 |
| range > 366 days | 400 |
| success | 200, `Cache-Control: public, max-age=600` |
| unexpected throw | 500, logged |

Errors carry `Cache-Control: no-store`. All responses carry
`Vary: Origin, Authorization`.

## Implementation notes

- **RLS preserved.** Every query runs through a client bound to the caller's
  JWT. The service-role key is deliberately not used, so the function cannot
  return more than the browser already could.
- **Logic ported, not imported.** `dashboardAnalytics.ts` imports the browser
  Supabase singleton and `date-fns`, neither usable in Deno as-is. The
  aggregation and the four `guestActivity.ts` helpers it depends on
  (`getSessionIdentityKey`, `hasSessionIdentity`, `buildSessionBackfillProfiles`,
  `resolveProfileForIdentity`) were ported into the single function file, as the
  brief permitted.
- **Time zone.** Edge Functions run at `TZ=UTC`; the browser implementation
  bucketed in local time. All day/hour bucketing and label formatting now run
  against `ANALYTICS_TIMEZONE` (default `Europe/London`) through `Intl`, so
  "today" and "7PM" mean venue-local time. Verified across both a BST date
  (2026-07-30 → `2026-07-29T23:00:00.000Z`) and a GMT date
  (2026-01-15 → `2026-01-15T00:00:00.000Z`).
- **No external npm/esm dependency beyond supabase-js.** Date helpers are
  hand-rolled against `Intl`, keeping cold starts cheap.
- **Two deliberate divergences from `dashboardAnalytics.ts`** (both bug fixes,
  documented inline):
  1. *Compare-window off-by-one.* The original derives the compare offset from
     `Math.round((end - start) / 86400000)`, which is already the inclusive day
     count, then steps back that many days — producing an 8-day compare window
     against a 7-day current window for `last7`, skewing every `delta`. The
     function uses `inclusiveDays - 1`, so both windows are always equal length.
     The harness asserts this.
  2. *Live window.* The original passes `range.end` (end of the final day, often
     in the future) as "now", so the 3-hour live window could start at 21:00.
     The function uses the real current time.

## Verification

Docker Desktop is not running on this machine, so `supabase start` and a local
functions deploy were not possible. Verification was done three other ways.

**1. Deno type-check — clean.**

```
npx --yes deno@2.1.4 check --no-lock <function>
Check file:///.../index.ts
```

(Run against a copy with the `jsr:@supabase/functions-js/edge-runtime.d.ts`
side-effect import stripped: that file's own types fail to resolve because it
references `npm:openai@^4.52.5`, unrelated to this function. The import is
ambient-types-only and is retained in the committed file, matching the other
functions in this repo.)

**2. Functional harness against a stub Supabase — 46/46 checks pass.**

```
npx --yes deno@2.1.4 run --no-lock --allow-net --allow-env --allow-read \
  --allow-import supabase/tests/get-dashboard-analytics.harness.ts
```

The harness boots the real function module and a stub GoTrue/PostgREST on
loopback with fixture guests, wifi connections, portal sessions and access
points, then exercises the full contract. Selected output for
`{"startDate":"2026-07-20","endDate":"2026-07-30","preset":"custom"}`:

```
=== 8. Happy path 2026-07-20..2026-07-30 ===
  PASS  200
  PASS  Cache-Control: public, max-age=600
  PASS  Vary includes Authorization
  PASS  all DashboardAnalyticsResult keys present
  PASS  range dates are ISO STRINGS (Option A)
  PASS  JSON round-trip is byte-identical (cache hit == cache miss)
  PASS  11 days in visitsOverTime
  PASS  7 metrics / 5 insights / 168 heatmap cells / 4 status slices
  PASS  liveNow.count = 1 (rolling 3h window)
  PASS  compare window length == current window length
```

```json
"range": {
  "preset": "custom",
  "start": "2026-07-19T23:00:00.000Z",
  "end": "2026-07-30T22:59:59.999Z",
  "compareStart": "2026-07-08T23:00:00.000Z",
  "compareEnd": "2026-07-19T22:59:59.999Z",
  "label": "20 Jul - 30 Jul 2026",
  "compareLabel": "Previous 11 days"
}
```

Payload size for the 11-day fixture: ~12.6 kB (well inside the ~5 MB
localStorage budget the Task 2.1 cache writes into).

**3. App build and test suite — clean.**

- `npm run build` — exit 0 (`tsc -b` under `strict`), confirming the
  `SerializedDashboardAnalyticsResult` retype compiles across the app.
- `npm test` — 3 files, 46 tests passed (unchanged from the Task 2.1 baseline).

## Concerns

1. **`Cache-Control: public` on per-user data.** The brief specifies
   `public, max-age=600`, and that is what ships. `public` invites any shared
   cache to store a response that is scoped to one admin's JWT. In practice this
   is inert — the endpoint is `POST`, and shared caches do not store POST
   responses — and `Vary: Origin, Authorization` was added as a second line of
   defence. But if this ever moves to `GET` behind a CDN, `public` must become
   `private` first. Worth a decision from whoever owns the caching design.
2. **Not deployed.** Docker is not running, so neither `supabase start` nor a
   local `supabase functions deploy` could run. The project *is* linked
   (`supabase/.temp/project-ref` exists), but deploying to the live project is a
   production publish that was not part of this task's local-testing instruction,
   so I did not run it. **Someone needs to run
   `supabase functions deploy get-dashboard-analytics` explicitly.**
3. **The port is untested against the real schema.** The harness stubs
   PostgREST, so column names, the `guest_summary_view` shape, and RLS
   behaviour under a real admin JWT are unverified. Requires one smoke test
   against a live or local database before the dashboard is switched over.
4. **Duplicated logic.** The aggregation now exists twice — in
   `src/lib/dashboardAnalytics.ts` and in the Edge Function. They will drift.
   The clean fix is to extract the pure aggregation into a shared module that
   takes injected query results, so both call sites compute identically; that
   was out of scope here. Note the two intentional divergences above mean they
   already differ.
5. **The harness is not in `npm test`.** It needs Deno, which is not a project
   dependency (it is fetched on demand via `npx deno@2.1.4`). It must be run
   manually; CI will not catch a regression in this function.
6. **`last7` / `last30` compare labels changed.** The old hardcoded
   `"Previous 7 days"` / `"Previous 30 days"` are now derived
   (`"Previous 7 days"` / `"Previous 30 days"` for those presets, and e.g.
   `"Previous day"` for a single-day range). Text is equivalent for the two
   original presets but computed rather than fixed.
