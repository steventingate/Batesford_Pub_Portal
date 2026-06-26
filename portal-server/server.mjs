import crypto from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const DIST_INDEX_PATH = path.join(DIST_DIR, "index.html");
const DIST_ASSETS_DIR = path.join(DIST_DIR, "assets");
const HAS_ADMIN_BUILD = existsSync(DIST_INDEX_PATH);

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const WIFI_CONNECT_FUNCTION_URL = (
  process.env.WIFI_CONNECT_FUNCTION_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/wifi-connect` : "")
).trim();
const UNIFI_BASE_URL = (process.env.UNIFI_BASE_URL || "").trim().replace(/\/$/, "");
const UNIFI_USERNAME = (process.env.UNIFI_USERNAME || "").trim();
const UNIFI_PASSWORD = (process.env.UNIFI_PASSWORD || "").trim();
const UNIFI_SITE_NAME = (process.env.UNIFI_SITE_NAME || "").trim();
const UNIFI_ALLOW_INVALID_TLS = process.env.UNIFI_ALLOW_INVALID_TLS === "true";
const UNIFI_AUTH_MODE_RAW = (process.env.UNIFI_AUTH_MODE || "auto").trim().toLowerCase();
const UNIFI_V1_API_KEY = (process.env.UNIFI_V1_API_KEY || "").trim();
const UNIFI_V1_SITE_ID = (process.env.UNIFI_V1_SITE_ID || "").trim();
const UNIFI_V1_BASE_PATH = (process.env.UNIFI_V1_BASE_PATH || "/proxy/network/integration/v1")
  .trim()
  .replace(/\/$/, "");
const UNIFI_AUTH_MODE = UNIFI_AUTH_MODE_RAW === "auto"
  ? (UNIFI_V1_API_KEY ? "v1" : "legacy")
  : UNIFI_AUTH_MODE_RAW;
const UNIFI_DIRECT_LEGACY_CONFIGURED = Boolean(UNIFI_BASE_URL && UNIFI_USERNAME && UNIFI_PASSWORD);
const UNIFI_DIRECT_V1_CONFIGURED = Boolean(UNIFI_BASE_URL && UNIFI_V1_API_KEY);
const UNIFI_DIRECT_CONFIGURED = UNIFI_AUTH_MODE === "v1"
  ? UNIFI_DIRECT_V1_CONFIGURED
  : UNIFI_DIRECT_LEGACY_CONFIGURED;
const UNIFI_AUTH_BACKEND_RAW = (process.env.UNIFI_AUTH_BACKEND || "auto").trim().toLowerCase();
const UNIFI_AUTH_BACKEND = UNIFI_AUTH_BACKEND_RAW === "auto"
  ? ((UNIFI_DIRECT_V1_CONFIGURED || UNIFI_DIRECT_LEGACY_CONFIGURED) ? "direct" : "edge")
  : UNIFI_AUTH_BACKEND_RAW;
const UNIFI_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.UNIFI_TIMEOUT_MS || "8000", 10) || 8000,
);
const UNIFI_STATUS_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.UNIFI_STATUS_TIMEOUT_MS || "2500", 10) || 2500,
);
const UNIFI_AUTH_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.UNIFI_AUTH_MINUTES || "480", 10) || 480,
);
const UNIFI_VERIFY_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.UNIFI_VERIFY_ATTEMPTS || "5", 10) || 5,
);
const UNIFI_VERIFY_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.UNIFI_VERIFY_DELAY_MS || "500", 10) || 500,
);
const UNIFI_V1_CLIENT_LOOKUP_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.UNIFI_V1_CLIENT_LOOKUP_ATTEMPTS || "8", 10) || 8,
);
const UNIFI_V1_CLIENT_LOOKUP_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.UNIFI_V1_CLIENT_LOOKUP_DELAY_MS || "750", 10) || 750,
);
const UNIFI_POST_AUTH_REFRESH_ENABLED = process.env.UNIFI_POST_AUTH_REFRESH_ENABLED !== "false";
const UNIFI_POST_AUTH_REFRESH_DELAY_MS = Math.max(
  15000,
  Number.parseInt(process.env.UNIFI_POST_AUTH_REFRESH_DELAY_MS || "60000", 10) || 60000,
);
const UNIFI_STATUS_LIST_FALLBACK = process.env.UNIFI_STATUS_LIST_FALLBACK === "true";
const DEFAULT_WEBSITE_URL = (process.env.PORTAL_DEFAULT_WEBSITE_URL ||
  "https://www.thebatesfordhotel.com.au/").trim();
const DEFAULT_BRAND_NAME = (process.env.PORTAL_BRAND_NAME || "Guest Wi-Fi").trim();
const MAX_AUTO_RELEASE_ATTEMPTS = Math.max(
  2,
  Number.parseInt(process.env.PORTAL_MAX_AUTO_RELEASE_ATTEMPTS || process.env.PORTAL_MAX_RELEASE_ATTEMPTS || "20", 10) || 20,
);
const MAX_MANUAL_RELEASE_ATTEMPTS = Math.max(
  MAX_AUTO_RELEASE_ATTEMPTS,
  Number.parseInt(process.env.PORTAL_MAX_MANUAL_RELEASE_ATTEMPTS || "30", 10) || 30,
);
const RELEASE_RETRY_DELAY_MS = Math.max(
  1500,
  Number.parseInt(process.env.PORTAL_RELEASE_RETRY_DELAY_MS || "3000", 10) || 3000,
);
const SESSION_WINDOW_MINUTES = Math.max(
  5,
  Number.parseInt(process.env.PORTAL_SESSION_WINDOW_MINUTES || "20", 10) || 20,
);
const SITE_MAP = parseSiteMap(process.env.PORTAL_SITE_MAP);

if (HAS_ADMIN_BUILD) {
  app.use(
    "/assets",
    express.static(DIST_ASSETS_DIR, {
      fallthrough: true,
      immutable: true,
      maxAge: "1y"
    })
  );

  const sendAdminIndex = (_req, res) => {
    res.sendFile(DIST_INDEX_PATH);
  };

  app.get("/admin", sendAdminIndex);
  app.get(/^\/admin\/.*$/, sendAdminIndex);
} else {
  console.warn("[admin_build_missing] Admin SPA build not found. /admin routes will not be available.", {
    dist_dir: DIST_DIR
  });
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

if (UNIFI_AUTH_BACKEND === "edge" && !WIFI_CONNECT_FUNCTION_URL) {
  throw new Error("Missing WIFI_CONNECT_FUNCTION_URL.");
}

if (UNIFI_AUTH_BACKEND === "direct" && !UNIFI_DIRECT_CONFIGURED) {
  throw new Error(
    UNIFI_AUTH_MODE === "v1"
      ? "Missing direct UniFi v1 configuration: UNIFI_BASE_URL and UNIFI_V1_API_KEY are required."
      : "Missing direct UniFi legacy configuration: UNIFI_BASE_URL, UNIFI_USERNAME, and UNIFI_PASSWORD are required."
  );
}

if (UNIFI_AUTH_BACKEND === "direct" && !["legacy", "v1"].includes(UNIFI_AUTH_MODE)) {
  throw new Error(`Unsupported UNIFI_AUTH_MODE: ${UNIFI_AUTH_MODE}. Use auto, legacy, or v1.`);
}

if (UNIFI_AUTH_BACKEND === "direct" && UNIFI_AUTH_MODE === "v1" && !UNIFI_V1_API_KEY) {
  throw new Error("Missing UNIFI_V1_API_KEY for UNIFI_AUTH_MODE=v1.");
}

if (
  UNIFI_AUTH_BACKEND === "direct" &&
  UNIFI_SITE_NAME &&
  /[A-Z_\s]/.test(UNIFI_SITE_NAME) &&
  !Object.prototype.hasOwnProperty.call(SITE_MAP, UNIFI_SITE_NAME)
) {
  log("unifi_site_name_warning", {
    unifi_site_name: UNIFI_SITE_NAME,
    message: "UNIFI_SITE_NAME should be the UniFi site key, not the display label. Prefer xlgkkyrq or leave it empty to use the route site.",
  });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const scheduledSessionRefreshes = new Map();
const pendingSessionAuthorizations = new Map();

function getBearerToken(req) {
  const raw = String(req.headers.authorization || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

async function requireAdminRequest(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    res.status(401).json({ error: "Invalid admin session." });
    return null;
  }

  const { data: adminProfile, error: adminError } = await supabase
    .from("admin_profiles")
    .select("user_id, role, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (adminError || !adminProfile?.user_id) {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }

  return { user, adminProfile };
}

function log(stage, data = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    stage,
    ...data,
  }));
}

function parseSiteMap(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function normalizeMac(value) {
  const compact = String(value || "")
    .replace(/[^0-9a-fA-F]/g, "")
    .toLowerCase();
  if (compact.length !== 12) return "";
  return compact.match(/.{1,2}/g).join(":");
}

function normalizeUnifiSite(routeSite) {
  return UNIFI_SITE_NAME || normalizeSite(routeSite);
}

function getUnifiSiteCandidates(routeSite) {
  return [...new Set([
    UNIFI_SITE_NAME,
    normalizeSite(routeSite),
  ].map((site) => String(site || "").trim()).filter(Boolean))];
}

function normalizeSite(value) {
  return String(value || "").trim();
}

function safeUrl(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function isProbeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return (
      host.includes("captive.apple.com") ||
      host.includes("connectivitycheck.gstatic.com") ||
      host.includes("clients3.google.com") ||
      host.includes("msftconnecttest.com") ||
      host.includes("msftncsi.com") ||
      path.includes("generate_204") ||
      path.includes("hotspot-detect")
    );
  } catch {
    return false;
  }
}

function inferProbeUrlFromUserAgent(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod") || ua.includes("mac os x") || ua.includes("captive")) {
    return "http://captive.apple.com/hotspot-detect.html";
  }
  if (ua.includes("android")) {
    return "http://connectivitycheck.gstatic.com/generate_204";
  }
  if (ua.includes("windows")) {
    return "http://www.msftconnecttest.com/connecttest.txt";
  }
  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toTitleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getSiteConfig(site) {
  const configured = SITE_MAP[site] || {};
  const websiteUrl = safeUrl(configured.websiteUrl, DEFAULT_WEBSITE_URL);
  const continueUrl = safeUrl(configured.continueUrl, websiteUrl);
  return {
    site,
    label: configured.label || toTitleCase(site) || DEFAULT_BRAND_NAME,
    heroTitle: configured.heroTitle || "Guest Wi-Fi Connect",
    brandName: configured.brandName || DEFAULT_BRAND_NAME,
    websiteUrl,
    continueUrl,
    successMessage: configured.successMessage ||
      "Connecting you to guest Wi-Fi. This can take a few seconds on some phones.",
    termsLabel: configured.termsLabel ||
      "I agree to the guest Wi-Fi terms and understand my details may be used for Wi-Fi access and marketing updates.",
  };
}

function buildInternalReleaseUrl(site, sessionKey) {
  return `/guest/s/${encodeURIComponent(site)}/release?session_key=${encodeURIComponent(sessionKey)}`;
}

function buildProgressUrl(site, sessionKey) {
  return `/guest/s/${encodeURIComponent(site)}/progress?session_key=${encodeURIComponent(sessionKey)}`;
}

function buildWebsiteRedirectUrl(site, sessionKey) {
  return `/guest/s/${encodeURIComponent(site)}/website?session_key=${encodeURIComponent(sessionKey)}`;
}

function buildFinishConnectionUrl(site, sessionKey, source = "manual") {
  return `/guest/s/${encodeURIComponent(site)}/finish?session_key=${encodeURIComponent(sessionKey)}&source=${encodeURIComponent(source)}`;
}

function canAutoRetryRelease(session) {
  return Boolean(getReleaseProbe(session).url) &&
    Number(session?.release_attempt_count || 0) < MAX_AUTO_RELEASE_ATTEMPTS;
}

function canManualRetryRelease(session) {
  return Boolean(getReleaseProbe(session).url) &&
    Number(session?.release_attempt_count || 0) < MAX_MANUAL_RELEASE_ATTEMPTS;
}

function getOriginalProbeUrl(session) {
  const candidate = safeUrl(session?.redirect_url, "");
  return isProbeUrl(candidate) ? candidate : "";
}

function getReleaseProbe(session) {
  const original = getOriginalProbeUrl(session);
  if (original) {
    return { url: original, source: "original" };
  }
  const inferred = inferProbeUrlFromUserAgent(session?.user_agent);
  if (inferred && isProbeUrl(inferred)) {
    return { url: inferred, source: "inferred" };
  }
  return { url: "", source: "none" };
}

function buildReleaseFields(session, siteConfig) {
  const websiteUrl = safeUrl(session?.website_url, siteConfig.websiteUrl);
  const probe = getReleaseProbe(session);
  return {
    release_target: probe.url ? buildInternalReleaseUrl(siteConfig.site, session.session_key) : null,
    continue_target: buildWebsiteRedirectUrl(siteConfig.site, session.session_key),
    secondary_target: buildWebsiteRedirectUrl(siteConfig.site, session.session_key),
    final_redirect_url: probe.url || websiteUrl,
    website_url: websiteUrl,
    release_mode: probe.url
      ? (probe.source === "inferred" ? "inferred_probe_redirect" : "original_probe_redirect")
      : "manual_connected_page",
  };
}

function buildConnectPayloadFromSession(session, siteConfig) {
  return {
    action: "connect",
    unifi_site: session.site_slug,
    client_mac: session.client_mac,
    ap_mac: session.ap_mac,
    unifi_t: session.unifi_t,
    redirect_url: session.redirect_url,
    ssid: session.ssid,
    name: session.guest_name || "Guest",
    email: session.guest_email || "",
    mobile: session.guest_phone || undefined,
    postcode: session.guest_postcode || undefined,
    marketing_opt_in: true,
    trace_id: session.trace_id,
    venue_slug: session.site_slug,
    website_url: session.website_url || siteConfig.websiteUrl,
  };
}

function isDirectV1Mode() {
  return UNIFI_AUTH_BACKEND === "direct" && UNIFI_AUTH_MODE === "v1";
}

function isRetriableV1AuthorizationError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("UniFi v1 client lookup returned no client for MAC");
}

async function finalizeAuthorizedSession(session, siteConfig, connectResult) {
  const redirectContract = connectResult.body?.redirect_contract || {};
  const websiteUrl = safeUrl(
    redirectContract.website_url,
    session.website_url || siteConfig.websiteUrl,
  );
  const releaseFields = buildReleaseFields({
    ...session,
    website_url: websiteUrl,
  }, siteConfig);
  const completedSession = await updateSession(session.session_key, {
    status: "completed",
    trace_id: connectResult.body?.trace_id || session.trace_id,
    authorized_at: new Date().toISOString(),
    release_attempted_at: null,
    release_attempt_count: 0,
    release_result: null,
    ...releaseFields,
    last_error: null,
  });
  recordTraceEvent(completedSession, "unifi_authorized", {
    metadata: {
      release_mode: completedSession.release_mode,
      has_probe_url: Boolean(getReleaseProbe(completedSession).url),
      release_probe_source: getReleaseProbe(completedSession).source,
      wifi_trace_id: connectResult.body?.trace_id || session.trace_id,
      auth_backend: UNIFI_AUTH_BACKEND,
      auth_mode: UNIFI_AUTH_MODE,
      resolved_unifi_site: connectResult.body?.debug?.unifi_authorize?.resolved_site || null,
    },
  });
  schedulePostAuthRefresh(completedSession, siteConfig);
  return completedSession;
}

function ensureBackgroundV1Authorization(session, siteConfig, reason) {
  if (!isDirectV1Mode()) return;
  if (!session?.session_key) return;
  if (pendingSessionAuthorizations.has(session.session_key)) return;

  const task = (async () => {
    try {
      const latest = await getSession(session.session_key);
      if (!latest || latest.status !== "submitting") return;

      log("background_v1_authorize_started", {
        site: latest.site_slug,
        session_key: latest.session_key,
        client_mac: latest.client_mac,
        reason,
      });

      const connectResult = await authorizeWifi(buildConnectPayloadFromSession(latest, siteConfig));

      log("background_v1_authorize_finished", {
        site: latest.site_slug,
        session_key: latest.session_key,
        client_mac: latest.client_mac,
        reason,
        status: connectResult.status,
        success: connectResult.ok && connectResult.body?.success === true,
      });

      if (!connectResult.ok || connectResult.body?.success !== true) {
        const message = connectResult.body?.error ||
          connectResult.body?.unifi_error ||
          "Could not connect to Wi-Fi right now. Please try again.";
        await updateSession(latest.session_key, {
          status: "failed",
          last_error: message,
        });
        return;
      }

      await finalizeAuthorizedSession(latest, siteConfig, connectResult);
    } catch (error) {
      if (isRetriableV1AuthorizationError(error)) {
        log("background_v1_authorize_retry_pending", {
          site: session.site_slug,
          session_key: session.session_key,
          client_mac: session.client_mac,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      log("background_v1_authorize_error", {
        site: session.site_slug,
        session_key: session.session_key,
        client_mac: session.client_mac,
        reason,
        error: message,
      });
      try {
        await updateSession(session.session_key, {
          status: "failed",
          last_error: message,
        });
      } catch {
        // Ignore follow-up session update failures.
      }
    } finally {
      pendingSessionAuthorizations.delete(session.session_key);
    }
  })();

  pendingSessionAuthorizations.set(session.session_key, task);
}

function shouldRefreshSessionAuthorization(session) {
  if (UNIFI_AUTH_BACKEND !== "direct") return false;
  const authorizedAtMs = session?.authorized_at ? Date.parse(session.authorized_at) : NaN;
  if (!Number.isFinite(authorizedAtMs)) return true;
  return Date.now() - authorizedAtMs >= 15000;
}

async function refreshSessionAuthorization(session, siteConfig, reason) {
  if (!shouldRefreshSessionAuthorization(session)) {
    return session;
  }

  log("session_authorization_refresh_started", {
    site: session.site_slug,
    session_key: session.session_key,
    client_mac: session.client_mac,
    reason,
    auth_mode: UNIFI_AUTH_MODE,
  });

  const result = await authorizeWifi(buildConnectPayloadFromSession(session, siteConfig));
  if (!result.ok || result.body?.success !== true || result.body?.authorized !== true) {
    const errorMessage = result.body?.error ||
      result.body?.unifi_error ||
      "Wi-Fi reauthorization failed.";
    throw new Error(errorMessage);
  }

  const updated = await updateSession(session.session_key, {
    status: "completed",
    authorized_at: new Date().toISOString(),
    ...buildReleaseFields(session, siteConfig),
    last_error: null,
  });

  log("session_authorization_refresh_finished", {
    site: updated.site_slug,
    session_key: updated.session_key,
    client_mac: updated.client_mac,
    reason,
    auth_mode: UNIFI_AUTH_MODE,
    resolved_unifi_site: result.body?.debug?.unifi_authorize?.resolved_site || null,
  });
  recordTraceEvent(updated, "unifi_reauthorized", {
    metadata: {
      reason,
      auth_backend: UNIFI_AUTH_BACKEND,
      auth_mode: UNIFI_AUTH_MODE,
      resolved_unifi_site: result.body?.debug?.unifi_authorize?.resolved_site || null,
    },
  });

  return updated;
}

function schedulePostAuthRefresh(session, siteConfig) {
  if (!UNIFI_POST_AUTH_REFRESH_ENABLED) return;
  if (UNIFI_AUTH_BACKEND !== "direct" || UNIFI_AUTH_MODE !== "legacy") return;
  if (!session?.session_key) return;

  const existingTimer = scheduledSessionRefreshes.get(session.session_key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    scheduledSessionRefreshes.delete(session.session_key);
    void (async () => {
      try {
        const latest = await getSession(session.session_key);
        if (!latest || latest.status !== "completed") return;

        const refreshed = await refreshSessionAuthorization(latest, siteConfig, "post_auth_background_refresh");
        recordTraceEvent(refreshed, "post_auth_background_refresh", {
          metadata: {
            auth_backend: UNIFI_AUTH_BACKEND,
            auth_mode: UNIFI_AUTH_MODE,
            delay_ms: UNIFI_POST_AUTH_REFRESH_DELAY_MS,
          },
        });
      } catch (error) {
        log("post_auth_background_refresh_error", {
          site: session.site_slug,
          session_key: session.session_key,
          client_mac: session.client_mac,
          delay_ms: UNIFI_POST_AUTH_REFRESH_DELAY_MS,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, UNIFI_POST_AUTH_REFRESH_DELAY_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  scheduledSessionRefreshes.set(session.session_key, timer);
  log("post_auth_background_refresh_scheduled", {
    site: session.site_slug,
    session_key: session.session_key,
    client_mac: session.client_mac,
    delay_ms: UNIFI_POST_AUTH_REFRESH_DELAY_MS,
    auth_mode: UNIFI_AUTH_MODE,
  });
}

function buildBaseSession(site, query, userAgent) {
  const siteConfig = getSiteConfig(site);
  const clientMac = normalizeMac(query.id || query.client_mac);
  const apMac = normalizeMac(query.ap || query.ap_mac);
  const redirectUrl = typeof query.url === "string" ? query.url : null;
  const sessionKey = crypto.randomUUID();
  const session = {
    session_key: sessionKey,
    site_slug: site,
    client_mac: clientMac,
    ap_mac: apMac || null,
    ssid: typeof query.ssid === "string" ? query.ssid : null,
    unifi_t: typeof query.t === "string" ? query.t : null,
    redirect_url: redirectUrl,
    user_agent: userAgent || null,
    status: "presented",
    trace_id: `portal-${crypto.randomUUID()}`,
    website_url: siteConfig.websiteUrl,
  };

  return {
    ...session,
    ...buildReleaseFields(session, siteConfig),
  };
}

function renderPage({ title, body, bodyClass = "" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #214f32;
        --card: #ffffff;
        --text: #173220;
        --muted: #5b6d61;
        --line: rgba(23, 50, 32, 0.14);
        --accent: #214f32;
        --accent-2: #dcebe1;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 28%),
          linear-gradient(180deg, var(--bg) 0 34vh, #edf3ee 34vh 100%);
      }
      .shell {
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 16px 64px;
      }
      .card {
        background: var(--card);
        border-radius: 28px;
        box-shadow: 0 20px 48px rgba(14, 33, 20, 0.12);
        padding: 32px 28px;
      }
      .brand {
        color: #fff;
        text-align: center;
        font-size: 15px;
        letter-spacing: 0.18em;
        font-weight: 800;
        margin: 0 0 18px;
      }
      h1 {
        margin: 0 0 12px;
        text-align: center;
        font-size: clamp(2rem, 7vw, 3.25rem);
        line-height: 0.95;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      h2 {
        margin: 0 0 14px;
        text-align: center;
        font-size: clamp(1.7rem, 5vw, 2.5rem);
      }
      p.lead {
        margin: 0 auto 28px;
        max-width: 34rem;
        text-align: center;
        color: var(--muted);
        font-size: 1.05rem;
        line-height: 1.6;
      }
      form { display: grid; gap: 18px; }
      label {
        font-size: 0.95rem;
        font-weight: 700;
        display: block;
        margin-bottom: 8px;
      }
      input[type="text"], input[type="email"], input[type="tel"] {
        width: 100%;
        border: 2px solid var(--line);
        border-radius: 18px;
        padding: 16px 18px;
        font: inherit;
        color: var(--text);
        background: #fff;
      }
      .checkbox {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        border: 2px solid var(--accent);
        background: var(--accent-2);
        border-radius: 20px;
        padding: 16px 18px;
      }
      .checkbox input {
        margin-top: 4px;
        width: 28px;
        height: 28px;
        accent-color: var(--accent);
      }
      .actions {
        display: grid;
        gap: 14px;
        margin-top: 6px;
      }
      button, .btn {
        border: 0;
        border-radius: 18px;
        padding: 18px 22px;
        background: var(--accent);
        color: #fff;
        font: inherit;
        font-weight: 800;
        font-size: 1.05rem;
        text-decoration: none;
        text-align: center;
        cursor: pointer;
      }
      .btn.secondary {
        background: #fff;
        color: var(--accent);
        border: 2px solid var(--accent);
      }
      .status-card {
        text-align: center;
        padding-top: 42px;
        padding-bottom: 42px;
      }
      .spinner {
        width: 72px;
        height: 72px;
        border-radius: 999px;
        margin: 0 auto 20px;
        border: 8px solid rgba(33, 79, 50, 0.12);
        border-top-color: var(--accent);
        animation: spin 1s linear infinite;
      }
      .subtle {
        color: var(--muted);
        font-size: 0.98rem;
        line-height: 1.6;
      }
      .error {
        margin: 0 auto 18px;
        border-radius: 16px;
        padding: 14px 16px;
        background: #ffe5e1;
        color: #882c1e;
        font-weight: 700;
      }
      .footer-note {
        margin: 22px auto 0;
        max-width: 34rem;
        text-align: center;
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.65;
      }
      .hidden { display: none !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 640px) {
        .shell { padding: 24px 12px 48px; }
        .card { padding: 24px 20px; border-radius: 24px; }
      }
    </style>
  </head>
  <body class="${escapeHtml(bodyClass)}">
    <div class="shell">
      ${body}
    </div>
  </body>
</html>`;
}

