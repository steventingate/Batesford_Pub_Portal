import { Handler } from '@netlify/functions';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const websiteFallbackUrl = process.env.PORTAL_WEBSITE_URL || 'https://www.thebatesfordhotel.com.au/';
const httpReleaseFallbackUrl = 'http://neverssl.com/';
const captiveGenerate204Url = 'https://www.google.com/generate_204';
const enableProbeRedirect = process.env.CAPTIVE_ENABLE_PROBE_REDIRECT === 'true';

type WifiStatusResponse = {
  success?: boolean;
  trace_id?: string;
  authorized?: boolean;
  authorized_unifi?: boolean;
  authorized_fallback?: boolean;
  status_source?: string;
  status_mode?: string;
  error?: string;
  debug?: Record<string, unknown>;
};

const safeUrl = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const isProbeUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.includes('captive.apple.com')) return true;
    if (host.includes('connectivitycheck.gstatic.com')) return true;
    if (host.includes('connectivitycheck.android.com')) return true;
    if (host.includes('clients3.google.com') && path.includes('generate_204')) return true;
    if (host.includes('google.com') && path.includes('gen_204')) return true;
    if (host.includes('msftconnecttest.com')) return true;
    if (host.includes('msftncsi.com')) return true;
    return false;
  } catch {
    return false;
  }
};

const buildReleasePlan = (redirectUrl: string, websiteUrl: string, shouldUseProbe: boolean) => {
  const safeOriginal = safeUrl(redirectUrl, '');
  const safeWebsite = safeUrl(websiteUrl, websiteFallbackUrl);
  const releaseTarget = shouldUseProbe
    ? httpReleaseFallbackUrl || captiveGenerate204Url || safeWebsite || safeOriginal
    : safeOriginal || httpReleaseFallbackUrl || captiveGenerate204Url || safeWebsite;
  const continueTarget = httpReleaseFallbackUrl;
  const secondaryTarget = safeWebsite || (shouldUseProbe ? captiveGenerate204Url : safeOriginal) || releaseTarget;

  return {
    releaseTarget,
    continueTarget: safeUrl(continueTarget, releaseTarget),
    secondaryTarget: safeUrl(secondaryTarget, releaseTarget),
    finalRedirectUrl: shouldUseProbe ? safeWebsite : (safeOriginal || safeWebsite),
    redirectMode: shouldUseProbe ? 'probe_override' : (safeOriginal ? 'original_redirect' : 'http_fallback')
  };
};

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Missing Supabase configuration' });
  }

  const requestUrl = new URL(event.rawUrl || 'https://example.com/connect/status');
  const userAgent = (event.headers['user-agent'] || '').toLowerCase();
  const isCaptiveAssistant = userAgent.includes('captivenetworksupport') ||
    userAgent.includes('hotspot') ||
    userAgent.includes('wifilogin') ||
    userAgent.includes('iphone') ||
    userAgent.includes('ipad') ||
    userAgent.includes('ipod');
  const clientMac = requestUrl.searchParams.get('id') || '';
  const apMac = requestUrl.searchParams.get('ap') || '';
  const unifiT = requestUrl.searchParams.get('t') || '';
  const unifiSite = requestUrl.searchParams.get('site') || '';
  const unifiId = requestUrl.searchParams.get('id') || '';
  const redirectUrl = requestUrl.searchParams.get('url') || requestUrl.searchParams.get('probe_url') || '';
  const ssid = requestUrl.searchParams.get('ssid') || '';
  const traceId = requestUrl.searchParams.get('trace_id') || '';
  const sessionId = requestUrl.searchParams.get('session_id') || '';
  const attemptNo = Number(requestUrl.searchParams.get('attempt_no') || '1');
  const websiteUrl = safeUrl(requestUrl.searchParams.get('website'), websiteFallbackUrl);
  const probeDone = requestUrl.searchParams.get('probe_done') === '1';
  const debugRequested = requestUrl.searchParams.get('debug') === '1';

  if (!clientMac || !unifiSite) {
    return json(400, {
      authorized: false,
      status: 'invalid_request',
      error: 'Missing required status parameters.'
    });
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/wifi-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        action: 'status',
        status_mode: requestUrl.searchParams.get('status_mode') || 'compat',
        trace_id: traceId || undefined,
        venue_slug: unifiSite,
        session_id: sessionId || undefined,
        attempt_no: Number.isFinite(attemptNo) && attemptNo > 0 ? Math.floor(attemptNo) : 1,
        client_mac: clientMac,
        ap_mac: apMac || null,
        ssid: ssid || null,
        redirect_url: redirectUrl || null,
        unifi_site: unifiSite,
        unifi_id: unifiId || null,
        unifi_ap: apMac || null,
        unifi_t: unifiT || null,
        debug: debugRequested,
        edge_route_id: event.headers['x-nf-request-id'] || event.headers['cf-ray'] || null,
        trace_context: {
          request_url: requestUrl.toString(),
          user_agent: event.headers['user-agent'] || null
        }
      })
    });
  } catch {
    return json(200, {
      authorized: false,
      status: 'pending',
      release_result: 'status_request_failed',
      website_url: websiteUrl
    });
  }

  const data = (await response.json().catch(() => ({}))) as WifiStatusResponse;
  const authorized = data.success === true && data.authorized === true;
  const safeProbe = safeUrl(redirectUrl, websiteUrl);
  const shouldUseProbe = (enableProbeRedirect || isCaptiveAssistant) &&
    !probeDone &&
    redirectUrl &&
    isProbeUrl(safeProbe);
  const releasePlan = buildReleasePlan(redirectUrl, websiteUrl, shouldUseProbe);

  return json(200, {
    trace_id: data.trace_id || traceId || null,
    authorized,
    authorized_unifi: data.authorized_unifi === true,
    authorized_fallback: data.authorized_fallback === true,
    status_source: data.status_source || 'none',
    status_mode: data.status_mode || 'strict',
    redirect_mode: authorized
      ? releasePlan.redirectMode
      : 'pending',
    redirect_url: authorized
      ? releasePlan.releaseTarget
      : null,
    probe_url: shouldUseProbe ? safeProbe : null,
    release_target: authorized ? releasePlan.releaseTarget : null,
    continue_target: releasePlan.continueTarget,
    secondary_target: releasePlan.secondaryTarget,
    final_redirect_url: releasePlan.finalRedirectUrl || websiteUrl,
    website_url: websiteUrl,
    release_result: authorized ? 'authorized_verified' : 'pending',
    debug: debugRequested ? data.debug || null : undefined
  });
};
