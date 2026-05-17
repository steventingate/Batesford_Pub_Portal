import { Handler } from '@netlify/functions';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

const decodeBody = (rawBody: string | null, isBase64: boolean) => {
  if (!rawBody) return '';
  return isBase64 ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Missing Supabase configuration' });
  }

  const raw = decodeBody(event.body, event.isBase64Encoded === true);
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object') {
    return json(400, { error: 'Invalid timing payload' });
  }

  const requestPayload = {
    ...payload,
    action: 'timing',
    edge_route_id: payload.edge_route_id || event.headers['x-nf-request-id'] || event.headers['cf-ray'] || null,
  };

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/wifi-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify(requestPayload)
    });

    const body = await response.text();
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store'
      },
      body
    };
  } catch (error) {
    return json(502, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