function renderFormPage({ siteConfig, site, session, errorMessage = "", values = {} }) {
  const errorBlock = errorMessage
    ? `<div class="error">${escapeHtml(errorMessage)}</div>`
    : "";
  return renderPage({
    title: `${siteConfig.label} Guest Wi-Fi`,
    body: `
      <div class="brand">${escapeHtml(siteConfig.brandName)}</div>
      <div class="card">
        <h1>Guest Wi-Fi</h1>
        <h2>${escapeHtml(siteConfig.heroTitle)}</h2>
        <p class="lead">Enter your details to connect to guest Wi-Fi. This helps us keep the network safe and capture your consent correctly.</p>
        ${errorBlock}
        <form id="portal-form" method="post" action="/guest/s/${encodeURIComponent(site)}/connect">
          <input type="hidden" name="session_key" value="${escapeHtml(session.session_key)}" />
          <div>
            <label for="name">Full name</label>
            <input id="name" name="name" type="text" autocomplete="name" required value="${escapeHtml(values.name || "")}" />
          </div>
          <div>
            <label for="email">Email address</label>
            <input id="email" name="email" type="email" autocomplete="email" required value="${escapeHtml(values.email || "")}" />
          </div>
          <div>
            <label for="mobile">Contact number</label>
            <input id="mobile" name="mobile" type="tel" autocomplete="tel" value="${escapeHtml(values.mobile || "")}" />
          </div>
          <div>
            <label for="postcode">Postcode (optional)</label>
            <input id="postcode" name="postcode" type="text" inputmode="numeric" pattern="[0-9]{4}" value="${escapeHtml(values.postcode || "")}" />
          </div>
          <label class="checkbox">
            <input type="checkbox" name="agree" value="1" ${values.agree ? "checked" : ""} required />
            <span>${escapeHtml(siteConfig.termsLabel)}</span>
          </label>
          <div class="actions">
            <button id="submit-button" type="submit">Connect and Agree</button>
          </div>
        </form>
        <p class="footer-note">By connecting you accept the acceptable use policy and consent to receiving occasional offers. We never share your details with third parties.</p>
      </div>
      <script>
        const form = document.getElementById("portal-form");
        const submitButton = document.getElementById("submit-button");
        const eventUrl = ${JSON.stringify(`/guest/s/${site}/event?session_key=${encodeURIComponent(session.session_key)}`)};
        let pageHiddenSent = false;

        function sendPageHidden(reason) {
          if (pageHiddenSent) return;
          pageHiddenSent = true;
          const payload = JSON.stringify({
            stage_name: "page_hidden",
            reason,
            page: "form",
          });
          if (navigator.sendBeacon) {
            navigator.sendBeacon(eventUrl, new Blob([payload], { type: "application/json" }));
            return;
          }
          fetch(eventUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }

        form?.addEventListener("submit", () => {
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Connecting you to Wi-Fi...";
          }
        });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") sendPageHidden("visibility_hidden");
        });
        window.addEventListener("pagehide", () => sendPageHidden("pagehide"));
      </script>
    `,
  });
}

