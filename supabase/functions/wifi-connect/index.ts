import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  name?: string;
  email?: string;
  mobile?: string;
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
};

type LoginResult = {
  cookie: string;
  endpoint: string;
  status: number;
  body: string;
};

type UnifiError = Error & { unifiUrl?: string };

const MAC_REGEX = /^([0-9A-Fa-f]{2}([-:])){5}([0-9A-Fa-f]{2})$/;

const isAllowedOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      url.hostname.endsWith(".netlify.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
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
  timeoutMs: number,
) => {
  const payload = JSON.stringify({
    cmd: "authorize-guest",
    mac,
    minutes: 480,
  });

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

const sanitizePayload = (payload: Payload) => {
  return {
    client_mac: payload.client_mac,
    unifi_id: payload.unifi_id,
    unifi_ap: payload.unifi_ap,
    unifi_t: payload.unifi_t,
    ssid: payload.ssid,
    redirect_url: payload.redirect_url,
  };
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

  const debugEnabled = payload.debug === true ||
    Deno.env.get("UNIFI_DEBUG") === "true";
  const debugInfo: Record<string, unknown> = {};

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

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration." }),
      { status: 500, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const userAgent = req.headers.get("user-agent");
  const ipAddress = getRequestIp(req);
  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();
  const { device_type, os_family } = parseDevice(userAgent);
  const normalizedEmail = payload.email?.trim().toLowerCase() || null;

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

  const { error: dbError } = await supabase
    .from("contact_submissions")
    .insert(insertData);

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
        .select("id, full_name, mobile")
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

  const timeoutMs = Number(Deno.env.get("UNIFI_TIMEOUT_MS") || "8000");

  if (!unifiBaseUrlRaw || !unifiUsername || !unifiPassword) {
    return new Response(
      JSON.stringify({ error: "Missing UniFi configuration." }),
      { status: 500, headers: corsHeaders },
    );
  }

  const unifiBaseUrl = unifiBaseUrlRaw.replace(/\/$/, "");

  let loginResult: LoginResult;
  try {
    loginResult = await unifiLogin(
      unifiBaseUrl,
      unifiUsername,
      unifiPassword,
      timeoutMs,
    );
    if (debugEnabled) {
      debugInfo.unifi_login = {
        endpoint: loginResult.endpoint,
        status: loginResult.status,
        body: loginResult.body,
      };
    }
  } catch (err) {
    const details = parseUnifiError(err);
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

  let sessionCheck;
  try {
    sessionCheck = await verifyUnifiSession(
      unifiBaseUrl,
      loginResult.cookie,
      timeoutMs,
    );
  } catch (err) {
    const details = parseUnifiError(err);
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

  let authorizeResult;
  try {
    authorizeResult = await authorizeGuestMac(
      unifiBaseUrl,
      site,
      loginResult.cookie,
      payload.unifi_id || payload.client_mac,
      timeoutMs,
    );
  } catch (err) {
    const details = parseUnifiError(err);
    if (debugEnabled) {
      debugInfo.unifi_authorize = { error: details.message, url: details.url };
    }
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

  if (debugEnabled) {
    debugInfo.unifi_authorize = {
      status: authorizeResult.res.status,
      body: authorizeResult.body,
    };
  }

  if (!authorizeResult.ok) {
    return new Response(
      JSON.stringify({
        error: "UniFi authorization failed.",
        unifi_error: "UniFi authorization failed.",
        unifi_url: authorizeResult.url,
        debug: debugEnabled ? debugInfo : undefined,
      }),
      { status: 502, headers: corsHeaders },
    );
  }

  return new Response(
    JSON.stringify({ success: true, debug: debugEnabled ? debugInfo : undefined }),
    { status: 200, headers: corsHeaders },
  );
});
