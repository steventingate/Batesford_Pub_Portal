import { Handler } from '@netlify/functions';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

type DeauthorizeTestBody = {
  site?: string;
  mac?: string;
  debug?: boolean;
};

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

const normalizeMac = (value: string | null | undefined) => String(value || '').trim().toLowerCase().replace(/-/g, ':');

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Missing Supabase configuration' });
  }

  let body: DeauthorizeTestBody = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const site = String(body.site || '').trim();
  const mac = normalizeMac(body.mac);

  if (!site || !mac) {
    return json(400, {
      error: '`site` and `mac` are required'
    });
  }

  const startedAt = Date.now();

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
        action: 'deauthorize_test',
        unifi_site: site,
        venue_slug: site,
        client_mac: mac,
        unifi_id: mac,
        debug: body.debug === true
      })
    });
  } catch (error) {
    return json(502, {
      success: false,
      site,
      mac,
      elapsed_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  return json(response.status, {
    site,
    mac,
    elapsed_ms: Date.now() - startedAt,
    ...(payload && typeof payload === 'object' ? payload : {})
  });
};