function renderProgressPage({ siteConfig, site, session }) {
  return renderPage({
    title: `${siteConfig.label} Connecting`,
    body: `
      <div class="brand">${escapeHtml(siteConfig.brandName)}</div>
      <div class="card status-card">
        <div class="spinner"></div>
        <h1>Guest Wi-Fi</h1>
        <h2 id="status-title">Connecting You To Guest Wi-Fi</h2>
        <p id="status-copy" class="lead">${escapeHtml(siteConfig.successMessage)}</p>
        <div id="manual-actions" class="actions hidden">
          <a id="website-link" class="btn" href="${escapeHtml(session.continue_target || buildWebsiteRedirectUrl(site, session.session_key))}">Open venue website</a>
          <button id="done-button" type="button" class="btn secondary">Done</button>
        </div>
        <p class="footer-note subtle">Your Wi-Fi access has been approved. If this window stays open, tap Done or open the venue website manually.</p>
      </div>
      <script>
        const sessionKey = ${JSON.stringify(session.session_key)};
        const sessionUrl = ${JSON.stringify(`/guest/s/${site}/session?session_key=${encodeURIComponent(session.session_key)}`)};
        const eventUrl = ${JSON.stringify(`/guest/s/${site}/event?session_key=${encodeURIComponent(session.session_key)}`)};
        const statusTitle = document.getElementById("status-title");
        const statusCopy = document.getElementById("status-copy");
        const manualActions = document.getElementById("manual-actions");
        const websiteLink = document.getElementById("website-link");
        const doneButton = document.getElementById("done-button");
        let releaseStarted = false;
        let pageHiddenSent = false;

        function navigate(url) {
          if (!url) return;
          window.location.assign(url);
        }

        function showManualActions() {
          manualActions?.classList.remove("hidden");
        }

        function sendPageHidden(reason) {
          if (pageHiddenSent) return;
          pageHiddenSent = true;
          const payload = JSON.stringify({
            stage_name: "page_hidden",
            reason,
            page: "progress",
            release_started: releaseStarted,
          });
          if (navigator.sendBeacon) {
            navigator.sendBeacon(eventUrl, new Blob([payload], { type: "application/json" }));
            return;
          }
          fetch(eventUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }

        function beginRelease(payload) {
          if (releaseStarted) return;
          releaseStarted = true;
          const releaseUrl = payload.release_target;
          const websiteUrl = payload.continue_target || payload.website_url || payload.secondary_target;
          if (websiteLink && websiteUrl) websiteLink.href = websiteUrl;
          if (statusTitle) statusTitle.textContent = "Finishing Your Connection";
          if (statusCopy) statusCopy.textContent = "Your Wi-Fi access has been approved. This window should close automatically.";
          if (releaseUrl) {
            setTimeout(() => navigate(releaseUrl), 150);
            setTimeout(showManualActions, 5000);
            return;
          }
          showManualActions();
        }

        async function pollSession() {
          try {
            const res = await fetch(sessionUrl, { headers: { "accept": "application/json" }, cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.success) {
              throw new Error(data.error || "Unable to check Wi-Fi status.");
            }
            if (data.phase === "release" || data.phase === "connected") {
              beginRelease(data);
              return;
            }
            if (data.phase === "failed") {
              if (statusTitle) statusTitle.textContent = "Could not connect right now";
              if (statusCopy) statusCopy.textContent = data.message || "Please close this window and try again.";
              showManualActions();
              return;
            }
            setTimeout(pollSession, 1200);
          } catch (error) {
            if (statusTitle) statusTitle.textContent = "Still connecting";
            if (statusCopy) statusCopy.textContent = "Please keep this window open for a few more seconds.";
            setTimeout(pollSession, 1800);
          }
        }

        websiteLink?.addEventListener("click", (event) => {
          event.preventDefault();
          navigate(websiteLink.href);
        });
        doneButton?.addEventListener("click", () => {
          window.close();
        });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") sendPageHidden("visibility_hidden");
        });
        window.addEventListener("pagehide", () => sendPageHidden("pagehide"));

        if (${JSON.stringify(session.status)} === "completed") {
          beginRelease(${JSON.stringify({
            release_target: Number(session.release_attempt_count || 0) < 1 ? session.release_target : null,
            continue_target: session.continue_target,
            website_url: session.website_url,
            secondary_target: session.secondary_target,
          })});
        } else {
          pollSession();
          setTimeout(showManualActions, 5000);
        }

      </script>
    `,
  });
}

function renderReleasePage({
  siteConfig,
  websiteUrl,
  eventUrl = "",
  finishUrl = "",
  releaseAttempts = 0,
  maxAutoReleaseAttempts = MAX_AUTO_RELEASE_ATTEMPTS,
  maxManualReleaseAttempts = MAX_MANUAL_RELEASE_ATTEMPTS,
}) {
  const rawWebsiteUrl = String(websiteUrl || "");
  const websiteRedirectUrl = rawWebsiteUrl.startsWith("/")
    ? rawWebsiteUrl
    : safeUrl(rawWebsiteUrl, siteConfig.websiteUrl);
  const retryable = Boolean(finishUrl);
  return renderPage({
    title: `${siteConfig.label} Connected`,
    body: `
      <div class="brand">${escapeHtml(siteConfig.brandName)}</div>
      <div class="card status-card">
        <div class="spinner"></div>
        <h1>Guest Wi-Fi</h1>
        <h2 id="release-title">Finishing Your Connection</h2>
        <p id="release-copy" class="lead">Your Wi-Fi access has been approved. We are finishing the captive network check now.</p>
        <div class="actions">
          ${retryable
            ? `<a id="release-finish-link" class="btn" href="${escapeHtml(finishUrl)}">Try to finish connection</a>`
            : ""}
          <a id="release-website-link" class="btn secondary" href="${escapeHtml(websiteRedirectUrl)}">Open venue website</a>
          <button id="release-done" type="button" class="btn secondary">Done</button>
        </div>
        <p id="release-note" class="footer-note subtle">If this page stays open, we will retry the Apple captive check automatically. You can also trigger it manually.</p>
      </div>
      <script>
        const websiteUrl = ${JSON.stringify(websiteRedirectUrl)};
        const finishUrl = ${JSON.stringify(finishUrl)};
        const eventUrl = ${JSON.stringify(eventUrl)};
        const retryable = ${JSON.stringify(retryable)};
        const releaseAttempts = ${JSON.stringify(releaseAttempts)};
        const maxAutoReleaseAttempts = ${JSON.stringify(maxAutoReleaseAttempts)};
        const maxManualReleaseAttempts = ${JSON.stringify(maxManualReleaseAttempts)};
        const retryDelayMs = ${JSON.stringify(RELEASE_RETRY_DELAY_MS)};
        const doneButton = document.getElementById("release-done");
        const finishLink = document.getElementById("release-finish-link");
        const websiteLink = document.getElementById("release-website-link");
        const releaseCopy = document.getElementById("release-copy");
        const releaseNote = document.getElementById("release-note");
        let pageHiddenSent = false;
        let retryTriggered = false;

        function navigate(url) {
          if (!url) return;
          window.location.assign(url);
        }

        function updateRetryMessage() {
          if (!releaseCopy || !releaseNote) return;
          if (retryable) {
            if (releaseAttempts >= maxAutoReleaseAttempts) {
              releaseCopy.textContent = "Your Wi-Fi access has been approved, but automatic captive completion stalled on this device.";
              releaseNote.textContent = "Tap Try to finish connection again. If iPhone still does not close the captive window, Open venue website is the fallback.";
              return;
            }
            releaseCopy.textContent = "Your Wi-Fi access has been approved. We are retrying the Apple captive check now.";
            releaseNote.textContent = "If the network still has not closed, tap Try to finish connection. Open venue website is only a fallback.";
            return;
          }
          if (releaseAttempts >= maxManualReleaseAttempts) {
            releaseCopy.textContent = "Your Wi-Fi access has been approved, but this device has not completed the captive network check.";
            releaseNote.textContent = "Automatic and manual captive retries are exhausted. Tap Open venue website or Done, then check whether Wi-Fi is usable.";
            return;
          }
          releaseCopy.textContent = "Your Wi-Fi access has been approved. This window may stay open until your device finishes its captive network check.";
          releaseNote.textContent = "If it does not close, tap Open venue website or Done and confirm the device now has internet access.";
        }

        function sendPageHidden(reason) {
          if (!eventUrl || pageHiddenSent) return;
          pageHiddenSent = true;
          const payload = JSON.stringify({
            stage_name: "page_hidden",
            reason,
            page: "release",
          });
          if (navigator.sendBeacon) {
            navigator.sendBeacon(eventUrl, new Blob([payload], { type: "application/json" }));
            return;
          }
          fetch(eventUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }

        function beginRetry(source) {
          if (!retryable || retryTriggered) return;
          retryTriggered = true;
          const nextUrl = new URL(finishUrl, window.location.origin);
          nextUrl.searchParams.set("source", source);
          navigate(nextUrl.toString());
        }

        updateRetryMessage();

        finishLink?.addEventListener("click", (event) => {
          event.preventDefault();
          beginRetry("manual");
        });

        websiteLink?.addEventListener("click", (event) => {
          event.preventDefault();
          navigate(websiteUrl);
        });

        doneButton?.addEventListener("click", () => {
          window.close();
        });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") sendPageHidden("visibility_hidden");
        });
        window.addEventListener("pagehide", () => sendPageHidden("pagehide"));

        if (retryable && releaseAttempts < maxAutoReleaseAttempts) {
          setTimeout(() => beginRetry("auto"), retryDelayMs);
        }
      </script>
    `,
  });
}

