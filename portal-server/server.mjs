import crypto from "node:crypto";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const WIFI_CONNECT_FUNCTION_URL = (
  process.env.WIFI_CONNECT_FUNCTION_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/wifi-connect` : "")
).trim();
const DEFAULT_WEBSITE_URL = (process.env.PORTAL_DEFAULT_WEBSITE_URL ||
  "https://www.thebatesfordhotel.com.au/").trim();
const DEFAULT_BRAND_NAME = (process.env.PORTAL_BRAND_NAME || "Guest Wi-Fi").trim();
const SESSION_WINDOW_MINUTES = Math.max(
  5,
  Number.parseInt(process.env.PORTAL_SESSION_WINDOW_MINUTES || "20", 10) || 20,
);
const SITE_MAP = parseSiteMap(process.env.PORTAL_SITE_MAP);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

if (!WIFI_CONNECT_FUNCTION_URL) {
  throw new Error("Missing WIFI_CONNECT_FUNCTION_URL.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  return {
    site,
    label: configured.label || toTitleCase(site) || DEFAULT_BRAND_NAME,
    heroTitle: configured.heroTitle || "Guest Wi-Fi Connect",
    brandName: configured.brandName || DEFAULT_BRAND_NAME,
    websiteUrl,
    continueUrl: safeUrl(configured.continueUrl, "http://neverssl.com/"),
    successMessage: configured.successMessage ||
      "Connecting you to guest Wi-Fi. This can take a few seconds on some phones.",
    termsLabel: configured.termsLabel ||
      "I agree to the guest Wi-Fi terms and understand my details may be used for Wi-Fi access and marketing updates.",
  };
}

function buildBaseSession(site, query, userAgent) {
  const siteConfig = getSiteConfig(site);
  const clientMac = normalizeMac(query.id || query.client_mac);
  const apMac = normalizeMac(query.ap || query.ap_mac);
  const redirectUrl = typeof query.url === "string" ? query.url : null;
  const releaseTarget = siteConfig.continueUrl;

  return {
    session_key: crypto.randomUUID(),
    site_slug: site,
    client_mac: clientMac,
    ap_mac: apMac || null,
    ssid: typeof query.ssid === "string" ? query.ssid : null,
    unifi_t: typeof query.t === "string" ? query.t : null,
    redirect_url: redirectUrl,
    user_agent: userAgent || null,
    status: "presented",
        trace_id: `portal-${crypto.randomUUID()}`,
        release_target: releaseTarget,
        continue_target: releaseTarget,
    secondary_target: siteConfig.websiteUrl,
    final_redirect_url: siteConfig.websiteUrl,
    website_url: siteConfig.websiteUrl,
    release_mode: "http_release_then_website",
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
        form?.addEventListener("submit", () => {
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Connecting you to Wi-Fi...";
          }
        });
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
          <a id="continue-link" class="btn" href="${escapeHtml(session.continue_target || siteConfig.continueUrl)}">Continue to Internet</a>
          <a id="website-link" class="btn secondary" href="${escapeHtml(session.website_url || siteConfig.websiteUrl)}">Open venue website</a>
        </div>
        <p class="footer-note subtle">If this window stays open, tap Continue to Internet or open the venue website.</p>
      </div>
      <script>
        const sessionKey = ${JSON.stringify(session.session_key)};
        const sessionUrl = ${JSON.stringify(`/guest/s/${site}/session?session_key=${encodeURIComponent(session.session_key)}`)};
        const statusTitle = document.getElementById("status-title");
        const statusCopy = document.getElementById("status-copy");
        const manualActions = document.getElementById("manual-actions");
        const continueLink = document.getElementById("continue-link");
        const websiteLink = document.getElementById("website-link");
        const isAppleCaptive = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        let releaseStarted = false;
        let websiteFallbackTimer = null;

        function navigate(url) {
          if (!url) return;
          window.location.assign(url);
        }

        function showManualActions() {
          manualActions?.classList.remove("hidden");
        }

        function beginRelease(payload) {
          if (releaseStarted) return;
          releaseStarted = true;
          const continueUrl = payload.continue_target || payload.release_target;
          const websiteUrl = payload.website_url || payload.secondary_target;
          if (continueLink && continueUrl) continueLink.href = continueUrl;
          if (websiteLink && websiteUrl) websiteLink.href = websiteUrl;
          if (statusTitle) statusTitle.textContent = "Connecting You To Guest Wi-Fi";
          if (statusCopy) statusCopy.textContent = "You're connected. Opening the internet now.";
          showManualActions();
          setTimeout(() => navigate(continueUrl), 150);
          websiteFallbackTimer = setTimeout(() => {
            if (!document.hidden) {
              navigate(websiteUrl);
            }
          }, isAppleCaptive ? 900 : 1800);
        }

        async function pollSession() {
          try {
            const res = await fetch(sessionUrl, { headers: { "accept": "application/json" }, cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.success) {
              throw new Error(data.error || "Unable to check Wi-Fi status.");
            }
            if (data.phase === "release") {
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

        continueLink?.addEventListener("click", (event) => {
          event.preventDefault();
          navigate(continueLink.href);
        });
        websiteLink?.addEventListener("click", (event) => {
          event.preventDefault();
          navigate(websiteLink.href);
        });

        if (${JSON.stringify(session.status)} === "completed") {
          beginRelease(${JSON.stringify({
            continue_target: session.continue_target,
            release_target: session.release_target,
            website_url: session.website_url,
            secondary_target: session.secondary_target,
          })});
        } else {
          pollSession();
          setTimeout(showManualActions, 5000);
        }

        window.addEventListener("pagehide", () => {
          if (websiteFallbackTimer) clearTimeout(websiteFallbackTimer);
        });
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
      await updateSession(existing.session_key, {
        ap_mac: normalizeMac(req.query.ap || req.query.ap_mac) || existing.ap_mac,
        unifi_t: typeof req.query.t === "string" ? req.query.t : existing.unifi_t,
        redirect_url: typeof req.query.url === "string" ? req.query.url : existing.redirect_url,
        user_agent: req.headers["user-agent"] || existing.user_agent,
        release_target: siteConfig.continueUrl,
        continue_target: siteConfig.continueUrl,
        secondary_target: siteConfig.websiteUrl,
        final_redirect_url: siteConfig.websiteUrl,
        website_url: siteConfig.websiteUrl,
      });
      res.redirect(`/guest/s/${encodeURIComponent(site)}/progress?session_key=${encodeURIComponent(existing.session_key)}`);
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

    const connectPayload = {
      action: "connect",
      unifi_site: site,
      client_mac: session.client_mac,
      ap_mac: session.ap_mac,
      unifi_t: session.unifi_t,
      redirect_url: session.redirect_url,
      ssid: session.ssid,
      name: formValues.name,
      email: formValues.email,
      mobile: formValues.mobile || undefined,
      postcode: formValues.postcode || undefined,
      marketing_opt_in: true,
      trace_id: session.trace_id,
      venue_slug: site,
    };

    log("unifi_authorize_request_started", {
      site,
      session_key: sessionKey,
      client_mac: session.client_mac,
      endpoint: WIFI_CONNECT_FUNCTION_URL,
    });
    const connectResult = await callWifiConnect(connectPayload);
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

    const redirectContract = connectResult.body?.redirect_contract || {};
    const releaseTarget = siteConfig.continueUrl;
    const websiteUrl = safeUrl(
      redirectContract.website_url,
      session.website_url || siteConfig.websiteUrl,
    );
    const completedSession = await updateSession(sessionKey, {
      status: "completed",
      trace_id: connectResult.body?.trace_id || session.trace_id,
      authorized_at: new Date().toISOString(),
      release_target: releaseTarget,
      continue_target: releaseTarget,
      secondary_target: websiteUrl,
      final_redirect_url: websiteUrl,
      website_url: websiteUrl,
      release_mode: redirectContract.redirect_mode || session.release_mode,
      last_error: null,
    });

    res.redirect(`/guest/s/${encodeURIComponent(site)}/progress?session_key=${encodeURIComponent(completedSession.session_key)}`);
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
    res.status(200).send(renderProgressPage({
      siteConfig: getSiteConfig(site),
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
      res.json({
        success: true,
        phase: "release",
        session_key: session.session_key,
        release_target: session.release_target,
        continue_target: session.continue_target,
        secondary_target: session.secondary_target,
        website_url: session.website_url,
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

    const statusResult = await callWifiConnect({
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
        last_error: null,
      });
      res.json({
        success: true,
        phase: "release",
        session_key: updated.session_key,
        release_target: updated.release_target,
        continue_target: updated.continue_target,
        secondary_target: updated.secondary_target,
        website_url: updated.website_url,
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

app.listen(PORT, () => {
  log("portal_server_started", {
    port: PORT,
    session_window_minutes: SESSION_WINDOW_MINUTES,
    wifi_connect_function_url: WIFI_CONNECT_FUNCTION_URL,
    configured_sites: Object.keys(SITE_MAP),
  });
});
