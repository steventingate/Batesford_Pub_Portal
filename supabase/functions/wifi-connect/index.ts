import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  action?: "connect" | "status" | "timing";
  status_mode?: "strict" | "compat";
  trace_id?: string;
  venue_slug?: string;
  session_id?: string;
  attempt_no?: number;
  name?: string;
  email?: string;
  mobile?: string;
  postcode?: string;
  marketing_opt_in?: boolean;
  client_mac: string;
  ap_mac?: string;
  ssid?: string;
  redirect_url?: string;
  debug?: boolean;
  unifi_site?: string;
  unifi_ap?: string;
  unifi_id?: string;
  unifi_t?: string;
  trace_context?: {
    request_url?: string;
    page_url?: string;
    query_params?: Record<string, string>;
    user_agent?: string;
    platform?: string;
    device_os?: string;
    is_captive_assistant?: boolean;
    performance_now_ms?: number;
    performance_since_load_ms?: number;
  };
  trace_events?: Array<{
    stage_name: string;
    started_at?: number | string;
    ended_at?: number | string;
    status?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }>;
  timings?: {
    t_portal_loaded?: number | string;
    t_form_submit_clicked?: number | string;
    t_client_validation_started?: number | string;
    t_client_validation_finished?: number | string;
    t_guest_details_post_started?: number | string;
    t_guest_details_post_finished?: number | string;
    t_auth_request_started?: number | string;
    t_auth_response_received?: number | string;
    t_success_ui_rendered?: number | string;
    t_redirect_started?: number | string;
    t_redirect_finished?: number | string;
    t_captive_window_close_attempted?: number | string;
    t_submit?: number | string;
    t_submit_clicked?: number | string;
    t_connect_response?: number | string;
    t_connect_success?: number | string;
    t_strict_poll_start?: number | string;
    t_strict_poll_end?: number | string;
    t_strict_ready?: number | string;
    t_probe_start?: number | string;
    t_probe_end?: number | string;
    t_probe_redirect?: number | string;
    t_redirect_called?: number | string;
    t_website_redirect?: number | string;
    t_page_hidden?: number | string;
    t_page_unload?: number | string;
  };
};

type LoginResult = {
  cookie: string;
  endpoint: string;
  status: number;
  body: string;
};

type LoginSessionResult = {
  loginResult: LoginResult;
  cacheHit: boolean;
  loginMs: number;
};

type UnifiError = Error & { unifiUrl?: string };

type AttemptTraceUpsert = {
  client_mac: string;
  unifi_t: string;
  unifi_site: string | null;
  session_id: string;
  attempt_no: number;
  device_user_agent: string | null;
  last_action: string;
  t_submit?: string | null;
  t_submit_clicked?: string | null;
  t_connect_response?: string | null;
  t_connect_success?: string | null;
  t_strict_poll_start?: string | null;
  t_strict_poll_end?: string | null;
  t_strict_ready?: string | null;
  t_probe_start?: string | null;
  t_probe_end?: string | null;
  t_probe_redirect?: string | null;
  t_redirect_called?: string | null;
  t_website_redirect?: string | null;
  t_page_hidden?: string | null;
  t_page_unload?: string | null;
  server_login_ms?: number | null;
  server_authorize_ms?: number | null;
  server_status_ms?: number | null;
  server_total_ms?: number | null;
  status_endpoint_used?: string | null;
  cookie_cache_hit?: boolean | null;
  updated_at: string;
};

type AuthTraceUpsert = {
  trace_id: string;
  venue_slug?: string | null;
  site_id?: string | null;
  client_mac?: string | null;
  ssid?: string | null;
  ap_mac?: string | null;
  request_url?: string | null;
  user_agent?: string | null;
  device_os?: string | null;
  client_platform?: string | null;
  captive_context?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  total_duration_ms?: number | null;
  backend_duration_ms?: number | null;
  frontend_duration_ms?: number | null;
  outcome?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

type AuthTraceEventUpsert = {
  trace_id: string;
  stage_name: string;
  started_at: string;
  ended_at?: string | null;
  duration_ms?: number | null;
  status?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

const MAC_REGEX = /^([0-9A-Fa-f]{2}([-:])){5}([0-9A-Fa-f]{2})$/;

const normalizeMac = (value: string | null | undefined): string => {
  return String(value || "").trim().toLowerCase().replace(/-/g, ":");
};

const parseTimeoutMs = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const compactObject = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
};

const toDurationMs = (startedAtIso: string | null, endedAtIso: string | null): number | null => {
  if (!startedAtIso || !endedAtIso) return null;
  const start = Date.parse(startedAtIso);
  const end = Date.parse(endedAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round(end - start));
};

let cachedUnifiSession:
  | { cacheKey: string; cookie: string; expiresAtMs: number }
  | null = null;

const getSessionCacheKey = (baseUrl: string, username: string): string => {
  return `${baseUrl}|${username}`;
};

const getCachedUnifiCookie = (
  baseUrl: string,
  username: string,
): string | null => {
  if (!cachedUnifiSession) return null;
  const cacheKey = getSessionCacheKey(baseUrl, username);
  if (cachedUnifiSession.cacheKey !== cacheKey) return null;
  if (cachedUnifiSession.expiresAtMs <= Date.now()) return null;
  return cachedUnifiSession.cookie;
};

const setCachedUnifiCookie = (
  baseUrl: string,
  username: string,
  cookie: string,
  ttlMs: number,
) => {
  cachedUnifiSession = {
    cacheKey: getSessionCacheKey(baseUrl, username),
    cookie,
    expiresAtMs: Date.now() + ttlMs,
  };
};

const clearCachedUnifiCookie = () => {
  cachedUnifiSession = null;
};

const isAllowedOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      url.hostname.endsWith(".netlify.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "thebatesfordhotel.com.au" ||
      url.hostname.endsWith(".thebatesfordhotel.com.au")
    );
  } catch {
    return false;
  }
};

const buildCorsHeaders = (origin: string | null) => {
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
  }

  const allowOrigin = isAllowedOrigin(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
};

const getRequestIp = (req: Request): string | null => {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    return first || null;
  }
  return null;
};

const extractCookies = (setCookie: string | null): string | null => {
  if (!setCookie) return null;
  const parts = setCookie.split(/,(?=[^;]+=[^;]+)/g);
  const cookies = parts
    .map((p) => p.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return cookies || null;
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`${label} failed: ${reason}`);
  } finally {
    clearTimeout(timeoutId);
  }
};

const readResponseText = async (res: Response, limit = 2000) => {
  const text = await res.text().catch(() => "");
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const wrapUnifiError = (url: string, err: unknown): UnifiError => {
  const message = err instanceof Error ? err.message : String(err);
  const wrapped = new Error(message) as UnifiError;
  wrapped.unifiUrl = url;
  return wrapped;
};

const unifiLogin = async (
  baseUrl: string,
  username: string,
  password: string,
  timeoutMs: number,
): Promise<LoginResult> => {
  const loginPayload = JSON.stringify({
    username,
    password,
    remember: true,
  });

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  const tryLogin = async (path: string) => {
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: loginPayload,
        },
        timeoutMs,
        "UniFi login",
      );
    } catch (err) {
      console.log("UniFi fetch failed", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      throw wrapUnifiError(url, err);
    }
    const body = await readResponseText(res);
    return { res, endpoint: path, body, url };
  };

  let attempt = await tryLogin("/api/auth/login");
  if (!attempt.res.ok) {
    attempt = await tryLogin("/api/login");
  }

  if (!attempt.res.ok) {
    throw new Error(
      `UniFi authentication failed (${attempt.endpoint}) status=${attempt.res.status} body=${attempt.body}`,
    );
  }

  const cookieHeader = extractCookies(attempt.res.headers.get("set-cookie"));
  if (!cookieHeader) {
    throw new Error("UniFi authentication did not return a session cookie.");
  }

  return {
    cookie: cookieHeader,
    endpoint: attempt.endpoint,
    status: attempt.res.status,
    body: attempt.body,
  };
};