function renderInfoPage() {
  return renderPage({
    title: "Wi-Fi Portal",
    body: `
      <div class="card status-card">
        <h2>Wi-Fi Portal Service</h2>
        <p class="lead">This service is intended to be opened by the UniFi external portal redirect.</p>
        <p class="subtle">Configure UniFi to send guests to <code>/guest/s/&lt;site&gt;/</code> or <code>/portal?site=&lt;site&gt;</code>.</p>
      </div>
    `,
  });
}

function renderMissingParamsPage(message) {
  return renderPage({
    title: "Wi-Fi Portal Error",
    body: `
      <div class="card status-card">
        <h2>Wi-Fi Portal Error</h2>
        <p class="lead">${escapeHtml(message)}</p>
      </div>
    `,
  });
}

async function upsertSession(values) {
  const { data, error } = await supabase
    .from("portal_sessions")
    .upsert(values, { onConflict: "session_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function recordTraceEvent(session, stageName, { status = "ok", message = null, metadata = {} } = {}) {
  if (!session?.trace_id) return;
  void (async () => {
    const now = new Date().toISOString();
    try {
      await supabase
        .from("wifi_auth_traces")
        .upsert({
          trace_id: session.trace_id,
          venue_slug: session.site_slug,
          site_id: session.site_slug,
          client_mac: session.client_mac,
          ssid: session.ssid,
          ap_mac: session.ap_mac,
          request_url: session.redirect_url,
          user_agent: session.user_agent,
        }, { onConflict: "trace_id" });

      const { error } = await supabase
        .from("wifi_auth_trace_events")
        .insert({
          trace_id: session.trace_id,
          stage_name: stageName,
          started_at: now,
          ended_at: now,
          duration_ms: 0,
          status,
          message,
          metadata,
        });
      if (error) throw error;
    } catch (error) {
      log("trace_event_insert_error", {
        trace_id: session.trace_id,
        stage_name: stageName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

async function updateSession(sessionKey, values) {
  const { data, error } = await supabase
    .from("portal_sessions")
    .update(values)
    .eq("session_key", sessionKey)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function getSession(sessionKey) {
  const { data, error } = await supabase
    .from("portal_sessions")
    .select("*")
    .eq("session_key", sessionKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findRecentRecoverableSession(site, clientMac) {
  const sinceIso = new Date(Date.now() - SESSION_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("portal_sessions")
    .select("*")
    .eq("site_slug", site)
    .eq("client_mac", clientMac)
    .gte("updated_at", sinceIso)
    .in("status", ["submitting", "completed"])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function callWifiConnect(payload) {
  const startedAt = Date.now();
  const res = await fetch(WIFI_CONNECT_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  log("wifi_connect_response", {
    action: payload.action,
    status: res.status,
    elapsed_ms: Date.now() - startedAt,
    site: payload.unifi_site,
    client_mac: payload.client_mac,
  });
  return { ok: res.ok, status: res.status, body };
}

function extractCookies(setCookie) {
  if (!setCookie) return "";
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .flatMap((item) => String(item).split(/,(?=[^;]+=[^;]+)/g))
    .map((item) => item.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function readJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function getResponseRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrivateIpv4Host(hostname) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map((item) => Number(item));
  if (octets.some((item) => !Number.isFinite(item) || item < 0 || item > 255)) return true;
  const [first, second] = octets;
  if (first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  return false;
}

function isSafeExternalUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return false;
    if (isPrivateIpv4Host(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function buildRedirectContract(redirectUrl, verifyAuthorized, verifyAttempts, websiteUrl) {
  const safeWebsite = isSafeExternalUrl(websiteUrl)
    ? websiteUrl
    : "https://www.thebatesfordhotel.com.au/";
  const safeProbe = redirectUrl && isProbeUrl(redirectUrl) && isSafeExternalUrl(redirectUrl)
    ? redirectUrl
    : null;

  if (verifyAuthorized) {
    return {
      redirect_mode: safeProbe ? "probe_redirect" : "website_redirect",
      redirect_url: safeProbe || safeWebsite,
      website_url: safeWebsite,
      release_result: "authorized_verified",
      verify_attempts: Math.max(1, verifyAttempts),
    };
  }

  return {
    redirect_mode: "verify_timeout_success_page",
    redirect_url: null,
    website_url: safeWebsite,
    release_result: "authorized_unverified_timeout",
    verify_attempts: Math.max(1, verifyAttempts),
  };
}

function unifiRequest(path, {
  method = "GET",
  headers = {},
  body = null,
  timeoutMs = UNIFI_TIMEOUT_MS,
} = {}) {
  if (!UNIFI_BASE_URL) {
    throw new Error("Missing UNIFI_BASE_URL.");
  }

  const url = new URL(path, `${UNIFI_BASE_URL}/`);
  const useHttps = url.protocol === "https:";
  const transport = useHttps ? https : http;
  const requestOptions = {
    method,
    hostname: url.hostname,
    port: url.port || (useHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    headers,
    timeout: timeoutMs,
    rejectUnauthorized: useHttps ? !UNIFI_ALLOW_INVALID_TLS : undefined,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(requestOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode || 0,
          ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          headers: res.headers,
          body: text.length > 4000 ? `${text.slice(0, 4000)}...` : text,
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`UniFi request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function directUnifiLogin() {
  const payload = JSON.stringify({
    username: UNIFI_USERNAME,
    password: UNIFI_PASSWORD,
    remember: true,
  });
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  };

  let result = await unifiRequest("/api/auth/login", {
    method: "POST",
    headers,
    body: payload,
  });
  let endpoint = "/api/auth/login";
  if (!result.ok) {
    result = await unifiRequest("/api/login", {
      method: "POST",
      headers,
      body: payload,
    });
    endpoint = "/api/login";
  }

  if (!result.ok) {
    throw new Error(`UniFi authentication failed (${endpoint}) status=${result.status} body=${result.body}`);
  }

  const cookie = extractCookies(result.headers["set-cookie"]);
  if (!cookie) {
    throw new Error("UniFi authentication did not return a session cookie.");
  }

  return {
    cookie,
    endpoint,
    status: result.status,
  };
}

async function directUnifiAuthorize({ site, clientMac, apMac, minutes }) {
  const loginStarted = Date.now();
  const login = await directUnifiLogin();
  const loginMs = Date.now() - loginStarted;
  const normalizedMac = normalizeMac(clientMac);
  const normalizedApMac = normalizeMac(apMac);
  const unifiSiteCandidates = getUnifiSiteCandidates(site);

  const payloadObj = {
    cmd: "authorize-guest",
    mac: normalizedMac || clientMac,
    minutes,
  };
  if (normalizedApMac) payloadObj.ap_mac = normalizedApMac;
  const payload = JSON.stringify(payloadObj);
  let endpoint = "";
  let unifiSite = "";
  let authorizeResult = null;
  const authorizeStarted = Date.now();
  for (const candidate of unifiSiteCandidates) {
    unifiSite = candidate;
    endpoint = `/api/s/${encodeURIComponent(candidate)}/cmd/stamgr`;
    authorizeResult = await unifiRequest(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": login.cookie,
        "Content-Length": Buffer.byteLength(payload),
      },
      body: payload,
    });
    if (
      authorizeResult.ok ||
      !authorizeResult.body.includes("api.err.NoSiteContext") ||
      candidate === unifiSiteCandidates[unifiSiteCandidates.length - 1]
    ) {
      break;
    }
    log("direct_unifi_authorize_site_retry", {
      attempted_site: candidate,
      fallback_site: unifiSiteCandidates[unifiSiteCandidates.indexOf(candidate) + 1],
      status: authorizeResult.status,
      client_mac: normalizedMac || clientMac,
    });
  }
  const authorizeMs = Date.now() - authorizeStarted;
  const parsed = readJson(authorizeResult?.body);
  const authorizedCommandAccepted = authorizeResult?.ok && parsed?.meta?.rc === "ok";
  if (!authorizedCommandAccepted) {
    throw new Error(`UniFi authorize failed status=${authorizeResult?.status || 0} body=${authorizeResult?.body || ""}`);
  }

  let verifyAuthorized = false;
  let verifyAttempts = 0;
  let statusEndpointUsed = null;
  let statusMs = 0;
  for (let index = 0; index < UNIFI_VERIFY_ATTEMPTS; index += 1) {
    if (index > 0 && UNIFI_VERIFY_DELAY_MS) await delay(UNIFI_VERIFY_DELAY_MS);
    verifyAttempts = index + 1;
    const statusStarted = Date.now();
    const status = await directUnifiStatus({
      site: unifiSite,
      clientMac,
      cookie: login.cookie,
      includeGuestListFallback: UNIFI_STATUS_LIST_FALLBACK,
    });
    statusMs += Date.now() - statusStarted;
    statusEndpointUsed = status.endpointUsed;
    if (status.authorized) {
      verifyAuthorized = true;
      break;
    }
  }

  return {
    success: true,
    authorized: verifyAuthorized,
    authorized_unifi: verifyAuthorized,
    authorized_fallback: false,
    status_source: verifyAuthorized ? "unifi" : "none",
    status_endpoint_used: statusEndpointUsed,
    redirect_contract: buildRedirectContract(null, verifyAuthorized, verifyAttempts, DEFAULT_WEBSITE_URL),
    timing: {
      login_ms: loginMs,
      authorize_ms: authorizeMs,
      status_ms: statusMs,
      total_ms: loginMs + authorizeMs + statusMs,
      cache_hit: false,
    },
    debug: {
      unifi_authorize: {
        mode: "direct_legacy",
        endpoint,
        status: authorizeResult.status,
        site: unifiSite,
        resolved_site: unifiSite,
        configured_site: UNIFI_SITE_NAME || null,
        route_site: site,
        allow_invalid_tls: UNIFI_ALLOW_INVALID_TLS,
      },
    },
  };
}

function deriveAuthorizedFromRow(row) {
  if (!row || typeof row !== "object") return false;
  const toBoolean = (value) => {
    if (value === true || value === 1 || value === "1") return true;
    if (typeof value === "string") {
      const lowered = value.toLowerCase();
      if (lowered === "true" || lowered === "yes") return true;
      if (lowered === "false" || lowered === "no") return false;
    }
    if (value === false || value === 0 || value === "0") return false;
    return null;
  };
  const explicit = toBoolean(row.authorized ?? row.is_authorized ?? row.isAuthorized);
  if (explicit !== null) return explicit;
  if (toBoolean(row.blocked) === true || toBoolean(row.expired) === true) return false;
  const endRaw = row.end ?? row.expire ?? row.expires;
  if (typeof endRaw === "number" && Number.isFinite(endRaw) && endRaw > 0) {
    const endMs = endRaw > 1_000_000_000_000 ? endRaw : endRaw * 1000;
    return endMs > Date.now();
  }
  return false;
}

async function directUnifiStatus({
  site,
  clientMac,
  cookie = null,
  includeGuestListFallback = false,
}) {
  const login = cookie ? { cookie } : await directUnifiLogin();
  const unifiSiteCandidates = getUnifiSiteCandidates(site);
  const normalizedMac = normalizeMac(clientMac);
  const checks = unifiSiteCandidates.flatMap((unifiSite) => [
    { path: `/api/s/${encodeURIComponent(unifiSite)}/stat/user/${normalizedMac}`, kind: "single", unifiSite },
    { path: `/api/s/${encodeURIComponent(unifiSite)}/stat/sta/${normalizedMac}`, kind: "single", unifiSite },
    { path: `/api/s/${encodeURIComponent(unifiSite)}/stat/guest/${normalizedMac}`, kind: "single", unifiSite },
  ]);
  if (includeGuestListFallback) {
    for (const unifiSite of unifiSiteCandidates) {
      checks.push({ path: `/api/s/${encodeURIComponent(unifiSite)}/stat/guest`, kind: "list", unifiSite });
    }
  }

  let last = null;
  for (const check of checks) {
    const result = await unifiRequest(check.path, {
      method: "GET",
      timeoutMs: UNIFI_STATUS_TIMEOUT_MS,
      headers: {
        "Accept": "application/json",
        "Cookie": login.cookie,
      },
    });
    last = { result, endpointUsed: check.path };
    if (
      result.status === 404 ||
      result.status === 405 ||
      result.body.includes("api.err.UnknownUser") ||
      result.body.includes("api.err.UnknownStation")
    ) {
      continue;
    }

    const parsed = readJson(result.body);
    const dataRows = Array.isArray(parsed?.data) ? parsed.data : [];
    const row = check.kind === "list"
      ? dataRows.find((entry) => normalizeMac(String(entry?.mac || "")) === normalizedMac) || null
      : dataRows.find((entry) => normalizeMac(String(entry?.mac || "")) === normalizedMac) || dataRows[0] || null;

    const rowMac = row ? normalizeMac(String(row.mac || "")) : "";
    if (row && rowMac && rowMac !== normalizedMac) continue;
    if (deriveAuthorizedFromRow(row)) {
      return {
        authorized: true,
        endpointUsed: check.path,
        status: result.status,
      };
    }
  }

  return {
    authorized: false,
    endpointUsed: last?.endpointUsed || null,
    status: last?.result?.status || 0,
  };
}

async function unifiV1Request(path, {
  method = "GET",
  headers = {},
  body = null,
  timeoutMs = UNIFI_TIMEOUT_MS,
} = {}) {
  return unifiRequest(path, {
    method,
    timeoutMs,
    headers: {
      "Accept": "application/json",
      "X-API-Key": UNIFI_V1_API_KEY,
      ...headers,
    },
    body,
  });
}

async function resolveUnifiV1SiteId(routeSite) {
  if (UNIFI_V1_SITE_ID) {
    return {
      siteId: UNIFI_V1_SITE_ID,
      resolvedBy: "env",
      siteName: routeSite || UNIFI_SITE_NAME || null,
    };
  }

  const response = await unifiV1Request(`${UNIFI_V1_BASE_PATH}/sites`, {
    method: "GET",
  });
  const parsed = readJson(response.body);
  const rows = getResponseRows(parsed);
  const targetNames = [...new Set([routeSite, UNIFI_SITE_NAME].map((value) => String(value || "").trim()).filter(Boolean))];
  const siteRow = rows.find((row) => targetNames.some((name) => {
    const rowId = String(row?.id || "").trim();
    const rowName = String(row?.name || "").trim().toLowerCase();
    return rowId === name || rowName === name.toLowerCase();
  })) || rows[0];

  if (!response.ok || !siteRow?.id) {
    throw new Error(`UniFi v1 site lookup failed status=${response.status} body=${response.body}`);
  }

  return {
    siteId: String(siteRow.id),
    resolvedBy: targetNames.length ? "lookup" : "first-site",
    siteName: String(siteRow.name || routeSite || UNIFI_SITE_NAME || ""),
  };
}

async function findUnifiV1ClientByMac(siteId, clientMac) {
  const normalizedMac = normalizeMac(clientMac);
  const clientPathBase = `${UNIFI_V1_BASE_PATH}/sites/${encodeURIComponent(siteId)}/clients`;
  const filters = [
    `macAddress.eq('${normalizedMac}')`,
    `macAddress.eq('${normalizedMac.toUpperCase()}')`,
  ];

  let filteredRows = [];
  let lastResponse = null;
  for (const filter of filters) {
    const response = await unifiV1Request(
      `${clientPathBase}?filter=${encodeURIComponent(filter)}`,
      { method: "GET" }
    );
    lastResponse = response;
    if (!response.ok) {
      throw new Error(`UniFi v1 client lookup failed status=${response.status} body=${response.body}`);
    }
    const parsed = readJson(response.body);
    const rows = getResponseRows(parsed);
    const matched = rows.filter((row) => normalizeMac(String(row?.macAddress || row?.mac || row?.name || "")) === normalizedMac);
    if (matched.length > 0) {
      return {
        client: matched[0],
        count: matched.length,
      };
    }
    filteredRows = rows;
  }

  const fallbackResponse = await unifiV1Request(clientPathBase, { method: "GET" });
  if (!fallbackResponse.ok) {
    throw new Error(`UniFi v1 client lookup failed status=${fallbackResponse.status} body=${fallbackResponse.body}`);
  }
  const fallbackParsed = readJson(fallbackResponse.body);
  const fallbackRows = getResponseRows(fallbackParsed);
  const fallbackClient = fallbackRows.find((row) =>
    normalizeMac(String(row?.macAddress || row?.mac || row?.name || "")) === normalizedMac
  ) || null;

  return {
    client: fallbackClient,
    count: fallbackRows.length || filteredRows.length || (lastResponse ? 1 : 0),
  };
}

async function findUnifiV1ClientByMacWithRetry(siteId, clientMac) {
  let lastLookup = { client: null, count: 0 };
  for (let attempt = 1; attempt <= UNIFI_V1_CLIENT_LOOKUP_ATTEMPTS; attempt += 1) {
    if (attempt > 1 && UNIFI_V1_CLIENT_LOOKUP_DELAY_MS) {
      await delay(UNIFI_V1_CLIENT_LOOKUP_DELAY_MS);
    }
    lastLookup = await findUnifiV1ClientByMac(siteId, clientMac);
    if (lastLookup.client?.id) {
      return {
        ...lastLookup,
        attempts: attempt,
      };
    }
  }

  return {
    ...lastLookup,
    attempts: UNIFI_V1_CLIENT_LOOKUP_ATTEMPTS,
  };
}

function deriveAuthorizedFromV1Client(client) {
  const authorized = client?.access?.authorized;
  if (authorized === true) return true;
  const expiresAt = client?.access?.authorization?.expiresAt;
  if (typeof expiresAt === "string" && expiresAt) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs)) return expiresMs > Date.now();
  }
  return false;
}

async function directUnifiAuthorizeV1({ site, clientMac, minutes }) {
  const startedAt = Date.now();
  const siteLookupStarted = Date.now();
  const siteInfo = await resolveUnifiV1SiteId(site);
  const siteLookupMs = Date.now() - siteLookupStarted;
  const lookupStarted = Date.now();
  const clientLookup = await findUnifiV1ClientByMacWithRetry(siteInfo.siteId, clientMac);
  const lookupMs = Date.now() - lookupStarted;
  const client = clientLookup.client;

  if (!client?.id) {
    throw new Error(`UniFi v1 client lookup returned no client for MAC ${normalizeMac(clientMac) || clientMac}.`);
  }

  const payload = JSON.stringify({
    action: "AUTHORIZE_GUEST_ACCESS",
    timeLimitMinutes: minutes,
  });
  const authorizeStarted = Date.now();
  const authorizeResult = await unifiV1Request(
    `${UNIFI_V1_BASE_PATH}/sites/${encodeURIComponent(siteInfo.siteId)}/clients/${encodeURIComponent(String(client.id))}/actions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      body: payload,
    }
  );
  const authorizeMs = Date.now() - authorizeStarted;

  if (!authorizeResult.ok) {
    throw new Error(`UniFi v1 authorize failed status=${authorizeResult.status} body=${authorizeResult.body}`);
  }

  let verifyAuthorized = false;
  let verifyAttempts = 0;
  let verificationClient = null;
  let statusMs = 0;
  for (let index = 0; index < UNIFI_VERIFY_ATTEMPTS; index += 1) {
    if (index > 0 && UNIFI_VERIFY_DELAY_MS) await delay(UNIFI_VERIFY_DELAY_MS);
    verifyAttempts = index + 1;
    const statusStarted = Date.now();
    const status = await directUnifiStatusV1({
      site,
      clientMac,
      siteId: siteInfo.siteId,
      clientId: String(client.id),
    });
    statusMs += Date.now() - statusStarted;
    verificationClient = status.client;
    if (status.authorized) {
      verifyAuthorized = true;
      break;
    }
  }

  return {
    success: true,
    authorized: verifyAuthorized,
    authorized_unifi: verifyAuthorized,
    authorized_fallback: false,
    status_source: verifyAuthorized ? "unifi_v1" : "none",
    status_endpoint_used: `${UNIFI_V1_BASE_PATH}/sites/${siteInfo.siteId}/clients/${client.id}`,
    redirect_contract: buildRedirectContract(null, verifyAuthorized, verifyAttempts, DEFAULT_WEBSITE_URL),
    timing: {
      site_lookup_ms: siteLookupMs,
      client_lookup_ms: lookupMs,
      authorize_ms: authorizeMs,
      status_ms: statusMs,
      total_ms: Date.now() - startedAt,
      cache_hit: false,
    },
    debug: {
      unifi_authorize: {
        mode: "direct_v1",
        endpoint: `${UNIFI_V1_BASE_PATH}/sites/${siteInfo.siteId}/clients/${client.id}/actions`,
        status: authorizeResult.status,
        site: siteInfo.siteName || site,
        resolved_site: siteInfo.siteId,
        configured_site: UNIFI_SITE_NAME || null,
        route_site: site,
        resolved_by: siteInfo.resolvedBy,
        client_id: String(client.id),
        client_lookup_count: clientLookup.count,
        client_lookup_attempts: clientLookup.attempts,
        allow_invalid_tls: UNIFI_ALLOW_INVALID_TLS,
        requested_time_limit_minutes: minutes,
        expires_at: verificationClient?.access?.authorization?.expiresAt || null,
      },
    },
  };
}

async function directUnifiStatusV1({
  site,
  clientMac,
  siteId = "",
  clientId = "",
}) {
  const siteInfo = siteId
    ? { siteId, resolvedBy: "provided", siteName: site || UNIFI_SITE_NAME || null }
    : await resolveUnifiV1SiteId(site);

  let resolvedClientId = clientId;
  let client = null;
  let endpointUsed = "";

  if (!resolvedClientId) {
    const lookup = await findUnifiV1ClientByMac(siteInfo.siteId, clientMac);
    client = lookup.client;
    resolvedClientId = String(client?.id || "");
    endpointUsed = `${UNIFI_V1_BASE_PATH}/sites/${siteInfo.siteId}/clients?filter=macAddress.eq(...)`;
  }

  if (!resolvedClientId) {
    return {
      authorized: false,
      endpointUsed,
      status: 404,
      client: null,
    };
  }

  const response = await unifiV1Request(
    `${UNIFI_V1_BASE_PATH}/sites/${encodeURIComponent(siteInfo.siteId)}/clients/${encodeURIComponent(resolvedClientId)}`,
    { method: "GET", timeoutMs: UNIFI_STATUS_TIMEOUT_MS }
  );
  endpointUsed = `${UNIFI_V1_BASE_PATH}/sites/${siteInfo.siteId}/clients/${resolvedClientId}`;
  const parsed = readJson(response.body);
  const payloadClient = parsed?.data && !Array.isArray(parsed.data) ? parsed.data : parsed;
  client = payloadClient && typeof payloadClient === "object" ? payloadClient : client;

  return {
    authorized: response.ok && deriveAuthorizedFromV1Client(client),
    endpointUsed,
    status: response.status,
    client,
  };
}

function toIsoIfValid(value) {
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return null;
}

function pickClientString(client, keys) {
  for (const key of keys) {
    const value = client?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickClientNumber(client, keys) {
  for (const key of keys) {
    const value = client?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function deriveClientDurationSeconds(client) {
  const directValue = pickClientNumber(client, [
    "uptimeSeconds",
    "uptime",
    "connectedDurationSeconds",
    "assocTime",
    "durationSeconds",
  ]);
  if (directValue && directValue > 0) return Math.round(directValue);

  const connectedAt = deriveClientConnectedAt(client);
  if (!connectedAt) return null;

  const connectedMs = Date.parse(connectedAt);
  if (!Number.isFinite(connectedMs)) return null;
  return Math.max(0, Math.round((Date.now() - connectedMs) / 1000));
}

function deriveClientConnectedAt(client) {
  const stringValue = pickClientString(client, [
    "connectedAt",
    "connected_at",
    "firstSeen",
    "first_seen",
    "associatedAt",
    "associated_at",
    "lastSeen",
    "last_seen",
  ]);
  if (stringValue) return toIsoIfValid(stringValue);

  const numericValue = pickClientNumber(client, [
    "connectedAt",
    "firstSeen",
    "associatedAt",
    "lastSeen",
  ]);
  return toIsoIfValid(numericValue);
}

function buildLiveClientBase(client, fallbackSite) {
  const mac = normalizeMac(
    pickClientString(client, ["macAddress", "mac", "clientMac"]) || ""
  );
  return {
    client_id: pickClientString(client, ["id", "_id"]) || mac,
    client_mac: mac,
    name: pickClientString(client, ["name", "hostname", "displayName"]) || "Guest device",
    hostname: pickClientString(client, ["hostname", "displayName"]),
    ip_address: pickClientString(client, ["ipAddress", "ip", "ipv4"]),
    device_type: pickClientString(client, ["deviceType", "ouiName", "fingerprint"]) || "unknown",
    connected_at: deriveClientConnectedAt(client),
    duration_seconds: deriveClientDurationSeconds(client),
    access_point: pickClientString(client, [
      "accessPointName",
      "apName",
      "ap_name",
      "accessPoint",
      "ap",
      "uplinkDeviceName",
    ]),
    site_slug: fallbackSite || null,
  };
}

async function listDirectUnifiLiveClientsV1(site) {
  const siteInfo = await resolveUnifiV1SiteId(site);
  const response = await unifiV1Request(
    `${UNIFI_V1_BASE_PATH}/sites/${encodeURIComponent(siteInfo.siteId)}/clients`,
    { method: "GET", timeoutMs: UNIFI_STATUS_TIMEOUT_MS }
  );

  if (!response.ok) {
    throw new Error(`UniFi v1 client list failed status=${response.status} body=${response.body}`);
  }

  return getResponseRows(readJson(response.body))
    .filter((client) => deriveAuthorizedFromV1Client(client))
    .map((client) => buildLiveClientBase(client, siteInfo.siteName || site));
}

async function listDirectUnifiLiveClientsLegacy(site) {
  const login = await directUnifiLogin();
  const clients = [];

  for (const candidate of getUnifiSiteCandidates(site)) {
    const response = await unifiRequest(`/api/s/${encodeURIComponent(candidate)}/stat/guest`, {
      method: "GET",
      timeoutMs: UNIFI_STATUS_TIMEOUT_MS,
      headers: {
        "Accept": "application/json",
        "Cookie": login.cookie,
      },
    });

    if (!response.ok) {
      throw new Error(`UniFi legacy guest list failed status=${response.status} body=${response.body}`);
    }

    const rows = getResponseRows(readJson(response.body))
      .filter((client) => deriveAuthorizedFromRow(client))
      .map((client) => buildLiveClientBase(client, candidate));
    clients.push(...rows);
  }

  return clients;
}

async function listLiveConnectedClients(site) {
  if (UNIFI_AUTH_BACKEND !== "direct") {
    throw new Error("Live client lookup is only available when UniFi direct mode is configured.");
  }

  const rows = UNIFI_AUTH_MODE === "v1"
    ? await listDirectUnifiLiveClientsV1(site)
    : await listDirectUnifiLiveClientsLegacy(site);

  const deduped = new Map();
  rows.forEach((row) => {
    if (!row.client_mac || deduped.has(row.client_mac)) return;
    deduped.set(row.client_mac, row);
  });
  return Array.from(deduped.values());
}

async function enrichLiveClients(rows) {
  const macs = [...new Set(rows.map((row) => row.client_mac).filter(Boolean))];
  if (!macs.length) return rows;

  const { data: sessions, error: sessionsError } = await supabase
    .from("portal_sessions")
    .select("client_mac, guest_name, guest_email, guest_phone, guest_postcode, site_slug, ap_mac, authorized_at, submitted_at, completed_at, updated_at, status")
    .in("client_mac", macs)
    .order("updated_at", { ascending: false });

  if (sessionsError) {
    throw new Error(`Unable to enrich live clients from Supabase: ${sessionsError.message}`);
  }

  const latestSessionByMac = new Map();
  for (const session of sessions || []) {
    const clientMac = normalizeMac(session.client_mac);
    if (!clientMac || latestSessionByMac.has(clientMac)) continue;
    latestSessionByMac.set(clientMac, session);
  }

  const postcodes = [...new Set(
    Array.from(latestSessionByMac.values())
      .map((session) => String(session.guest_postcode || "").trim())
      .filter(Boolean)
  )];

  const postcodeLookup = new Map();
  if (postcodes.length) {
    const { data: centroidRows } = await supabase
      .from("postcode_centroids")
      .select("postcode, suburb, state")
      .in("postcode", postcodes);

    for (const row of centroidRows || []) {
      postcodeLookup.set(String(row.postcode), {
        suburb: row.suburb || null,
        state: row.state || null,
      });
    }
  }

  return rows.map((row) => {
    const session = latestSessionByMac.get(row.client_mac);
    const postcode = String(session?.guest_postcode || "").trim();
    const location = postcode ? postcodeLookup.get(postcode) || null : null;

    return {
      ...row,
      guest_name: session?.guest_name || null,
      guest_email: session?.guest_email || null,
      guest_phone: session?.guest_phone || null,
      guest_postcode: session?.guest_postcode || null,
      postcode_suburb: location?.suburb || null,
      postcode_state: location?.state || null,
      submitted_at: session?.submitted_at || null,
      authorized_at: session?.authorized_at || null,
      completed_at: session?.completed_at || null,
      session_status: session?.status || null,
    };
  });
}

async function authorizeWifi(payload) {
  if (UNIFI_AUTH_BACKEND !== "direct") {
    return callWifiConnect(payload);
  }

  const startedAt = Date.now();
  const body = UNIFI_AUTH_MODE === "v1"
    ? await directUnifiAuthorizeV1({
        site: payload.unifi_site,
        clientMac: payload.client_mac,
        minutes: UNIFI_AUTH_MINUTES,
      })
    : await directUnifiAuthorize({
        site: payload.unifi_site,
        clientMac: payload.client_mac,
        apMac: payload.ap_mac,
        minutes: UNIFI_AUTH_MINUTES,
      });
  const redirectContract = buildRedirectContract(
    payload.redirect_url,
    body.authorized === true,
    body.redirect_contract?.verify_attempts || UNIFI_VERIFY_ATTEMPTS,
    payload.website_url || DEFAULT_WEBSITE_URL,
  );
  body.redirect_contract = redirectContract;
  log("direct_unifi_authorize_response", {
    status: 200,
    elapsed_ms: Date.now() - startedAt,
    site: payload.unifi_site,
    resolved_unifi_site: body.debug?.unifi_authorize?.resolved_site || normalizeUnifiSite(payload.unifi_site),
    client_mac: payload.client_mac,
    authorized: body.authorized,
    auth_mode: UNIFI_AUTH_MODE,
    allow_invalid_tls: UNIFI_ALLOW_INVALID_TLS,
  });
  return { ok: true, status: 200, body };
}

async function checkWifiStatus(payload) {
  if (UNIFI_AUTH_BACKEND !== "direct") {
    return callWifiConnect(payload);
  }
  const startedAt = Date.now();
  const status = UNIFI_AUTH_MODE === "v1"
    ? await directUnifiStatusV1({
        site: payload.unifi_site,
        clientMac: payload.client_mac,
      })
    : await directUnifiStatus({
        site: payload.unifi_site,
        clientMac: payload.client_mac,
      });
  log("direct_unifi_status_response", {
    status: 200,
    elapsed_ms: Date.now() - startedAt,
    site: normalizeUnifiSite(payload.unifi_site),
    route_site: payload.unifi_site,
    client_mac: payload.client_mac,
    authorized: status.authorized,
    auth_mode: UNIFI_AUTH_MODE,
  });
  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      authorized: status.authorized,
      authorized_unifi: status.authorized,
      authorized_fallback: false,
      status_source: status.authorized ? "unifi" : "none",
      status_endpoint_used: status.endpointUsed,
    },
  };
}

app.get("/api/admin/live-clients", async (req, res) => {
  const admin = await requireAdminRequest(req, res);
  if (!admin) return;

  try {
    const site = normalizeSite(req.query.site) || UNIFI_SITE_NAME || "xlgkkyrq";
    const rows = await listLiveConnectedClients(site);
    const enriched = await enrichLiveClients(rows);
    res.json({
      site,
      fetched_at: new Date().toISOString(),
      clients: enriched.sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0)),
    });
  } catch (error) {
    log("admin_live_clients_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      error: error instanceof Error ? error.message : "Unable to load live clients.",
    });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "wifi-portal", ts: new Date().toISOString() });
});

app.get(["/", "/portal"], async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) {
    res.status(200).send(renderInfoPage());
    return;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") params.set(key, value);
  }
  res.redirect(`/guest/s/${encodeURIComponent(site)}/?${params.toString()}`);
});

async function handleReleaseRequest(req, res, routeSite = "", options = {}) {
  const site = normalizeSite(routeSite || req.query.site);
  const sessionKey = String(req.query.session_key || "").trim();
  const siteConfig = getSiteConfig(site);
  const source = String(options.source || req.query.source || "release").trim();
  const forceRetry = Boolean(options.forceRetry);

  if (!sessionKey) {
    res.status(400).send(renderMissingParamsPage("Missing Wi-Fi release session."));
    return;
  }

  try {
    let session = await getSession(sessionKey);
    if (!session || (site && session.site_slug !== site)) {
      res.status(404).send(renderMissingParamsPage("Wi-Fi release session not found."));
      return;
    }

    const effectiveSiteConfig = getSiteConfig(session.site_slug || site);
    if (session.status === "completed" && (forceRetry || Number(session.release_attempt_count || 0) > 0)) {
      try {
        session = await refreshSessionAuthorization(session, effectiveSiteConfig, `release_retry:${source}`);
      } catch (error) {
        log("session_authorization_refresh_error", {
          site: session.site_slug,
          session_key: session.session_key,
          client_mac: session.client_mac,
          reason: `release_retry:${source}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const websiteUrl = safeUrl(session.website_url || req.query.website, effectiveSiteConfig.websiteUrl);
    const probe = getReleaseProbe(session);
    const probeUrl = probe.url;
    const releaseAttempts = Number(session.release_attempt_count || 0);
    const now = new Date().toISOString();
    const releaseEventUrl = `/guest/s/${encodeURIComponent(effectiveSiteConfig.site)}/event?session_key=${encodeURIComponent(sessionKey)}`;
    const authorizedAtMs = session.authorized_at ? Date.parse(session.authorized_at) : NaN;
    const authToFirstProbeMs = Number.isFinite(authorizedAtMs) && releaseAttempts === 0
      ? Math.max(0, Date.now() - authorizedAtMs)
      : null;

    log("release_route_received", {
      site: session.site_slug,
      session_key: sessionKey,
      client_mac: session.client_mac,
      has_probe_url: Boolean(probeUrl),
      release_probe_source: probe.source,
      release_attempt_count: releaseAttempts,
    });
    recordTraceEvent(session, "release_route_received", {
      metadata: {
        has_probe_url: Boolean(probeUrl),
        release_probe_source: probe.source,
        release_attempt_count: releaseAttempts,
        source,
      },
    });

    if (probeUrl && (releaseAttempts < 1 || (forceRetry && releaseAttempts < MAX_MANUAL_RELEASE_ATTEMPTS))) {
      const nextAttempt = releaseAttempts + 1;
      const redirectStage = releaseAttempts < 1 ? "probe_release_redirect" : "probe_retry_redirect";
      const updated = await updateSession(sessionKey, {
        status: "completed",
        completed_at: session.completed_at || now,
        release_attempted_at: now,
        release_attempt_count: nextAttempt,
        release_result: redirectStage,
        final_redirect_url: probeUrl,
        release_mode: probe.source === "inferred" ? "inferred_probe_redirect" : session.release_mode,
        website_url: websiteUrl,
      });

      log(redirectStage, {
        site: updated.site_slug,
        session_key: sessionKey,
        client_mac: updated.client_mac,
        target: probeUrl,
        source,
        release_probe_source: probe.source,
        auth_to_first_probe_ms: authToFirstProbeMs,
        release_attempt_count: nextAttempt,
      });
      recordTraceEvent(updated, redirectStage, {
        metadata: {
          release_attempt_count: nextAttempt,
          target_host: new URL(probeUrl).hostname,
          release_probe_source: probe.source,
          auth_to_first_probe_ms: authToFirstProbeMs,
          source,
        },
      });
      res.redirect(303, probeUrl);
      return;
    }

    if (probeUrl && forceRetry && releaseAttempts >= MAX_MANUAL_RELEASE_ATTEMPTS) {
      recordTraceEvent(session, "release_retry_exhausted", {
        metadata: {
          release_attempt_count: releaseAttempts,
          max_auto_release_attempts: MAX_AUTO_RELEASE_ATTEMPTS,
          max_manual_release_attempts: MAX_MANUAL_RELEASE_ATTEMPTS,
          release_exhausted: true,
          source,
        },
      });
    }

    const releaseResult = probeUrl ? "release_already_attempted" : "no_valid_probe_manual_connected";
    log(releaseResult, {
      site: session.site_slug,
      session_key: sessionKey,
      client_mac: session.client_mac,
      release_attempt_count: releaseAttempts,
      release_probe_source: probe.source,
      release_exhausted: Boolean(probeUrl && releaseAttempts >= MAX_AUTO_RELEASE_ATTEMPTS),
    });
    const updated = await updateSession(sessionKey, {
      status: "completed",
      completed_at: session.completed_at || now,
      release_attempted_at: session.release_attempted_at || now,
      release_result: releaseResult,
      final_redirect_url: websiteUrl,
      website_url: websiteUrl,
    });
    recordTraceEvent(updated, releaseResult, {
      metadata: {
        release_attempt_count: releaseAttempts,
        has_probe_url: Boolean(probeUrl),
        release_probe_source: probe.source,
        release_exhausted: Boolean(probeUrl && releaseAttempts >= MAX_AUTO_RELEASE_ATTEMPTS),
      },
    });

    res.status(200).send(renderReleasePage({
      siteConfig: effectiveSiteConfig,
      websiteUrl: buildWebsiteRedirectUrl(effectiveSiteConfig.site, sessionKey),
      eventUrl: releaseEventUrl,
      finishUrl: probeUrl && releaseAttempts < MAX_MANUAL_RELEASE_ATTEMPTS
        ? buildFinishConnectionUrl(effectiveSiteConfig.site, sessionKey, "manual")
        : "",
      releaseAttempts,
      maxAutoReleaseAttempts: MAX_AUTO_RELEASE_ATTEMPTS,
      maxManualReleaseAttempts: MAX_MANUAL_RELEASE_ATTEMPTS,
    }));
  } catch (error) {
    log("release_session_error", {
      site,
      session_key: sessionKey,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send(renderMissingParamsPage("Could not complete the Wi-Fi release right now."));
  }
}

app.get("/release", async (req, res) => {
  await handleReleaseRequest(req, res);
});

app.get("/guest/s/:site/release", async (req, res) => {
  await handleReleaseRequest(req, res, req.params.site);
});

app.get("/guest/s/:site/finish", async (req, res) => {
  await handleReleaseRequest(req, res, req.params.site, {
    forceRetry: true,
    source: String(req.query.source || "manual"),
  });
});

app.get("/guest/s/:site/website", async (req, res) => {
  const site = normalizeSite(req.params.site);
  const sessionKey = String(req.query.session_key || "").trim();
  const siteConfig = getSiteConfig(site);

  if (sessionKey) {
    try {
      const session = await getSession(sessionKey);
      if (session && session.site_slug === site) {
        recordTraceEvent(session, "manual_website_clicked", {
          metadata: {
            release_attempt_count: Number(session.release_attempt_count || 0),
          },
        });
        res.redirect(303, safeUrl(session.website_url, siteConfig.websiteUrl));
        return;
      }
    } catch (error) {
      log("manual_website_trace_error", {
        site,
        session_key: sessionKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  res.redirect(303, siteConfig.websiteUrl);
});

app.post("/guest/s/:site/event", async (req, res) => {
  const site = normalizeSite(req.params.site);
  const sessionKey = String(req.query.session_key || req.body?.session_key || "").trim();
  const stageName = String(req.body?.stage_name || "").trim();

  if (!site || !sessionKey || stageName !== "page_hidden") {
    res.status(204).end();
    return;
  }

  try {
    const session = await getSession(sessionKey);
    if (session && session.site_slug === site) {
      recordTraceEvent(session, stageName, {
        metadata: {
          reason: String(req.body?.reason || ""),
          page: String(req.body?.page || ""),
          release_started: Boolean(req.body?.release_started),
        },
      });
    }
  } catch (error) {
    log("client_event_trace_error", {
      site,
      session_key: sessionKey,
      stage_name: stageName,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.status(204).end();
});

app.get("/guest/s/:site/", async (req, res) => {
  const site = normalizeSite(req.params.site || req.query.site);
  const clientMac = normalizeMac(req.query.id || req.query.client_mac);
  if (!site || !clientMac) {
    res.status(400).send(renderMissingParamsPage("Missing required UniFi site or client MAC parameters."));
    return;
  }

  const siteConfig = getSiteConfig(site);
  log("portal_loaded", {
    site,
    client_mac: clientMac,
    ap_mac: normalizeMac(req.query.ap || req.query.ap_mac),
    ssid: req.query.ssid || null,
  });

  try {
    const existing = await findRecentRecoverableSession(site, clientMac);
    if (existing) {
      let refreshedSession = {
        ...existing,
        ap_mac: normalizeMac(req.query.ap || req.query.ap_mac) || existing.ap_mac,
        unifi_t: typeof req.query.t === "string" ? req.query.t : existing.unifi_t,
        redirect_url: typeof req.query.url === "string" ? req.query.url : existing.redirect_url,
        user_agent: req.headers["user-agent"] || existing.user_agent,
        website_url: siteConfig.websiteUrl,
      };
      let updated = await updateSession(existing.session_key, {
        ap_mac: normalizeMac(req.query.ap || req.query.ap_mac) || existing.ap_mac,
        unifi_t: typeof req.query.t === "string" ? req.query.t : existing.unifi_t,
        redirect_url: typeof req.query.url === "string" ? req.query.url : existing.redirect_url,
        user_agent: req.headers["user-agent"] || existing.user_agent,
        ...buildReleaseFields(refreshedSession, siteConfig),
      });
      refreshedSession = { ...refreshedSession, ...updated };
      if (updated.status === "completed") {
        try {
          updated = await refreshSessionAuthorization(updated, siteConfig, "portal_reopen");
          refreshedSession = { ...refreshedSession, ...updated };
        } catch (error) {
          log("session_authorization_refresh_error", {
            site,
            session_key: existing.session_key,
            client_mac: existing.client_mac,
            reason: "portal_reopen",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (updated.status === "completed" && Number(updated.release_attempt_count || 0) < 1) {
        recordTraceEvent(updated, "release_recovered", {
          metadata: {
            has_probe_url: Boolean(getReleaseProbe(updated).url),
            release_probe_source: getReleaseProbe(updated).source,
          },
        });
      }
      const recoveryTarget = updated.status === "completed" &&
          updated.release_target &&
          Number(updated.release_attempt_count || 0) < 1
        ? updated.release_target
        : buildProgressUrl(site, existing.session_key);
      res.redirect(303, recoveryTarget);
      return;
    }

    const session = await upsertSession(buildBaseSession(site, req.query, req.headers["user-agent"]));
    res.status(200).send(renderFormPage({ siteConfig, site, session }));
  } catch (error) {
    log("portal_load_error", {
      site,
      client_mac: clientMac,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send(renderMissingParamsPage("Could not load the Wi-Fi portal right now."));
  }
});

app.post("/guest/s/:site/connect", async (req, res) => {
  const site = normalizeSite(req.params.site);
  const siteConfig = getSiteConfig(site);
  const sessionKey = String(req.body.session_key || "").trim();
  const formValues = {
    name: String(req.body.name || "").trim(),
    email: String(req.body.email || "").trim(),
    mobile: String(req.body.mobile || "").trim(),
    postcode: String(req.body.postcode || "").trim(),
    agree: req.body.agree ? "1" : "",
  };

  if (!sessionKey) {
    res.status(400).send(renderMissingParamsPage("Missing portal session key."));
    return;
  }

  let session;
  try {
    session = await getSession(sessionKey);
  } catch (error) {
    res.status(500).send(renderMissingParamsPage("Could not load the portal session."));
    return;
  }

  if (!session || session.site_slug !== site) {
    res.status(404).send(renderMissingParamsPage("Portal session not found."));
    return;
  }

  if (!formValues.name || !formValues.email || !formValues.agree) {
    res.status(400).send(renderFormPage({
      siteConfig,
      site,
      session,
      values: formValues,
      errorMessage: "Please complete the required fields and accept the guest Wi-Fi terms.",
    }));
    return;
  }

  try {
    log("form_submitted", {
      site,
      session_key: sessionKey,
      client_mac: session.client_mac,
      email: formValues.email.toLowerCase(),
    });

    session = await updateSession(sessionKey, {
      status: "submitting",
      guest_name: formValues.name,
      guest_email: formValues.email.toLowerCase(),
      guest_phone: formValues.mobile || null,
      guest_postcode: formValues.postcode || null,
      submitted_at: new Date().toISOString(),
      last_error: null,
    });
    recordTraceEvent(session, "portal_submit", {
      metadata: {
        has_probe_url: Boolean(getReleaseProbe(session).url),
        release_probe_source: getReleaseProbe(session).source,
        ssid: session.ssid,
      },
    });

    if (isDirectV1Mode()) {
      ensureBackgroundV1Authorization(session, siteConfig, "submit");
      res.redirect(303, buildProgressUrl(site, session.session_key));
      return;
    }

    const connectPayload = buildConnectPayloadFromSession(session, siteConfig);

    log("unifi_authorize_request_started", {
      site,
      session_key: sessionKey,
      client_mac: session.client_mac,
      endpoint: UNIFI_AUTH_BACKEND === "direct" ? UNIFI_BASE_URL : WIFI_CONNECT_FUNCTION_URL,
      backend: UNIFI_AUTH_BACKEND,
    });
    const connectResult = await authorizeWifi(connectPayload);
    log("unifi_authorize_request_finished", {
      site,
      session_key: sessionKey,
      client_mac: session.client_mac,
      status: connectResult.status,
      success: connectResult.ok && connectResult.body?.success === true,
    });

    if (!connectResult.ok || connectResult.body?.success !== true) {
      const message = connectResult.body?.error ||
        connectResult.body?.unifi_error ||
        "Could not connect to Wi-Fi right now. Please try again.";
      await updateSession(sessionKey, {
        status: "failed",
        last_error: message,
      });
      res.status(502).send(renderFormPage({
        siteConfig,
        site,
        session: { ...session, status: "failed" },
        values: formValues,
        errorMessage: message,
      }));
      return;
    }

    const completedSession = await finalizeAuthorizedSession(session, siteConfig, connectResult);

    const postAuthTarget = completedSession.release_target ||
      buildProgressUrl(site, completedSession.session_key);
    log("post_auth_redirect_issued", {
      site,
      session_key: completedSession.session_key,
      client_mac: completedSession.client_mac,
      target: postAuthTarget,
      release_mode: completedSession.release_mode,
      release_probe_source: getReleaseProbe(completedSession).source,
    });
    recordTraceEvent(completedSession, "post_auth_redirect_issued", {
      metadata: {
        target: postAuthTarget,
        release_mode: completedSession.release_mode,
        has_probe_url: Boolean(getReleaseProbe(completedSession).url),
        release_probe_source: getReleaseProbe(completedSession).source,
      },
    });

    res.redirect(303, postAuthTarget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected connection error.";
    log("portal_connect_error", {
      site,
      session_key: sessionKey,
      error: message,
    });
    try {
      await updateSession(sessionKey, {
        status: "failed",
        last_error: message,
      });
    } catch {
      // Ignore secondary update failure.
    }
    res.status(500).send(renderFormPage({
      siteConfig,
      site,
      session,
      values: formValues,
      errorMessage: "Could not connect to Wi-Fi right now. Please try again.",
    }));
  }
});

app.get("/guest/s/:site/progress", async (req, res) => {
  const site = normalizeSite(req.params.site);
  const sessionKey = String(req.query.session_key || "").trim();
  if (!site || !sessionKey) {
    res.status(400).send(renderMissingParamsPage("Missing Wi-Fi progress session."));
    return;
  }

  try {
    const session = await getSession(sessionKey);
    if (!session || session.site_slug !== site) {
      res.status(404).send(renderMissingParamsPage("Wi-Fi progress session not found."));
      return;
    }
    const siteConfig = getSiteConfig(site);
    if (session.status === "completed") {
      const shouldRelease = Boolean(session.release_target) &&
        Number(session.release_attempt_count || 0) < 1;
      if (shouldRelease) {
        recordTraceEvent(session, "release_recovered", {
          metadata: {
            source: "progress",
            has_probe_url: Boolean(getReleaseProbe(session).url),
            release_probe_source: getReleaseProbe(session).source,
          },
        });
        res.redirect(303, session.release_target);
        return;
      }
      res.status(200).send(renderReleasePage({
        siteConfig,
        websiteUrl: buildWebsiteRedirectUrl(site, session.session_key),
        eventUrl: `/guest/s/${encodeURIComponent(site)}/event?session_key=${encodeURIComponent(session.session_key)}`,
        finishUrl: canManualRetryRelease(session)
          ? buildFinishConnectionUrl(site, session.session_key, "manual")
          : "",
        releaseAttempts: Number(session.release_attempt_count || 0),
        maxAutoReleaseAttempts: MAX_AUTO_RELEASE_ATTEMPTS,
        maxManualReleaseAttempts: MAX_MANUAL_RELEASE_ATTEMPTS,
      }));
      return;
    }
    res.status(200).send(renderProgressPage({
      siteConfig,
      site,
      session,
    }));
  } catch (error) {
    res.status(500).send(renderMissingParamsPage("Could not load the connection progress page."));
  }
});

app.get("/guest/s/:site/session", async (req, res) => {
  const site = normalizeSite(req.params.site);
  const sessionKey = String(req.query.session_key || "").trim();
  if (!site || !sessionKey) {
    res.status(400).json({ success: false, error: "Missing session key." });
    return;
  }

  try {
    let session = await getSession(sessionKey);
    if (!session || session.site_slug !== site) {
      res.status(404).json({ success: false, error: "Session not found." });
      return;
    }

    if (session.status === "completed") {
      const shouldRelease = Boolean(session.release_target) &&
        Number(session.release_attempt_count || 0) < 1;
      res.json({
        success: true,
        phase: shouldRelease ? "release" : "connected",
        session_key: session.session_key,
        release_target: shouldRelease ? session.release_target : null,
        continue_target: session.continue_target,
        secondary_target: session.secondary_target,
        website_url: session.website_url,
        finish_target: canManualRetryRelease(session)
          ? buildFinishConnectionUrl(site, session.session_key, "manual")
          : null,
        release_attempt_count: Number(session.release_attempt_count || 0),
      });
      return;
    }

    if (session.status === "failed") {
      res.json({
        success: true,
        phase: "failed",
        session_key: session.session_key,
        message: session.last_error || "Could not connect to Wi-Fi right now.",
        continue_target: session.continue_target,
        website_url: session.website_url,
      });
      return;
    }

    if (session.status === "submitting" && isDirectV1Mode()) {
      ensureBackgroundV1Authorization(session, getSiteConfig(site), "session_poll");
      res.json({
        success: true,
        phase: "pending",
        session_key: session.session_key,
        message: "Still connecting",
      });
      return;
    }

    const statusResult = await checkWifiStatus({
      action: "status",
      unifi_site: site,
      client_mac: session.client_mac,
      unifi_t: session.unifi_t,
      trace_id: session.trace_id,
      venue_slug: site,
    });

    if (statusResult.ok && statusResult.body?.authorized === true) {
      const updated = await updateSession(session.session_key, {
        status: "completed",
        authorized_at: session.authorized_at || new Date().toISOString(),
        ...buildReleaseFields(session, getSiteConfig(site)),
        last_error: null,
      });
      const shouldRelease = Boolean(updated.release_target) &&
        Number(updated.release_attempt_count || 0) < 1;
      res.json({
        success: true,
        phase: shouldRelease ? "release" : "connected",
        session_key: updated.session_key,
        release_target: shouldRelease ? updated.release_target : null,
        continue_target: updated.continue_target,
        secondary_target: updated.secondary_target,
        website_url: updated.website_url,
        finish_target: canManualRetryRelease(updated)
          ? buildFinishConnectionUrl(site, updated.session_key, "manual")
          : null,
        release_attempt_count: Number(updated.release_attempt_count || 0),
      });
      return;
    }

    res.json({
      success: true,
      phase: "pending",
      session_key: session.session_key,
      message: "Still connecting",
    });
  } catch (error) {
    log("portal_session_error", {
      site,
      session_key: sessionKey,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: "Could not check session status.",
    });
  }
});

app.get("/debug/session/:sessionKey", async (req, res) => {
  const sessionKey = String(req.params.sessionKey || "").trim();
  if (!sessionKey) {
    res.status(400).json({ success: false, error: "Missing session key." });
    return;
  }

  try {
    const session = await getSession(sessionKey);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found." });
      return;
    }
    const probe = getReleaseProbe(session);
    const submittedAtMs = session.submitted_at ? Date.parse(session.submitted_at) : NaN;
    const authorizedAtMs = session.authorized_at ? Date.parse(session.authorized_at) : NaN;
    const releaseAttemptedAtMs = session.release_attempted_at ? Date.parse(session.release_attempted_at) : NaN;
    res.json({
      success: true,
      session_key: session.session_key,
      trace_id: session.trace_id,
      site_slug: session.site_slug,
      client_mac: session.client_mac,
      ap_mac: session.ap_mac,
      ssid: session.ssid,
      status: session.status,
      submitted_at: session.submitted_at,
      authorized_at: session.authorized_at,
      release_attempted_at: session.release_attempted_at,
      release_attempt_count: Number(session.release_attempt_count || 0),
      release_result: session.release_result,
      release_mode: session.release_mode,
      release_probe_source: probe.source,
      selected_probe_url: probe.url || null,
      original_redirect_url: session.redirect_url || null,
      website_url: session.website_url,
      durations_ms: {
        submit_to_authorized: Number.isFinite(submittedAtMs) && Number.isFinite(authorizedAtMs)
          ? Math.max(0, authorizedAtMs - submittedAtMs)
          : null,
        authorized_to_first_release_attempt: Number.isFinite(authorizedAtMs) && Number.isFinite(releaseAttemptedAtMs)
          ? Math.max(0, releaseAttemptedAtMs - authorizedAtMs)
          : null,
      },
    });
  } catch (error) {
    log("debug_session_error", {
      session_key: sessionKey,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: "Could not load debug session." });
  }
});

app.listen(PORT, () => {
  log("portal_server_started", {
    port: PORT,
    session_window_minutes: SESSION_WINDOW_MINUTES,
    auth_backend: UNIFI_AUTH_BACKEND,
    auth_mode: UNIFI_AUTH_MODE,
    unifi_base_url: UNIFI_AUTH_BACKEND === "direct" ? UNIFI_BASE_URL : null,
    unifi_site_name: UNIFI_AUTH_BACKEND === "direct" ? UNIFI_SITE_NAME || "(route-site)" : null,
    unifi_allow_invalid_tls: UNIFI_AUTH_BACKEND === "direct" ? UNIFI_ALLOW_INVALID_TLS : null,
    unifi_v1_client_lookup_attempts: UNIFI_V1_CLIENT_LOOKUP_ATTEMPTS,
    unifi_v1_client_lookup_delay_ms: UNIFI_V1_CLIENT_LOOKUP_DELAY_MS,
    unifi_post_auth_refresh_enabled: UNIFI_POST_AUTH_REFRESH_ENABLED,
    unifi_post_auth_refresh_delay_ms: UNIFI_POST_AUTH_REFRESH_DELAY_MS,
    max_auto_release_attempts: MAX_AUTO_RELEASE_ATTEMPTS,
    release_retry_delay_ms: RELEASE_RETRY_DELAY_MS,
    wifi_connect_function_url: WIFI_CONNECT_FUNCTION_URL,
    configured_sites: Object.keys(SITE_MAP),
  });
});
