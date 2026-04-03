import { Handler } from '@netlify/functions';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const websiteFallbackUrl = process.env.PORTAL_WEBSITE_URL || 'https://www.thebatesfordhotel.com.au/';

type WifiStatusResponse = {
  success?: boolean;
  trace_id?: string;
  authorized?: boolean;
  authorized_unifi?: boolean;
  authorized_fallback?: boolean;
  status_source?: string;
  status_mode?: string;
  error?: string;
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
        status_mode: 'strict',
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
  const authorized = data.success === true && data.authorized_unifi === true;
  const safeProbe = safeUrl(redirectUrl, websiteUrl);
  const shouldUseProbe = !probeDone && redirectUrl && isProbeUrl(safeProbe);

  return json(200, {
    trace_id: data.trace_id || traceId || null,
    authorized,
    authorized_unifi: data.authorized_unifi === true,
    authorized_fallback: data.authorized_fallback === true,
    status_source: data.status_source || 'none',
    status_mode: data.status_mode || 'strict',
    redirect_mode: authorized
      ? (shouldUseProbe ? 'probe_redirect' : 'website_redirect')
      : 'pending',
    redirect_url: authorized
      ? (shouldUseProbe ? safeProbe : websiteUrl)
      : null,
    probe_url: shouldUseProbe ? safeProbe : null,
    website_url: websiteUrl,
    release_result: authorized ? 'authorized_verified' : 'pending'
  });
};

