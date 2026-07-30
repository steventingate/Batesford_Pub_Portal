// Local test harness for the get-dashboard-analytics Edge Function.
//
// Runs the real function against a stub Supabase API on loopback, so no Docker
// and no `supabase start` are required. Verifies status codes, CORS and cache
// headers, the Option A ISO-string date contract, and the aggregation shape.
//
// Run from the repo root:
//   npx --yes deno@2.1.4 run --no-lock --allow-net --allow-env --allow-read //     --allow-import supabase/tests/get-dashboard-analytics.harness.ts
//
// Lives outside supabase/functions/ so the Supabase CLI does not treat it as a
// deployable function.

// Local harness: runs the real Edge Function against a stub Supabase API.
// No Docker required. Verifies status codes, headers and payload shape.

const STUB_PORT = 54399;
const FN_PORT = 8000;

const iso = (day: string, hour = 19, min = 30) =>
  new Date(Date.UTC(2026, 6, Number(day), hour, min, 0)).toISOString();

const PROFILES = [
  {
    guest_id: "g1", email: "ann@example.com", full_name: "Ann", mobile: "07100000001",
    postcode: "GL52 2NW", segment: "regular", visit_count: 6,
    first_seen_at: iso("22"), last_seen_at: iso("29"),
    marketing_consent: true, unsubscribe_status: false,
  },
  {
    guest_id: "g2", email: "bob@example.com", full_name: "Bob", mobile: "07100000002",
    postcode: "GL52 2NW", segment: "new", visit_count: 1,
    first_seen_at: iso("28"), last_seen_at: iso("28"),
    marketing_consent: false, unsubscribe_status: false,
  },
  {
    guest_id: "g3", email: "cat@example.com", full_name: "Cat", mobile: null,
    postcode: "GL50 1AA", segment: "lapsed", visit_count: 4,
    first_seen_at: iso("01", 12), last_seen_at: "2026-05-01T12:00:00.000Z",
    marketing_consent: true, unsubscribe_status: true,
  },
];

const CONNECTIONS = [
  { guest_id: "g1", connected_at: iso("22") },
  { guest_id: "g1", connected_at: iso("25", 20) },
  { guest_id: "g2", connected_at: iso("28") },
  { guest_id: "g1", connected_at: iso("29") },
];

const session = (id: string, email: string, day: string, hour: number, status: string) => ({
  id, session_key: `k-${id}`, site_slug: "batesford", client_mac: `aa:bb:cc:00:00:0${id}`,
  ap_mac: "11:22:33:44:55:66", guest_name: email.split("@")[0], guest_email: email,
  guest_phone: null, guest_postcode: "GL52 2NW",
  submitted_at: iso(day, hour), authorized_at: status === "authorized" ? iso(day, hour) : null,
  completed_at: null, updated_at: iso(day, hour), status,
});

const SESSIONS = [
  session("1", "ann@example.com", "22", 19, "authorized"),
  session("2", "bob@example.com", "28", 19, "authorized"),
  session("3", "dan@example.com", "27", 21, "failed"),
  session("4", "eve@example.com", "26", 18, "presented"),
];

// A live session inside the rolling 3-hour window.
const LIVE_SESSION = {
  ...session("9", "live@example.com", "30", 12, "authorized"),
  submitted_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  authorized_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  updated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
};

const ACCESS_POINTS = [
  { ap_mac: "11:22:33:44:55:66", area_name: "Main Bar", display_name: "Main Bar" },
];