const verifyUnifiSession = async (
  baseUrl: string,
  cookie: string,
  timeoutMs: number,
) => {
  const url = `${baseUrl}/api/self/sites`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Cookie": cookie,
        },
      },
      timeoutMs,
      "UniFi session verify",
    );
  } catch (err) {
    console.log("UniFi fetch failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw wrapUnifiError(url, err);
  }

  const body = await readResponseText(res, 300);
  console.log("UniFi session verify", { status: res.status, body });
  return { res, body, url };
};

const authorizeGuestMac = async (
  baseUrl: string,
  site: string,
  cookie: string,
  mac: string,
  apMac: string | null,
  timeoutMs: number,
) => {
  const normalizedMac = normalizeMac(mac);
  const normalizedApMac = normalizeMac(apMac);
  const payloadObj: Record<string, string | number> = {
    cmd: "authorize-guest",
    mac: normalizedMac || mac,
    minutes: 480,
  };
  if (normalizedApMac && MAC_REGEX.test(normalizedApMac)) {
    // Some controller/proxy setups process guest auth faster when AP context is supplied.
    payloadObj.ap_mac = normalizedApMac;
  }
  const payload = JSON.stringify(payloadObj);

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Cookie": cookie,
  };

  const endpoint = `/api/s/${encodeURIComponent(site)}/cmd/stamgr`;
  const url = `${baseUrl}${endpoint}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: payload,
      },
      timeoutMs,
      "UniFi authorize",
    );
  } catch (err) {
    console.log("UniFi fetch failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw wrapUnifiError(url, err);
  }
  const bodyText = await readResponseText(res);
  console.log("UniFi authorize", { url, status: res.status, body: bodyText });

  let parsedBody: { meta?: { rc?: string } } | null = null;
  try {
    parsedBody = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsedBody = null;
  }

  const ok = res.ok && parsedBody?.meta?.rc === "ok";
  return { res, body: bodyText, ok, url };
};

const checkGuestAuthorization = async (
  baseUrl: string,
  site: string,
  cookie: string,
  mac: string,
  timeoutMs: number,
  includeGuestListFallback = false,
) => {
  const headers = {
    "Accept": "application/json",
    "Cookie": cookie,
  };

  const normalizedMac = normalizeMac(mac);
  const checks: Array<{ path: string; kind: "single" | "list" }> = [
    { path: `/api/s/${encodeURIComponent(site)}/stat/user/${normalizedMac}`, kind: "single" },
    { path: `/api/s/${encodeURIComponent(site)}/stat/sta/${normalizedMac}`, kind: "single" },
    { path: `/api/s/${encodeURIComponent(site)}/stat/guest/${normalizedMac}`, kind: "single" },
  ];
  if (includeGuestListFallback) {
    checks.push({ path: `/api/s/${encodeURIComponent(site)}/stat/guest`, kind: "list" });
  }

  const toBoolean = (value: unknown): boolean | null => {
    if (value === true || value === 1 || value === "1") return true;
    if (typeof value === "string") {
      const lowered = value.toLowerCase();
      if (lowered === "true" || lowered === "yes") return true;
      if (lowered === "false" || lowered === "no") return false;
    }
    if (value === false || value === 0 || value === "0") return false;
    return null;
  };

  const deriveAuthorizedFromRow = (row: Record<string, unknown> | null): boolean => {
    if (!row) return false;
    const explicit = toBoolean(
      row["authorized"] ?? row["is_authorized"] ?? row["isAuthorized"],
    );
    if (explicit !== null) {
      return explicit;
    }

    const blocked = toBoolean(row["blocked"]);
    if (blocked === true) return false;

    const expired = toBoolean(row["expired"]);
    if (expired === true) return false;

    const endRaw = row["end"] ?? row["expire"] ?? row["expires"];
    if (typeof endRaw === "number" && Number.isFinite(endRaw) && endRaw > 0) {
      const endMs = endRaw > 1_000_000_000_000 ? endRaw : endRaw * 1000;
      if (endMs > Date.now()) {
        return true;
      }
    }

    return false;
  };

  type StatusCheckResult = {
    path: string;
    kind: "single" | "list";
    url: string;
    res: Response | null;
    bodyText: string;
    error: UnifiError | null;
  };

  const requests = checks.map(async (check): Promise<StatusCheckResult> => {
    const { path, kind } = check;
    const url = `${baseUrl}${path}`;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers,
        },
        timeoutMs,
        "UniFi status check",
      );
      const bodyText = await readResponseText(res);
      console.log("UniFi status check", { url, status: res.status, body: bodyText });
      return { path, kind, url, res, bodyText, error: null };
    } catch (err) {
      console.log("UniFi fetch failed", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        path,
        kind,
        url,
        res: null,
        bodyText: "",
        error: wrapUnifiError(url, err),
      };
    }
  });

  const results = await Promise.all(requests);
  let lastRes: Response | null = null;
  let lastBody = "";
  let lastUrl = "";
  let lastPath = "";
  let firstError: UnifiError | null = null;

  for (const result of results) {
    if (result.error) {
      if (!firstError) {
        firstError = result.error;
      }
      continue;
    }

    if (!result.res) continue;
    lastRes = result.res;
    lastBody = result.bodyText;
    lastUrl = result.url;
    lastPath = result.path;

    if (
      result.res.status === 404 ||
      result.res.status === 405 ||
      result.bodyText.includes("api.err.UnknownUser") ||
      result.bodyText.includes("api.err.UnknownStation")
    ) {
      continue;
    }

    let parsedBody: { data?: Array<Record<string, unknown>> } | null = null;
    try {
      parsedBody = result.bodyText ? JSON.parse(result.bodyText) : null;
    } catch {
      parsedBody = null;
    }

    const dataRows = parsedBody?.data || [];
    const row = result.kind === "list"
      ? dataRows.find((entry) => {
        const rowMac = normalizeMac(String(entry["mac"] ?? ""));
        return rowMac === normalizedMac;
      }) ?? null
      : dataRows.find((entry) => {
        const rowMac = normalizeMac(String(entry["mac"] ?? ""));
        return rowMac === normalizedMac;
      }) ?? dataRows[0] ?? null;

    const rowMac = row ? normalizeMac(String(row["mac"] ?? "")) : "";
    if (row && rowMac && rowMac !== normalizedMac) {
      continue;
    }
    const authorized = deriveAuthorizedFromRow(row);
    if (authorized) {
      return {
        res: result.res,
        body: result.bodyText,
        authorized: true,
        url: result.url,
        endpointUsed: result.path,
      };
    }
  }

  if (lastRes) {
    return {
      res: lastRes,
      body: lastBody,
      authorized: false,
      url: lastUrl,
      endpointUsed: lastPath,
    };
  }

  if (firstError) {
    throw firstError;
  }

  throw new Error("UniFi status check did not return a response.");
};

const sanitizePayload = (payload: Payload) => {
  return {
    action: payload.action,
    status_mode: payload.status_mode,
    trace_id: payload.trace_id,
    venue_slug: payload.venue_slug,
    session_id: payload.session_id,
    attempt_no: payload.attempt_no,
    client_mac: payload.client_mac,
    unifi_id: payload.unifi_id,
    unifi_ap: payload.unifi_ap,
    unifi_t: payload.unifi_t,
    ssid: payload.ssid,
    redirect_url: payload.redirect_url,
  };
};

const parseTimingToIso = (
  raw: number | string | undefined,
): string | null => {
  if (raw === undefined || raw === null || raw === "") return null;
  const numeric = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
};

const parseAttemptNo = (raw: unknown): number => {
  const numeric = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = Math.floor(numeric);
  return normalized >= 0 ? normalized : 0;
};

const normalizeSessionId = (raw: string | undefined, fallbackSeed: string): string => {
  const candidate = String(raw || "").trim();
  if (candidate.length > 0) return candidate.slice(0, 120);
  return `legacy-${fallbackSeed}`;
};

const normalizeTraceId = (
  traceId: string | undefined,
  sessionId: string | undefined,
  fallbackSeed: string,
): string => {
  const candidate = String(traceId || sessionId || "").trim();
  if (candidate.length > 0) return candidate.slice(0, 120);
  return `trace-${fallbackSeed}`;
};

const isLoginRequiredResponse = (res: Response, body: string): boolean => {
  if (res.status === 401 || res.status === 403) return true;
  if (body.includes("LoginRequired")) return true;
  return false;
};

const getUnifiSession = async (
  baseUrl: string,
  username: string,
  password: string,
  timeoutMs: number,
  cacheTtlMs: number,
  forceRefresh = false,
): Promise<LoginSessionResult> => {
  if (!forceRefresh) {
    const cachedCookie = getCachedUnifiCookie(baseUrl, username);
    if (cachedCookie) {
      return {
        loginResult: {
          cookie: cachedCookie,
          endpoint: "cache",
          status: 200,
          body: "",
        },
        cacheHit: true,
        loginMs: 0,
      };
    }
  }

  const loginStart = Date.now();
  const loginResult = await unifiLogin(baseUrl, username, password, timeoutMs);
  const loginMs = Date.now() - loginStart;
  setCachedUnifiCookie(baseUrl, username, loginResult.cookie, cacheTtlMs);
  return { loginResult, cacheHit: false, loginMs };
};

const upsertAttemptTrace = async (
  supabase: ReturnType<typeof createClient>,
  row: AttemptTraceUpsert,
) => {
  const { error } = await supabase
    .from("wifi_portal_attempt_traces")
    .upsert(row, {
      onConflict: "client_mac,unifi_t,session_id,attempt_no",
    });

  if (error) {
    console.log("wifi_portal_attempt_traces upsert warning", error.message, {
      client_mac: row.client_mac,
      unifi_t: row.unifi_t,
      session_id: row.session_id,
      attempt_no: row.attempt_no,
    });
  }
};

const upsertAuthTrace = async (
  supabase: ReturnType<typeof createClient>,
  row: AuthTraceUpsert,
) => {
  const payload = compactObject<AuthTraceUpsert>(row);
  const { error } = await supabase
    .from("wifi_auth_traces")
    .upsert(payload, { onConflict: "trace_id" });

  if (error) {
    console.log("wifi_auth_traces upsert warning", error.message, {
      trace_id: row.trace_id,
      venue_slug: row.venue_slug,
      outcome: row.outcome,
    });
  }
};

const upsertAuthTraceEvents = async (
  supabase: ReturnType<typeof createClient>,
  events: AuthTraceEventUpsert[],
) => {
  if (!events.length) return;
  const rows = events.map((event) => ({
    trace_id: event.trace_id,
    stage_name: event.stage_name,
    started_at: event.started_at,
    ended_at: event.ended_at ?? event.started_at,
    duration_ms: event.duration_ms ??
      toDurationMs(event.started_at, event.ended_at ?? event.started_at),
    status: event.status ?? "ok",
    message: event.message ?? null,
    metadata: event.metadata ?? {},
    created_at: event.created_at ?? new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("wifi_auth_trace_events")
    .upsert(rows, { onConflict: "trace_id,stage_name,started_at" });

  if (error) {
    console.log("wifi_auth_trace_events upsert warning", error.message, {
      trace_id: rows[0]?.trace_id ?? null,
      events: rows.length,
    });
  }
};

const mapTimingStagesToAuthEvents = (
  traceId: string,
  timingData: Payload["timings"] | undefined,
): AuthTraceEventUpsert[] => {
  const timings = timingData ?? {};
  const pointStageMap: Array<{ stage: string; value?: number | string }> = [
    { stage: "portal_loaded", value: timings.t_portal_loaded },
    { stage: "form_submit_clicked", value: timings.t_form_submit_clicked || timings.t_submit_clicked || timings.t_submit },
    { stage: "client_validation_started", value: timings.t_client_validation_started },
    { stage: "client_validation_finished", value: timings.t_client_validation_finished },
    { stage: "guest_details_post_started", value: timings.t_guest_details_post_started },
    { stage: "guest_details_post_finished", value: timings.t_guest_details_post_finished },
    { stage: "auth_request_started", value: timings.t_auth_request_started || timings.t_connect_response || timings.t_connect_success },
    { stage: "auth_response_received", value: timings.t_auth_response_received || timings.t_connect_response || timings.t_connect_success },
    { stage: "success_ui_rendered", value: timings.t_success_ui_rendered || timings.t_connect_success },
    { stage: "redirect_started", value: timings.t_redirect_started || timings.t_redirect_called || timings.t_website_redirect },
    { stage: "redirect_finished", value: timings.t_redirect_finished || timings.t_page_hidden || timings.t_page_unload },
    { stage: "captive_window_close_attempted", value: timings.t_captive_window_close_attempted },
  ];

  const events: AuthTraceEventUpsert[] = [];
  for (const item of pointStageMap) {
    const iso = parseTimingToIso(item.value);
    if (!iso) continue;
    events.push({
      trace_id: traceId,
      stage_name: item.stage,
      started_at: iso,
      ended_at: iso,
      duration_ms: 0,
      status: "ok",
      metadata: { source: "client" },
    });
  }

  const spanStageMap: Array<{
    stage: string;
    start?: number | string;
    end?: number | string;
  }> = [
    {
      stage: "client_validation",
      start: timings.t_client_validation_started,
      end: timings.t_client_validation_finished,
    },
    {
      stage: "guest_details_post",
      start: timings.t_guest_details_post_started,
      end: timings.t_guest_details_post_finished,
    },
    {
      stage: "auth_request",
      start: timings.t_auth_request_started || timings.t_guest_details_post_started,
      end: timings.t_auth_response_received || timings.t_guest_details_post_finished,
    },
    {
      stage: "strict_poll",
      start: timings.t_strict_poll_start,
      end: timings.t_strict_poll_end || timings.t_strict_ready,
    },
    {
      stage: "probe_finalize",
      start: timings.t_probe_start || timings.t_probe_redirect,
      end: timings.t_probe_end,
    },
    {
      stage: "redirect",
      start: timings.t_redirect_started || timings.t_redirect_called || timings.t_website_redirect,
      end: timings.t_redirect_finished || timings.t_page_hidden || timings.t_page_unload,
    },
  ];

  for (const span of spanStageMap) {
    const startIso = parseTimingToIso(span.start);
    const endIso = parseTimingToIso(span.end);
    if (!startIso || !endIso) continue;
    events.push({
      trace_id: traceId,
      stage_name: span.stage,
      started_at: startIso,
      ended_at: endIso,
      duration_ms: toDurationMs(startIso, endIso),
      status: "ok",
      metadata: { source: "client" },
    });
  }

  return events;
};

const dedupeAuthTraceEvents = (events: AuthTraceEventUpsert[]): AuthTraceEventUpsert[] => {
  const seen = new Set<string>();
  const deduped: AuthTraceEventUpsert[] = [];
  for (const event of events) {
    const key = `${event.stage_name}|${event.started_at}|${event.ended_at ?? event.started_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
};

