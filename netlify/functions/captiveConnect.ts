import { Handler } from '@netlify/functions';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const websiteFallbackUrl = process.env.PORTAL_WEBSITE_URL || 'https://www.thebatesfordhotel.com.au/';
const httpReleaseFallbackUrl = 'http://neverssl.com/';
const captiveGenerate204Url = 'https://www.google.com/generate_204';

type RedirectContract = {
  redirect_mode?: 'probe_redirect' | 'website_redirect' | 'verify_timeout_success_page';
  redirect_url?: string | null;
  website_url?: string;
  release_result?: string;
  verify_attempts?: number;
};

type WifiConnectResponse = {
  success?: boolean;
  trace_id?: string;
  error?: string;
  redirect_contract?: RedirectContract;
  debug?: Record<string, unknown>;
};

type FetchSubmitResponse = {
  success: boolean;
  state: 'connected' | 'error';
  trace_id?: string;
  error?: string;
  next_url?: string;
  website_url?: string;
  release_target?: string;
  continue_target?: string;
  secondary_target?: string;
  final_redirect_url?: string;
  release_mode?: string;
  release_result?: string;
  probe_url?: string;
  debug?: Record<string, unknown>;
};

const decodeBody = (rawBody: string | null, isBase64: boolean) => {
  if (!rawBody) return '';
  return isBase64 ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
};

const toQueryParams = (eventUrl: string) => {
  const parsed = new URL(eventUrl);
  return parsed.searchParams;
};

const safeDecode = (value: string | null | undefined) => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const jsonRedirect = (target: string) => ({
  statusCode: 303,
  headers: {
    Location: target,
    'Cache-Control': 'no-store'
  },
  body: ''
});

const jsonResponse = (statusCode: number, body: FetchSubmitResponse) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

const parseJsonField = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
    if (host.includes('google.com') && (path.includes('gen_204') || path.includes('generate_204'))) return true;
    if (host.includes('msftconnecttest.com')) return true;
    if (host.includes('msftncsi.com')) return true;
    if (host.includes('neverssl.com')) return true;
    return false;
  } catch {
    return false;
  }
};