const USER = {
  id: "11111111-2222-3333-4444-555555555555",
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

let restCalls = 0;

const stub = Deno.serve({ port: STUB_PORT, onListen: () => {} }, (req) => {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";

  if (url.pathname.endsWith("/auth/v1/user")) {
    if (!auth.includes("good-token")) {
      return new Response(JSON.stringify({ message: "invalid claim: missing sub claim" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(USER), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname.includes("/rest/v1/")) {
    restCalls += 1;
    const table = url.pathname.split("/rest/v1/")[1];
    let body: unknown = [];
    if (table === "guest_summary_view") body = PROFILES;
    else if (table === "wifi_connections") body = CONNECTIONS;
    else if (table === "wifi_access_points") body = ACCESS_POINTS;
    else if (table === "portal_sessions") {
      // The live query filters on a recent updated_at and has no upper bound.
      const isLive = !url.searchParams.getAll("updated_at").some((v) => v.startsWith("lte."));
      body = isLive ? [LIVE_SESSION] : SESSIONS;
    }
    return new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
});

Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${STUB_PORT}`);
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon-key");
Deno.env.set("ANALYTICS_TIMEZONE", "Europe/London");

// Importing the module registers its Deno.serve handler.
await import("../functions/get-dashboard-analytics/index.ts");
await new Promise((r) => setTimeout(r, 400));

const BASE = `http://127.0.0.1:${FN_PORT}`;
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

const call = (body: unknown, token: string | null, method = "POST") =>
  fetch(BASE, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:5173",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

console.log("\n=== 1. OPTIONS preflight ===");
{
  const res = await fetch(BASE, { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } });
  check("204", res.status === 204, String(res.status));
  check("CORS allow-origin echoes localhost",
    res.headers.get("access-control-allow-origin") === "http://localhost:5173",
    String(res.headers.get("access-control-allow-origin")));
  await res.body?.cancel();
}

console.log("\n=== 2. GET -> 405 ===");
{
  const res = await call(null, "good-token", "GET");
  check("405", res.status === 405, String(res.status));
  await res.json();
}

console.log("\n=== 3. Missing Authorization -> 401 ===");
{
  const res = await call({ startDate: "2026-07-20", endDate: "2026-07-30", preset: "custom" }, null);
  check("401", res.status === 401, String(res.status));
  check("no-store on error", res.headers.get("cache-control") === "no-store");
  console.log("   body:", JSON.stringify(await res.json()));
}

console.log("\n=== 4. Invalid JWT -> 401 ===");
{
  const res = await call({ startDate: "2026-07-20", endDate: "2026-07-30", preset: "custom" }, "bad-token");
  check("401", res.status === 401, String(res.status));
  console.log("   body:", JSON.stringify(await res.json()));
}

console.log("\n=== 5. Missing dates -> 400 ===");
{
  const res = await call({ preset: "custom" }, "good-token");
  check("400", res.status === 400, String(res.status));
  console.log("   body:", JSON.stringify(await res.json()));
}

console.log("\n=== 6. Impossible date (2026-02-31) -> 400 ===");
{
  const res = await call({ startDate: "2026-02-31", endDate: "2026-03-01", preset: "custom" }, "good-token");
  check("400", res.status === 400, String(res.status));
  console.log("   body:", JSON.stringify(await res.json()));
}

console.log("\n=== 7. start after end -> 400 ===");
{
  const res = await call({ startDate: "2026-07-30", endDate: "2026-07-20", preset: "custom" }, "good-token");
  check("400", res.status === 400, String(res.status));
  console.log("   body:", JSON.stringify(await res.json()));
}

console.log("\n=== 8. Happy path 2026-07-20..2026-07-30 ===");
{
  const res = await call({ startDate: "2026-07-20", endDate: "2026-07-30", preset: "custom" }, "good-token");
  check("200", res.status === 200, String(res.status));
  check("Cache-Control: public, max-age=600",
    res.headers.get("cache-control") === "public, max-age=600",
    String(res.headers.get("cache-control")));
  check("Vary includes Authorization",
    (res.headers.get("vary") ?? "").includes("Authorization"),
    String(res.headers.get("vary")));
  check("Content-Type json", (res.headers.get("content-type") ?? "").includes("application/json"));

  const raw = await res.text();
  const data = JSON.parse(raw);

  const topKeys = [
    "range", "metrics", "visitsOverTime", "guestStatus", "liveNow", "peakTimes",
    "newVsReturning", "consent", "topPostcodes", "insights", "fallbacksUsed",
    "detectedTables", "detectedFields",
  ];
  check("all DashboardAnalyticsResult keys present",
    topKeys.every((k) => k in data),
    topKeys.filter((k) => !(k in data)).join(","));

  const rangeKeys = ["preset", "start", "end", "compareStart", "compareEnd", "label", "compareLabel"];
  check("all range keys present", rangeKeys.every((k) => k in data.range));
  check("range dates are ISO STRINGS (Option A)",
    ["start", "end", "compareStart", "compareEnd"].every((k) => typeof data.range[k] === "string"),
    JSON.stringify(data.range));
  check("range strings revive to valid Dates",
    ["start", "end", "compareStart", "compareEnd"]
      .every((k) => !Number.isNaN(new Date(data.range[k]).getTime())));
  check("JSON round-trip is byte-identical (cache hit == cache miss)",
    JSON.stringify(JSON.parse(JSON.stringify(data))) === JSON.stringify(data));

  check("11 days in visitsOverTime", data.visitsOverTime.length === 11, String(data.visitsOverTime.length));
  check("first day is 2026-07-20", data.visitsOverTime[0].isoDate === "2026-07-20", data.visitsOverTime[0].isoDate);
  check("last day is 2026-07-30", data.visitsOverTime[10].isoDate === "2026-07-30", data.visitsOverTime[10].isoDate);
  check("7 metrics", data.metrics.length === 7, String(data.metrics.length));
  check("5 insights", data.insights.length === 5, String(data.insights.length));
  check("heatmap has 7*24 cells", data.peakTimes.cells.length === 168, String(data.peakTimes.cells.length));
  check("guestStatus has 4 slices", data.guestStatus.slices.length === 4);
  check("newVsReturning aligns with visitsOverTime",
    data.newVsReturning.length === data.visitsOverTime.length);
  check("liveNow.count = 1 (rolling 3h window)", data.liveNow.count === 1, String(data.liveNow.count));
  check("liveNow area resolved from wifi_access_points",
    data.liveNow.areas[0]?.label === "Main Bar", JSON.stringify(data.liveNow.areas));
  check("no fallbacks used", data.fallbacksUsed.length === 0, JSON.stringify(data.fallbacksUsed));

  const totalVisits = data.metrics.find((m: { key: string }) => m.key === "totalVisits");
  check("totalVisits counts merged activity", Number(totalVisits.value) > 0, totalVisits.value);
  check("compareLabel reads 'Previous 11 days'",
    data.range.compareLabel === "Previous 11 days", data.range.compareLabel);
  check("compareStart is 09 Jul BST midnight",
    data.range.compareStart === "2026-07-08T23:00:00.000Z", data.range.compareStart);
  const days = (a: string, b: string) =>
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  check("compare window length == current window length",
    days(data.range.compareStart, data.range.compareEnd) === days(data.range.start, data.range.end),
    `${days(data.range.compareStart, data.range.compareEnd)} vs ${days(data.range.start, data.range.end)}`);

  console.log("\n--- range ---");
  console.log(JSON.stringify(data.range, null, 2));
  console.log("--- metrics ---");
  console.log(JSON.stringify(data.metrics.map((m: Record<string, unknown>) =>
    ({ key: m.key, value: m.value, delta: m.delta })), null, 2));
  console.log("--- visitsOverTime ---");
  console.log(JSON.stringify(data.visitsOverTime));
  console.log("--- peak / status / postcodes ---");
  console.log("peakWindowLabel:", data.peakTimes.peakWindowLabel);
  console.log("guestStatus:", JSON.stringify(data.guestStatus));
  console.log("topPostcodes:", JSON.stringify(data.topPostcodes));
  console.log("consent:", JSON.stringify(data.consent));
  console.log("--- insights ---");
  console.log(JSON.stringify(data.insights, null, 2));
  console.log(`\npayload bytes: ${raw.length}`);
}

console.log("\n=== 9. BST boundary: single-day range 2026-07-30 ===");
{
  const res = await call({ startDate: "2026-07-30", endDate: "2026-07-30", preset: "today" }, "good-token");
  const data = await res.json();
  check("200", res.status === 200, String(res.status));
  check("one day bucket", data.visitsOverTime.length === 1, String(data.visitsOverTime.length));
  check("preset preserved", data.range.preset === "today", data.range.preset);
  check("start is 2026-07-29T23:00Z (BST midnight)",
    data.range.start === "2026-07-29T23:00:00.000Z", data.range.start);
  check("end is 2026-07-30T22:59:59.999Z",
    data.range.end === "2026-07-30T22:59:59.999Z", data.range.end);
  check("compareEnd is previous BST day end",
    data.range.compareEnd === "2026-07-29T22:59:59.999Z", data.range.compareEnd);
  check("compareLabel 'Previous day'", data.range.compareLabel === "Previous day", data.range.compareLabel);
  check("compareStart is 29 Jul BST midnight (1-day compare window)",
    data.range.compareStart === "2026-07-28T23:00:00.000Z", data.range.compareStart);
  console.log("   range:", JSON.stringify(data.range));
}

console.log("\n=== 10. GMT (winter) boundary: 2026-01-15 ===");
{
  const res = await call({ startDate: "2026-01-15", endDate: "2026-01-15", preset: "custom" }, "good-token");
  const data = await res.json();
  check("start is 2026-01-15T00:00Z (GMT midnight)",
    data.range.start === "2026-01-15T00:00:00.000Z", data.range.start);
  check("end is 2026-01-15T23:59:59.999Z",
    data.range.end === "2026-01-15T23:59:59.999Z", data.range.end);
  console.log("   range:", JSON.stringify(data.range));
}

console.log("\n=== 11. Range cap ===");
{
  const res = await call({ startDate: "2020-01-01", endDate: "2026-07-30", preset: "custom" }, "good-token");
  check("400 on oversized range", res.status === 400, String(res.status));
  console.log("   body:", JSON.stringify(await res.json()));
}

console.log("\n=== 12. Unknown preset falls back to 'custom' ===");
{
  const res = await call({ startDate: "2026-07-29", endDate: "2026-07-30", preset: "bogus" }, "good-token");
  const data = await res.json();
  check("200", res.status === 200, String(res.status));
  check("preset normalised to custom", data.range.preset === "custom", data.range.preset);
}

console.log(`\nREST calls made to stub: ${restCalls}`);
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

await stub.shutdown();
Deno.exit(failures === 0 ? 0 : 1);