const parseUnifiError = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const url = (err as UnifiError)?.unifiUrl || null;
  return { message, url };
};

const parseDevice = (userAgent: string | null) => {
  const ua = userAgent || "";
  if (/iPhone|iPod/i.test(ua)) {
    return { device_type: "mobile", os_family: "ios" };
  }
  if (/iPad/i.test(ua)) {
    return { device_type: "tablet", os_family: "ios" };
  }
  if (/Android/i.test(ua)) {
    if (/Mobile/i.test(ua)) {
      return { device_type: "mobile", os_family: "android" };
    }
    return { device_type: "tablet", os_family: "android" };
  }
  if (/Windows/i.test(ua)) {
    return { device_type: "desktop", os_family: "windows" };
  }
  if (/Mac OS X/i.test(ua)) {
    return { device_type: "desktop", os_family: "macos" };
  }
  if (/Linux/i.test(ua)) {
    return { device_type: "desktop", os_family: "linux" };
  }
  return { device_type: "unknown", os_family: "unknown" };
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  const url = new URL(req.url);
  console.log("Request", { method: req.method, pathname: url.pathname });
  console.log("Origin", { present: Boolean(origin) });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed." }),
      { status: 405, headers: corsHeaders },
    );
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: corsHeaders },
    );
  }

  console.log("Payload", sanitizePayload(payload));

  if (!payload.client_mac || !MAC_REGEX.test(payload.client_mac)) {
    return new Response(
      JSON.stringify({
        error: "client_mac is required and must be a valid MAC address.",
      }),
      { status: 400, headers: corsHeaders },
    );
  }

  const site = (
    payload.unifi_site || Deno.env.get("UNIFI_SITE_NAME") || ""
  ).trim();
  if (!site) {
    return new Response(
      JSON.stringify({ error: "unifi_site is required." }),
      { status: 400, headers: corsHeaders },
    );
  }

  const siteLookupStartMs = Date.now();

  const debugEnabled = payload.debug === true ||
    Deno.env.get("UNIFI_DEBUG") === "true";
  const debugInfo: Record<string, unknown> = {};
  const requestStartMs = Date.now();
  const action = payload.action === "status"
    ? "status"
    : payload.action === "timing"
    ? "timing"
    : "connect";
  const statusMode = payload.status_mode === "strict" ? "strict" : "compat";
  const sessionId = normalizeSessionId(payload.session_id, payload.unifi_t || payload.client_mac);
  const traceId = normalizeTraceId(
    payload.trace_id,
    payload.session_id,
    payload.unifi_t || payload.client_mac,
  );
  const attemptNo = parseAttemptNo(payload.attempt_no);
  let serverLoginMs: number | null = null;
  let serverAuthorizeMs: number | null = null;
  let serverStatusMs: number | null = null;
  let statusEndpointUsed: string | null = null;
  let cookieCacheHit = false;
  const backendTraceEvents: AuthTraceEventUpsert[] = [];

  const pushBackendPointEvent = (
    stageName: string,
    status = "ok",
    message: string | null = null,
    metadata?: Record<string, unknown>,
    eventTimeMs?: number,
  ) => {
    const atIso = new Date(eventTimeMs ?? Date.now()).toISOString();
    backendTraceEvents.push({
      trace_id: traceId,
      stage_name: stageName,
      started_at: atIso,
      ended_at: atIso,
      duration_ms: 0,
      status,
      message,
      metadata: { source: "backend", ...(metadata || {}) },
    });
  };

  const pushBackendSpanEvent = (
    stageName: string,
    startMs: number,
    endMs: number,
    status = "ok",
    message: string | null = null,
    metadata?: Record<string, unknown>,
  ) => {
    const startedAt = new Date(startMs).toISOString();
    const endedAt = new Date(endMs).toISOString();
    backendTraceEvents.push({
      trace_id: traceId,
      stage_name: stageName,
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: Math.max(0, Math.round(endMs - startMs)),
      status,
      message,
      metadata: { source: "backend", ...(metadata || {}) },
    });
  };

  pushBackendPointEvent("request_received", "ok", null, {
    action,
    status_mode: statusMode,
    trace_id: traceId,
    session_id: sessionId,
    attempt_no: attemptNo,
  }, requestStartMs);
  pushBackendPointEvent("request_parsed", "ok");
  pushBackendPointEvent("unifi_site_lookup_started", "ok", null, { site_id: site });
  pushBackendSpanEvent(
    "unifi_site_lookup_finished",
    siteLookupStartMs,
    Date.now(),
    "ok",
    null,
    { site_id: site },
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const unifiBaseUrlRaw = Deno.env.get("UNIFI_BASE_URL");
  const unifiUsername = Deno.env.get("UNIFI_USERNAME");
  const unifiPassword = Deno.env.get("UNIFI_PASSWORD");

  console.log("Env", {
    has_supabase_url: Boolean(supabaseUrl),
    has_service_role_key: Boolean(serviceRoleKey),
    has_unifi_base_url: Boolean(unifiBaseUrlRaw),
    has_unifi_username: Boolean(unifiUsername),
    has_unifi_password: Boolean(unifiPassword),
  });

  let supabase: ReturnType<typeof createClient> | null = null;
  if (supabaseUrl && serviceRoleKey) {
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  const requestUserAgent = req.headers.get("user-agent");
  const requestDevice = parseDevice(requestUserAgent);

  const persistTraceSummaryAndEvents = async (
    outcome: string,
    notes?: string | null,
    extraMetadata?: Record<string, unknown>,
    extraEvents?: AuthTraceEventUpsert[],
  ) => {
    if (!supabase) return;

    const nowIso = new Date().toISOString();
    const baseMetadata: Record<string, unknown> = {
      action,
      status_mode: statusMode,
      session_id: sessionId,
      attempt_no: attemptNo,
      unifi_t: payload.unifi_t ?? null,
      unifi_id: payload.unifi_id ?? null,
      unifi_ap: payload.unifi_ap ?? payload.ap_mac ?? null,
      server_login_ms: serverLoginMs,
      server_authorize_ms: serverAuthorizeMs,
      server_status_ms: serverStatusMs,
      server_total_ms: Date.now() - requestStartMs,
      status_endpoint_used: statusEndpointUsed,
      cookie_cache_hit: cookieCacheHit,
      trace_context: payload.trace_context ?? null,
      ...extraMetadata,
    };

    const requestUrl = payload.trace_context?.request_url ||
      payload.trace_context?.page_url ||
      payload.redirect_url ||
      null;
    const frontendSubmitIso = parseTimingToIso(payload.timings?.t_submit) ||
      parseTimingToIso(payload.timings?.t_submit_clicked);
    const frontendRedirectIso = parseTimingToIso(payload.timings?.t_redirect_finished) ||
      parseTimingToIso(payload.timings?.t_page_unload) ||
      parseTimingToIso(payload.timings?.t_page_hidden) ||
      parseTimingToIso(payload.timings?.t_website_redirect) ||
      parseTimingToIso(payload.timings?.t_redirect_called);
    const frontendDurationMs = toDurationMs(frontendSubmitIso, frontendRedirectIso);

    const traceSummaryPayload: AuthTraceUpsert = {
      trace_id: traceId,
      venue_slug: payload.venue_slug ?? site ?? null,
      site_id: site ?? null,
      client_mac: payload.client_mac?.toLowerCase() ?? null,
      ssid: payload.ssid ?? null,
      ap_mac: payload.ap_mac ?? payload.unifi_ap ?? null,
      request_url: requestUrl,
      user_agent: payload.trace_context?.user_agent ?? requestUserAgent,
      device_os: payload.trace_context?.device_os ?? requestDevice.os_family,
      client_platform: payload.trace_context?.platform ?? null,
      captive_context: payload.trace_context?.is_captive_assistant === true
        ? "captive_assistant"
        : payload.trace_context?.is_captive_assistant === false
        ? "standard_browser"
        : null,
      completed_at: outcome === "in_progress" ? null : nowIso,
      total_duration_ms: Date.now() - requestStartMs,
      backend_duration_ms: Date.now() - requestStartMs,
      frontend_duration_ms: frontendDurationMs,
      outcome,
      notes: notes ?? null,
      metadata: baseMetadata,
    };

    const allEvents = [
      ...backendTraceEvents,
      ...(extraEvents ?? []),
    ];
    const writes: Promise<void>[] = [
      upsertAuthTrace(supabase, traceSummaryPayload),
    ];
    if (allEvents.length > 0) {
      writes.push(upsertAuthTraceEvents(supabase, allEvents));
    }
    await Promise.allSettled(writes);
  };

  if ((action === "connect" || action === "timing") && !supabase) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration.", trace_id: traceId }),
      { status: 500, headers: corsHeaders },
    );
  }

  if (action === "timing" && supabase) {
    if (!payload.unifi_t) {
      return new Response(
        JSON.stringify({ error: "unifi_t is required for timing events.", trace_id: traceId }),
        { status: 400, headers: corsHeaders },
      );
    }

    const timingData = payload.timings ?? {};
    const clientEvents = dedupeAuthTraceEvents([
      ...mapTimingStagesToAuthEvents(traceId, timingData),
      ...((payload.trace_events ?? []).flatMap((event) => {
        if (!event.stage_name) return [];
        const startIso = parseTimingToIso(event.started_at || event.ended_at);
        const endIso = parseTimingToIso(event.ended_at || event.started_at);
        if (!startIso) return [];
        return [{
          trace_id: traceId,
          stage_name: event.stage_name,
          started_at: startIso,
          ended_at: endIso || startIso,
          duration_ms: toDurationMs(startIso, endIso || startIso),
          status: event.status ?? "ok",
          message: event.message ?? null,
          metadata: { source: "client", ...(event.metadata ?? {}) },
        }];
      })),
    ]);

    pushBackendPointEvent("response_build_started", "ok");
    pushBackendPointEvent("response_sent", "ok");

    const traceRow: AttemptTraceUpsert = {
      client_mac: payload.client_mac.toLowerCase(),
      unifi_t: payload.unifi_t,
      unifi_site: site || null,
      session_id: sessionId,
      attempt_no: attemptNo,
      device_user_agent: req.headers.get("user-agent"),
      last_action: "timing",
      updated_at: new Date().toISOString(),
    };

    const upsertRow: Record<string, string | null> = {
      client_mac: payload.client_mac.toLowerCase(),
      unifi_t: payload.unifi_t,
      unifi_site: site || null,
      device_user_agent: req.headers.get("user-agent"),
      updated_at: traceRow.updated_at,
    };

    const submitIso = parseTimingToIso(timingData.t_submit) ||
      parseTimingToIso(timingData.t_submit_clicked);
    const submitClickedIso = parseTimingToIso(timingData.t_submit_clicked) || submitIso;
    const connectResponseIso = parseTimingToIso(timingData.t_connect_response) ||
      parseTimingToIso(timingData.t_connect_success);
    const connectSuccessIso = parseTimingToIso(timingData.t_connect_success) || connectResponseIso;
    const strictPollStartIso = parseTimingToIso(timingData.t_strict_poll_start);
    const strictPollEndIso = parseTimingToIso(timingData.t_strict_poll_end);
    const strictReadyIso = parseTimingToIso(timingData.t_strict_ready);
    const probeStartIso = parseTimingToIso(timingData.t_probe_start) ||
      parseTimingToIso(timingData.t_probe_redirect);
    const probeEndIso = parseTimingToIso(timingData.t_probe_end);
    const probeRedirectIso = parseTimingToIso(timingData.t_probe_redirect) || probeStartIso;
    const redirectCalledIso = parseTimingToIso(timingData.t_redirect_called) ||
      parseTimingToIso(timingData.t_website_redirect);
    const websiteRedirectIso = parseTimingToIso(timingData.t_website_redirect) || redirectCalledIso;
    const pageHiddenIso = parseTimingToIso(timingData.t_page_hidden);
    const pageUnloadIso = parseTimingToIso(timingData.t_page_unload);

    if (submitIso) traceRow.t_submit = submitIso;
    if (submitClickedIso) upsertRow.t_submit_clicked = submitClickedIso;
    if (submitClickedIso) traceRow.t_submit_clicked = submitClickedIso;
    if (connectResponseIso) traceRow.t_connect_response = connectResponseIso;
    if (connectSuccessIso) upsertRow.t_connect_success = connectSuccessIso;
    if (connectSuccessIso) traceRow.t_connect_success = connectSuccessIso;
    if (strictPollStartIso) traceRow.t_strict_poll_start = strictPollStartIso;
    if (strictPollEndIso) traceRow.t_strict_poll_end = strictPollEndIso;
    if (strictReadyIso) upsertRow.t_strict_ready = strictReadyIso;
    if (strictReadyIso) traceRow.t_strict_ready = strictReadyIso;
    if (probeStartIso) traceRow.t_probe_start = probeStartIso;
    if (probeEndIso) traceRow.t_probe_end = probeEndIso;
    if (probeRedirectIso) upsertRow.t_probe_redirect = probeRedirectIso;
    if (probeRedirectIso) traceRow.t_probe_redirect = probeRedirectIso;
    if (redirectCalledIso) traceRow.t_redirect_called = redirectCalledIso;
    if (websiteRedirectIso) upsertRow.t_website_redirect = websiteRedirectIso;
    if (websiteRedirectIso) traceRow.t_website_redirect = websiteRedirectIso;
    if (pageHiddenIso) traceRow.t_page_hidden = pageHiddenIso;
    if (pageUnloadIso) traceRow.t_page_unload = pageUnloadIso;

    const { error: timingError } = await supabase
      .from("wifi_portal_timings")
      .upsert(upsertRow, { onConflict: "client_mac,unifi_t" });

    if (timingError) {
      console.log("wifi_portal_timings upsert warning", timingError.message, {
        client_mac: payload.client_mac,
        unifi_t: payload.unifi_t,
      });
    }

    await upsertAttemptTrace(supabase, traceRow);
    await persistTraceSummaryAndEvents(
      websiteRedirectIso || pageUnloadIso || pageHiddenIso ? "completed" : "in_progress",
      null,
      {
        source: "client_timing",
        client_events_count: clientEvents.length,
      },
      clientEvents,
    );

    return new Response(
      JSON.stringify({ success: true, trace_id: traceId }),
      { status: 200, headers: corsHeaders },
    );
  }

  if (action === "connect" && supabase) {
    const userAgent = req.headers.get("user-agent");
    const ipAddress = getRequestIp(req);
    const now = new Date();
    const weekday = now.getDay();
    const hour = now.getHours();
    const { device_type, os_family } = parseDevice(userAgent);
    const normalizedEmail = payload.email?.trim().toLowerCase() || null;
    const rawPostcode = payload.postcode?.trim() ?? "";
    const normalizedPostcode = rawPostcode ? rawPostcode : null;
    const postcodeValid = normalizedPostcode
      ? /^\d{4}$/.test(normalizedPostcode)
      : false;

    if (normalizedPostcode && !postcodeValid) {
      console.log("Postcode ignored (invalid format)", normalizedPostcode);
    }

    const insertData = {
      full_name: payload.name ?? null,
      email: payload.email ?? null,
      phone: payload.mobile ?? null,
      consent: payload.marketing_opt_in ?? false,
      client_mac: payload.client_mac ?? null,
      ap_mac: payload.ap_mac ?? null,
      ssid: payload.ssid ?? null,
      redirect_url: payload.redirect_url ?? null,
      user_agent: userAgent,
      ip_address: ipAddress,
      unifi_site: payload.unifi_site ?? null,
      unifi_ap: payload.unifi_ap ?? payload.ap_mac ?? null,
      unifi_id: payload.unifi_id ?? payload.client_mac ?? null,
      unifi_t: payload.unifi_t ?? null,
      created_at: now.toISOString(),
    };

    const dbInsertStartMs = Date.now();
    pushBackendPointEvent("db_insert_started", "ok");
    const { error: dbError } = await supabase
      .from("contact_submissions")
      .insert(insertData);
    const dbInsertEndMs = Date.now();
    pushBackendSpanEvent(
      "db_insert_finished",
      dbInsertStartMs,
      dbInsertEndMs,
      dbError ? "error" : "ok",
      dbError ? dbError.message : null,
    );

    if (dbError) {
      console.log("DB insert warning", dbError.message, {
        unifi_site: site,
        unifi_ap: payload.unifi_ap,
        unifi_id: payload.unifi_id,
        unifi_t: payload.unifi_t,
      });
    }

    let guestId: string | null = null;

    if (normalizedEmail) {
      try {
        const { data: existingGuest, error: existingError } = await supabase
          .from("guests")
          .select("id, full_name, mobile, postcode")
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (existingError) {
          console.log("Guest lookup warning", existingError.message);
        } else if (existingGuest?.id) {
          guestId = existingGuest.id;
          const updates: Record<string, string> = {};
          if (payload.name && payload.name.trim()) {
            updates.full_name = payload.name.trim();
          }
          if (payload.mobile && payload.mobile.trim()) {
            updates.mobile = payload.mobile.trim();
          }
          if (
            postcodeValid &&
            normalizedPostcode &&
            normalizedPostcode !== existingGuest.postcode
          ) {
            updates.postcode = normalizedPostcode;
            updates.postcode_updated_at = now.toISOString();
          }
          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("guests")
              .update({ ...updates, updated_at: now.toISOString() })
              .eq("id", guestId);
            if (updateError) {
              console.log("Guest update warning", updateError.message);
            }
          }
        } else {
          const { error: insertGuestError } = await supabase
            .from("guests")
            .insert({
              email: normalizedEmail,
              full_name: payload.name?.trim() || null,
              mobile: payload.mobile?.trim() || null,
              postcode: postcodeValid ? normalizedPostcode : null,
              postcode_updated_at: postcodeValid ? now.toISOString() : null,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            });
          if (insertGuestError) {
            console.log("Guest insert warning", insertGuestError.message);
          }

          const { data: newGuest, error: newGuestError } = await supabase
            .from("guests")
            .select("id")
            .eq("email", normalizedEmail)
            .maybeSingle();
          if (newGuestError) {
            console.log("Guest fetch warning", newGuestError.message);
          } else {
            guestId = newGuest?.id ?? null;
          }
        }
      } catch (err) {
        console.log(
          "Guest upsert warning",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (guestId) {
      try {
        const { error: connectionError } = await supabase
          .from("wifi_connections")
          .insert({
            guest_id: guestId,
            connected_at: now.toISOString(),
            user_agent: userAgent,
            device_type,
            os_family,
            weekday,
            hour,
          });
        if (connectionError) {
          console.log(
            "wifi_connections insert warning",
            connectionError.message,
          );
        }
      } catch (err) {
        console.log(
          "wifi_connections insert warning",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  const connectTimeoutMs = parseTimeoutMs(Deno.env.get("UNIFI_TIMEOUT_MS"), 8000);
  const statusTimeoutMs = parseTimeoutMs(
    Deno.env.get("UNIFI_STATUS_TIMEOUT_MS"),
    2500,
  );
  const sessionCacheTtlMs = parseTimeoutMs(
    Deno.env.get("UNIFI_SESSION_CACHE_TTL_MS"),
    60000,
  );
  const timeoutMs = action === "status" ? statusTimeoutMs : connectTimeoutMs;
  const includeGuestListFallback = Deno.env.get("UNIFI_STATUS_LIST_FALLBACK") === "true";

  if (!unifiBaseUrlRaw || !unifiUsername || !unifiPassword) {
    pushBackendPointEvent("response_build_started", "error");
    pushBackendPointEvent("response_sent", "error", "Missing UniFi configuration");
    await persistTraceSummaryAndEvents("error", "Missing UniFi configuration");
    return new Response(
      JSON.stringify({ error: "Missing UniFi configuration.", trace_id: traceId }),
      { status: 500, headers: corsHeaders },
    );
  }

  const unifiBaseUrl = unifiBaseUrlRaw.replace(/\/$/, "");

  let loginResult: LoginResult;
  const loginStageStartMs = Date.now();
  pushBackendPointEvent("unifi_login_started", "ok");
  try {
    const session = await getUnifiSession(
      unifiBaseUrl,
      unifiUsername,
      unifiPassword,
      timeoutMs,
      sessionCacheTtlMs,
    );
    loginResult = session.loginResult;
    cookieCacheHit = session.cacheHit;
    serverLoginMs = session.loginMs;
    pushBackendSpanEvent(
      "unifi_login_finished",
      loginStageStartMs,
      Date.now(),
      "ok",
      null,
      { cache_hit: cookieCacheHit, endpoint: loginResult.endpoint },
    );
    if (debugEnabled) {
      debugInfo.unifi_login = {
        endpoint: loginResult.endpoint,
        status: loginResult.status,
        body: loginResult.body,
        cache_hit: cookieCacheHit,
        login_ms: serverLoginMs,
      };
    }
  } catch (err) {
    pushBackendSpanEvent(
      "unifi_login_finished",
      loginStageStartMs,
      Date.now(),
      "error",
      err instanceof Error ? err.message : String(err),
    );
    const details = parseUnifiError(err);
    pushBackendPointEvent("response_build_started", "error");
    pushBackendPointEvent("response_sent", "error", details.message);
    await persistTraceSummaryAndEvents("error", details.message);
    return new Response(
      JSON.stringify({
        error: details.message,
        unifi_error: details.message,
        unifi_url: details.url,
        debug: debugEnabled ? debugInfo : undefined,
      }),
      { status: 502, headers: corsHeaders },
    );
  }

  if (action !== "status") {
    const verifyStartMs = Date.now();
    pushBackendPointEvent("optional_unifi_verify_started", "ok");
    let sessionCheck;
    try {
      sessionCheck = await verifyUnifiSession(
        unifiBaseUrl,
        loginResult.cookie,
        timeoutMs,
      );
    } catch (err) {
      pushBackendSpanEvent(
        "optional_unifi_verify_finished",
        verifyStartMs,
        Date.now(),
        "error",
        err instanceof Error ? err.message : String(err),
      );
      clearCachedUnifiCookie();
      const details = parseUnifiError(err);
      pushBackendPointEvent("response_build_started", "error");
      pushBackendPointEvent("response_sent", "error", details.message);
      await persistTraceSummaryAndEvents("error", details.message);
      return new Response(
        JSON.stringify({
          error: "UniFi session not established (proxy/cookie issue)",
          unifi_error: details.message,
          unifi_url: details.url,
          debug: debugEnabled ? debugInfo : undefined,
        }),
        { status: 502, headers: corsHeaders },
      );
    }

    if (
      sessionCheck.res.status !== 200 ||
      sessionCheck.body.includes("LoginRequired")
    ) {
      pushBackendSpanEvent(
        "optional_unifi_verify_finished",
        verifyStartMs,
        Date.now(),
        "error",
        "UniFi session not established",
      );
      clearCachedUnifiCookie();
      pushBackendPointEvent("response_build_started", "error");
      pushBackendPointEvent("response_sent", "error", sessionCheck.body);
      await persistTraceSummaryAndEvents("error", "UniFi session not established");
      return new Response(
        JSON.stringify({
          error: "UniFi session not established (proxy/cookie issue)",
          unifi_error: sessionCheck.body,
          unifi_url: sessionCheck.url,
          debug: debugEnabled ? debugInfo : undefined,
        }),
        { status: 502, headers: corsHeaders },
      );
    }
    pushBackendSpanEvent(
      "optional_unifi_verify_finished",
      verifyStartMs,
      Date.now(),
      "ok",
    );
  } else if (debugEnabled) {
    debugInfo.unifi_session_verify = { skipped: true, reason: "status_fast_path" };
    pushBackendPointEvent("optional_unifi_verify_started", "skipped");
    pushBackendPointEvent("optional_unifi_verify_finished", "skipped");
  }

  if (action === "status") {
    let recentAuthorized = false;
    if (supabase && payload.unifi_t) {
      try {
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data: authEvents, error: authEventError } = await supabase
          .from("wifi_authorization_events")
          .select("authorized_at")
          .eq("client_mac", payload.client_mac.toLowerCase())
          .eq("unifi_t", payload.unifi_t)
          .gte("authorized_at", cutoff)
          .limit(1);
        if (authEventError) {
          console.log("Authorization event lookup warning", authEventError.message);
        } else {
          recentAuthorized = Array.isArray(authEvents) && authEvents.length > 0;
        }
      } catch (err) {
        console.log(
          "Authorization event lookup warning",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    let statusResult;
    const statusStartedAtMs = Date.now();
    pushBackendPointEvent("status_check_started", "ok");
    try {
      statusResult = await checkGuestAuthorization(
        unifiBaseUrl,
        site,
        loginResult.cookie,
        payload.unifi_id || payload.client_mac,
        timeoutMs,
        includeGuestListFallback,
      );

      if (isLoginRequiredResponse(statusResult.res, statusResult.body)) {
        clearCachedUnifiCookie();
        const refreshedSession = await getUnifiSession(
          unifiBaseUrl,
          unifiUsername,
          unifiPassword,
          timeoutMs,
          sessionCacheTtlMs,
          true,
        );
        loginResult = refreshedSession.loginResult;
        cookieCacheHit = false;
        serverLoginMs = (serverLoginMs ?? 0) + refreshedSession.loginMs;
        statusResult = await checkGuestAuthorization(
          unifiBaseUrl,
          site,
          loginResult.cookie,
          payload.unifi_id || payload.client_mac,
          timeoutMs,
          includeGuestListFallback,
        );
      }
      serverStatusMs = Date.now() - statusStartedAtMs;
      statusEndpointUsed = statusResult.endpointUsed || null;
      pushBackendSpanEvent(
        "status_check_finished",
        statusStartedAtMs,
        Date.now(),
        "ok",
        null,
        { endpoint: statusEndpointUsed },
      );
    } catch (err) {
      serverStatusMs = Date.now() - statusStartedAtMs;
      pushBackendSpanEvent(
        "status_check_finished",
        statusStartedAtMs,
        Date.now(),
        "error",
        err instanceof Error ? err.message : String(err),
      );
      const details = parseUnifiError(err);
      const authorizedUnifi = false;
      const authorizedFallback = recentAuthorized;
      const resolvedAuthorized = statusMode === "strict"
        ? authorizedUnifi
        : authorizedUnifi || authorizedFallback;
      const statusSource = authorizedUnifi
        ? "unifi"
        : authorizedFallback
        ? "fallback"
        : "none";

      if (debugEnabled) {
        debugInfo.unifi_status = {
          error: details.message,
          url: details.url,
          status_endpoint_used: statusEndpointUsed,
          status_mode: statusMode,
          authorized_unifi: authorizedUnifi,
          authorized_fallback: authorizedFallback,
          authorized: resolvedAuthorized,
          status_source: statusSource,
          timing: {
            login_ms: serverLoginMs,
            authorize_ms: serverAuthorizeMs,
            status_ms: serverStatusMs,
            total_ms: Date.now() - requestStartMs,
            cache_hit: cookieCacheHit,
          },
        };
      }

      if (supabase && payload.unifi_t) {
        await upsertAttemptTrace(supabase, {
          client_mac: payload.client_mac.toLowerCase(),
          unifi_t: payload.unifi_t,
          unifi_site: site || null,
          session_id: sessionId,
          attempt_no: attemptNo,
          device_user_agent: req.headers.get("user-agent"),
          last_action: "status",
          server_login_ms: serverLoginMs,
          server_authorize_ms: serverAuthorizeMs,
          server_status_ms: serverStatusMs,
          server_total_ms: Date.now() - requestStartMs,
          status_endpoint_used: statusEndpointUsed,
          cookie_cache_hit: cookieCacheHit,
          updated_at: new Date().toISOString(),
        });
      }

      pushBackendPointEvent("response_build_started", "ok");
      pushBackendPointEvent("response_sent", "ok");
      await persistTraceSummaryAndEvents("status_error", details.message, {
        resolved_authorized: resolvedAuthorized,
        authorized_unifi: authorizedUnifi,
        authorized_fallback: authorizedFallback,
        status_source: statusSource,
      });

      return new Response(
        JSON.stringify({
          success: true,
          trace_id: traceId,
          authorized: resolvedAuthorized,
          authorized_unifi: authorizedUnifi,
          authorized_fallback: authorizedFallback,
          status_source: statusSource,
          status_mode: statusMode,
          checked_mac: payload.unifi_id || payload.client_mac,
          status_endpoint_used: statusEndpointUsed,
          timing: {
            login_ms: serverLoginMs,
            authorize_ms: serverAuthorizeMs,
            status_ms: serverStatusMs,
            total_ms: Date.now() - requestStartMs,
            cache_hit: cookieCacheHit,
          },
          status_error: details.message,
          debug: debugEnabled ? debugInfo : undefined,
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    const authorizedUnifi = statusResult.authorized;
    const authorizedFallback = recentAuthorized;
    const resolvedAuthorized = statusMode === "strict"
      ? authorizedUnifi
      : authorizedUnifi || authorizedFallback;
    const statusSource = authorizedUnifi
      ? "unifi"
      : authorizedFallback
      ? "fallback"
      : "none";

    if (debugEnabled) {
      debugInfo.unifi_status = {
        status: statusResult.res.status,
        body: statusResult.body,
        status_endpoint_used: statusResult.endpointUsed || statusEndpointUsed,
        status_mode: statusMode,
        authorized_unifi: authorizedUnifi,
        authorized_fallback: authorizedFallback,
        resolved_authorized: resolvedAuthorized,
        status_source: statusSource,
        timing: {
          login_ms: serverLoginMs,
          authorize_ms: serverAuthorizeMs,
          status_ms: serverStatusMs,
          total_ms: Date.now() - requestStartMs,
          cache_hit: cookieCacheHit,
        },
      };
    }

    if (supabase && payload.unifi_t) {
      await upsertAttemptTrace(supabase, {
        client_mac: payload.client_mac.toLowerCase(),
        unifi_t: payload.unifi_t,
        unifi_site: site || null,
        session_id: sessionId,
        attempt_no: attemptNo,
        device_user_agent: req.headers.get("user-agent"),
        last_action: "status",
        server_login_ms: serverLoginMs,
        server_authorize_ms: serverAuthorizeMs,
        server_status_ms: serverStatusMs,
        server_total_ms: Date.now() - requestStartMs,
        status_endpoint_used: statusResult.endpointUsed || null,
        cookie_cache_hit: cookieCacheHit,
        updated_at: new Date().toISOString(),
      });
    }

    pushBackendPointEvent("response_build_started", "ok");
    pushBackendPointEvent("response_sent", "ok");
    await persistTraceSummaryAndEvents(
      resolvedAuthorized ? "status_authorized" : "status_pending",
      null,
      {
        resolved_authorized: resolvedAuthorized,
        authorized_unifi: authorizedUnifi,
        authorized_fallback: authorizedFallback,
        status_source: statusSource,
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        trace_id: traceId,
        authorized: resolvedAuthorized,
        authorized_unifi: authorizedUnifi,
        authorized_fallback: authorizedFallback,
        status_source: statusSource,
        status_mode: statusMode,
        checked_mac: payload.unifi_id || payload.client_mac,
        status_endpoint_used: statusResult.endpointUsed || null,
        timing: {
          login_ms: serverLoginMs,
          authorize_ms: serverAuthorizeMs,
          status_ms: serverStatusMs,
          total_ms: Date.now() - requestStartMs,
          cache_hit: cookieCacheHit,
        },
        debug: debugEnabled ? debugInfo : undefined,
      }),
      { status: 200, headers: corsHeaders },
    );
  }

  let authorizeResult;
  const authorizeStartedAtMs = Date.now();
  pushBackendPointEvent("unifi_authorize_started", "ok");
  try {
    const authorizeApMac = normalizeMac(payload.unifi_ap || payload.ap_mac || "");
    authorizeResult = await authorizeGuestMac(
      unifiBaseUrl,
      site,
      loginResult.cookie,
      payload.unifi_id || payload.client_mac,
      authorizeApMac || null,
      timeoutMs,
    );
    serverAuthorizeMs = Date.now() - authorizeStartedAtMs;
    pushBackendSpanEvent(
      "unifi_authorize_finished",
      authorizeStartedAtMs,
      Date.now(),
      "ok",
    );
  } catch (err) {
    serverAuthorizeMs = Date.now() - authorizeStartedAtMs;
    pushBackendSpanEvent(
      "unifi_authorize_finished",
      authorizeStartedAtMs,
      Date.now(),
      "error",
      err instanceof Error ? err.message : String(err),
    );
    clearCachedUnifiCookie();
    const details = parseUnifiError(err);
    if (debugEnabled) {
      debugInfo.unifi_authorize = {
        error: details.message,
        url: details.url,
        timing: {
          login_ms: serverLoginMs,
          authorize_ms: serverAuthorizeMs,
          status_ms: serverStatusMs,
          total_ms: Date.now() - requestStartMs,
          cache_hit: cookieCacheHit,
        },
      };
    }

    if (supabase && payload.unifi_t) {
      await upsertAttemptTrace(supabase, {
        client_mac: payload.client_mac.toLowerCase(),
        unifi_t: payload.unifi_t,
        unifi_site: site || null,
        session_id: sessionId,
        attempt_no: attemptNo,
        device_user_agent: req.headers.get("user-agent"),
        last_action: "connect",
        server_login_ms: serverLoginMs,
        server_authorize_ms: serverAuthorizeMs,
        server_status_ms: serverStatusMs,
        server_total_ms: Date.now() - requestStartMs,
        cookie_cache_hit: cookieCacheHit,
        updated_at: new Date().toISOString(),
      });
    }
    pushBackendPointEvent("response_build_started", "error");
    pushBackendPointEvent("response_sent", "error", details.message);
    await persistTraceSummaryAndEvents("error", details.message, {
      stage: "unifi_authorize",
    });
    return new Response(
      JSON.stringify({
        error: details.message,
        trace_id: traceId,
        unifi_error: details.message,
        unifi_url: details.url,
        timing: {
          login_ms: serverLoginMs,
          authorize_ms: serverAuthorizeMs,
          status_ms: serverStatusMs,
          total_ms: Date.now() - requestStartMs,
          cache_hit: cookieCacheHit,
        },
        debug: debugEnabled ? debugInfo : undefined,
      }),
      { status: 502, headers: corsHeaders },
    );
  }

  if (debugEnabled) {
    debugInfo.unifi_authorize = {
      status: authorizeResult.res.status,
      body: authorizeResult.body,
      timing: {
        login_ms: serverLoginMs,
        authorize_ms: serverAuthorizeMs,
        status_ms: serverStatusMs,
        total_ms: Date.now() - requestStartMs,
        cache_hit: cookieCacheHit,
      },
    };
  }

  if (!authorizeResult.ok) {
    if (supabase && payload.unifi_t) {
      await upsertAttemptTrace(supabase, {
        client_mac: payload.client_mac.toLowerCase(),
        unifi_t: payload.unifi_t,
        unifi_site: site || null,
        session_id: sessionId,
        attempt_no: attemptNo,
        device_user_agent: req.headers.get("user-agent"),
        last_action: "connect",
        server_login_ms: serverLoginMs,
        server_authorize_ms: serverAuthorizeMs,
        server_status_ms: serverStatusMs,
        server_total_ms: Date.now() - requestStartMs,
        cookie_cache_hit: cookieCacheHit,
        updated_at: new Date().toISOString(),
      });
    }

    pushBackendPointEvent("response_build_started", "error");
    pushBackendPointEvent("response_sent", "error", "UniFi authorization failed");
    await persistTraceSummaryAndEvents("error", "UniFi authorization failed", {
      stage: "unifi_authorize",
    });

    return new Response(
      JSON.stringify({
        error: "UniFi authorization failed.",
        trace_id: traceId,
        unifi_error: "UniFi authorization failed.",
        unifi_url: authorizeResult.url,
        timing: {
          login_ms: serverLoginMs,
          authorize_ms: serverAuthorizeMs,
          status_ms: serverStatusMs,
          total_ms: Date.now() - requestStartMs,
          cache_hit: cookieCacheHit,
        },
        debug: debugEnabled ? debugInfo : undefined,
      }),
      { status: 502, headers: corsHeaders },
    );
  }

  if (supabase) {
    try {
      const { error: authEventError } = await supabase
        .from("wifi_authorization_events")
        .insert({
          client_mac: payload.client_mac.toLowerCase(),
          unifi_site: site,
          unifi_t: payload.unifi_t ?? null,
          authorized_at: new Date().toISOString(),
        });
      if (authEventError) {
        console.log("Authorization event insert warning", authEventError.message);
      }
    } catch (err) {
      console.log(
        "Authorization event insert warning",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (supabase && payload.unifi_t) {
    await upsertAttemptTrace(supabase, {
      client_mac: payload.client_mac.toLowerCase(),
      unifi_t: payload.unifi_t,
      unifi_site: site || null,
      session_id: sessionId,
      attempt_no: attemptNo,
      device_user_agent: req.headers.get("user-agent"),
      last_action: "connect",
      server_login_ms: serverLoginMs,
      server_authorize_ms: serverAuthorizeMs,
      server_status_ms: serverStatusMs,
      server_total_ms: Date.now() - requestStartMs,
      cookie_cache_hit: cookieCacheHit,
      updated_at: new Date().toISOString(),
    });
  }

  pushBackendPointEvent("response_build_started", "ok");
  pushBackendPointEvent("response_sent", "ok");
  await persistTraceSummaryAndEvents("authorized", null, {
    stage: "unifi_authorize",
  });

  return new Response(
    JSON.stringify({
      success: true,
      trace_id: traceId,
      timing: {
        login_ms: serverLoginMs,
        authorize_ms: serverAuthorizeMs,
        status_ms: serverStatusMs,
        total_ms: Date.now() - requestStartMs,
        cache_hit: cookieCacheHit,
      },
      debug: debugEnabled ? debugInfo : undefined,
    }),
    { status: 200, headers: corsHeaders },
  );
});
