import { Handler } from '@netlify/functions';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const websiteFallbackUrl = process.env.PORTAL_WEBSITE_URL || 'https://www.thebatesfordhotel.com.au/';

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
    return jsonRedirect(`/connect?${params.toString()}`);
  }

  const traceContext = parseJsonField<Record<string, unknown>>(form.get('trace_context_json'), {});
  const traceEvents = parseJsonField<Array<Record<string, unknown>>>(form.get('trace_events_json'), []);
  const timings = parseJsonField<Record<string, unknown>>(form.get('timings_json'), {});

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
    trace_context: {
      ...traceContext,
      request_url: traceContext?.request_url || event.rawUrl || null,
      page_url: traceContext?.page_url || event.headers.referer || null,
      user_agent: event.headers['user-agent'] || null
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
    return jsonRedirect(`/connect?${params.toString()}`);
  }

  const redirectContract = data.redirect_contract || {};
  const websiteUrl = safeUrl(redirectContract.website_url, websiteFallbackUrl);
  const contractMode = redirectContract.redirect_mode;
  const contractRedirect = safeUrl(redirectContract.redirect_url || redirectUrl, websiteUrl);

  if (contractMode === 'website_redirect') {
    return jsonRedirect(contractRedirect || websiteUrl);
  }

  const params = new URLSearchParams(forwardParams);
  params.set('state', 'finalizing');
  params.set('website', websiteUrl);
  params.set(
    'release_result',
    redirectContract.release_result || (contractMode === 'probe_redirect' ? 'authorized_verified' : 'authorized_unverified_timeout')
  );
  if (redirectUrl) {
    params.set('probe_url', redirectUrl);
  }
  return jsonRedirect(`/connect?${params.toString()}`);
};