const buildReleasePlan = (
  redirectUrl: string,
  websiteUrl: string,
  isCaptiveAssistant: boolean,
) => {
  const safeOriginal = safeUrl(redirectUrl, '');
  const safeWebsite = safeUrl(websiteUrl, websiteFallbackUrl);
  const shouldBypassOriginal = !safeOriginal
    ? false
    : isCaptiveAssistant && isProbeUrl(safeOriginal);
  const releaseTarget = shouldBypassOriginal
    ? httpReleaseFallbackUrl || captiveGenerate204Url || safeWebsite || safeOriginal
    : safeOriginal || httpReleaseFallbackUrl || captiveGenerate204Url || safeWebsite;
  const continueTarget = httpReleaseFallbackUrl;
  const secondaryTarget = safeWebsite || (shouldBypassOriginal ? captiveGenerate204Url : safeOriginal) || releaseTarget;

  return {
    releaseTarget,
    continueTarget: safeUrl(continueTarget, releaseTarget),
    secondaryTarget: safeUrl(secondaryTarget, releaseTarget),
    finalRedirectUrl: shouldBypassOriginal ? safeWebsite : (safeOriginal || safeWebsite),
    releaseMode: shouldBypassOriginal
      ? 'probe_override'
      : (safeOriginal ? 'original_redirect' : 'http_fallback')
  };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return { statusCode: 500, body: 'Missing Supabase configuration' };
  }

  const raw = decodeBody(event.body, event.isBase64Encoded === true);
  const form = new URLSearchParams(raw);
  const eventQuery = toQueryParams(event.rawUrl || 'https://example.com/connect/submit');

  const clientMac = safeDecode(form.get('client_mac') || eventQuery.get('id'));
  const apMac = safeDecode(form.get('ap_mac') || eventQuery.get('ap'));
  const unifiT = safeDecode(form.get('unifi_t') || eventQuery.get('t'));
  const redirectUrl = safeDecode(form.get('redirect_url') || eventQuery.get('url'));
  const ssid = safeDecode(form.get('ssid') || eventQuery.get('ssid'));
  const unifiSite = safeDecode(form.get('unifi_site') || eventQuery.get('site'));
  const unifiId = safeDecode(form.get('unifi_id') || clientMac);
  const traceId = safeDecode(form.get('trace_id'));
  const sessionId = safeDecode(form.get('session_id'));
  const attemptNo = Number(form.get('attempt_no') || '1');
  const debugRequested = safeDecode(form.get('debug') || eventQuery.get('debug')) === '1';
  const fetchMode = event.headers['x-portal-fetch'] === '1' || safeDecode(form.get('response_mode')) === 'json';
  const edgeRouteId = event.headers['x-nf-request-id'] || event.headers['cf-ray'] || null;

  const forwardParams = new URLSearchParams();
  if (clientMac) forwardParams.set('id', clientMac);
  if (apMac) forwardParams.set('ap', apMac);
  if (unifiT) forwardParams.set('t', unifiT);
  if (redirectUrl) forwardParams.set('url', redirectUrl);
  if (ssid) forwardParams.set('ssid', ssid);
  if (unifiSite) forwardParams.set('site', unifiSite);
  if (traceId) forwardParams.set('trace_id', traceId);
  if (sessionId) forwardParams.set('session_id', sessionId);
  if (Number.isFinite(attemptNo) && attemptNo > 0) forwardParams.set('attempt_no', String(attemptNo));

  if (!clientMac || !unifiSite) {
    const params = new URLSearchParams(forwardParams);
    params.set('state', 'error');
    params.set('error', 'Missing required UniFi session details. Please reconnect to Guest Wi-Fi.');
    if (fetchMode) {
      return jsonResponse(400, {
        success: false,
        state: 'error',
        error: 'Missing required UniFi session details. Please reconnect to Guest Wi-Fi.',
        next_url: `/connect?${params.toString()}`
      });
    }
    return jsonRedirect(`/connect?${params.toString()}`);
  }

  const traceContext = parseJsonField<Record<string, unknown>>(form.get('trace_context_json'), {});
  const traceEvents = parseJsonField<Array<Record<string, unknown>>>(form.get('trace_events_json'), []);
  const timings = parseJsonField<Record<string, unknown>>(form.get('timings_json'), {});
  const userAgent = String(event.headers['user-agent'] || '');
  const isCaptiveAssistant = traceContext?.is_captive_assistant === true ||
    /captivenetworksupport|captivenetwork|hotspot|wifilogin|iphone|ipad|ipod/i.test(userAgent);

  const requestPayload = {
    action: 'connect',
    trace_id: traceId || undefined,
    venue_slug: unifiSite,
    session_id: sessionId || undefined,
    attempt_no: Number.isFinite(attemptNo) && attemptNo > 0 ? Math.floor(attemptNo) : 1,
    name: safeDecode(form.get('name')),
    email: safeDecode(form.get('email')),
    mobile: safeDecode(form.get('phone')),
    postcode: safeDecode(form.get('postcode')) || null,
    marketing_opt_in: form.get('terms') === 'on' || form.get('terms') === 'true' || form.get('terms') === '1',
    client_mac: clientMac,
    ap_mac: apMac || null,
    ssid: ssid || null,
    redirect_url: redirectUrl || null,
    unifi_site: unifiSite,
    unifi_id: unifiId || null,
    unifi_ap: apMac || null,
    unifi_t: unifiT || null,
    edge_route_id: edgeRouteId,
    debug: debugRequested,
    trace_context: {
      ...traceContext,
      request_url: traceContext?.request_url || event.rawUrl || null,
      page_url: traceContext?.page_url || event.headers.referer || null,
      user_agent: userAgent || null,
      is_captive_assistant: isCaptiveAssistant
    },
    trace_events: traceEvents,
    timings
  };

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/wifi-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify(requestPayload)
    });
  } catch (error) {
    const params = new URLSearchParams(forwardParams);
    params.set('state', 'error');
    params.set('error', 'Unable to reach Wi-Fi authorization service.');
    if (fetchMode) {
      return jsonResponse(502, {
        success: false,
        state: 'error',
        error: 'Unable to reach Wi-Fi authorization service.',
        next_url: `/connect?${params.toString()}`
      });
    }
    return jsonRedirect(`/connect?${params.toString()}`);
  }

  const data = (await response.json().catch(() => ({}))) as WifiConnectResponse;
  const effectiveTraceId = data.trace_id || traceId;
  if (effectiveTraceId) {
    forwardParams.set('trace_id', effectiveTraceId);
  }

  if (!response.ok || data.success !== true) {
    const params = new URLSearchParams(forwardParams);
    params.set('state', 'error');
    params.set('error', data.error || 'Could not connect to Wi-Fi right now. Please try again.');
    if (fetchMode) {
      return jsonResponse(response.status || 502, {
        success: false,
        state: 'error',
        trace_id: effectiveTraceId || undefined,
        error: data.error || 'Could not connect to Wi-Fi right now. Please try again.',
        next_url: `/connect?${params.toString()}`,
        debug: data.debug
      });
    }
    return jsonRedirect(`/connect?${params.toString()}`);
  }

  const redirectContract = data.redirect_contract || {};
  const websiteUrl = safeUrl(redirectContract.website_url, websiteFallbackUrl);
  const contractMode = redirectContract.redirect_mode;
  const releasePlan = buildReleasePlan(
    redirectContract.redirect_url || redirectUrl,
    websiteUrl,
    isCaptiveAssistant,
  );

  const params = new URLSearchParams(forwardParams);
  params.set('state', 'connected');
  params.set('website', websiteUrl);
  params.set('release_target', releasePlan.releaseTarget);
  params.set('continue_target', releasePlan.continueTarget);
  params.set('secondary_target', releasePlan.secondaryTarget);
  params.set('final_redirect_url', releasePlan.finalRedirectUrl || websiteUrl);
  params.set('release_mode', releasePlan.releaseMode);
  params.set(
    'release_result',
    redirectContract.release_result || (contractMode === 'probe_redirect' ? 'authorized_verified' : 'authorized_unverified_timeout')
  );
  if (redirectUrl) {
    params.set('probe_url', redirectUrl);
  }
  if (debugRequested) {
    params.set('debug', '1');
    const authorizeDebug = data.debug?.unifi_authorize as Record<string, unknown> | undefined;
    const authorizeStatus = typeof authorizeDebug?.status === 'number'
      ? String(authorizeDebug.status)
      : '';
    const authorizeEndpoint = typeof authorizeDebug?.endpoint === 'string'
      ? authorizeDebug.endpoint
      : '';
    const authorizeMode = typeof authorizeDebug?.mode === 'string'
      ? authorizeDebug.mode
      : '';
    if (authorizeStatus) params.set('debug_authorize_status', authorizeStatus);
    if (authorizeEndpoint) params.set('debug_authorize_endpoint', authorizeEndpoint);
    if (authorizeMode) params.set('debug_authorize_mode', authorizeMode);
  }
  const nextUrl = `/connect?${params.toString()}`;
  if (fetchMode) {
    return jsonResponse(200, {
      success: true,
      state: 'connected',
      trace_id: effectiveTraceId || undefined,
      next_url: nextUrl,
      website_url: websiteUrl,
      release_target: releasePlan.releaseTarget,
      continue_target: releasePlan.continueTarget,
      secondary_target: releasePlan.secondaryTarget,
      final_redirect_url: releasePlan.finalRedirectUrl || websiteUrl,
      release_mode: releasePlan.releaseMode,
      release_result: redirectContract.release_result || (contractMode === 'probe_redirect' ? 'authorized_verified' : 'authorized_unverified_timeout'),
      probe_url: redirectUrl || undefined,
      debug: data.debug
    });
  }
  return jsonRedirect(nextUrl);
};
