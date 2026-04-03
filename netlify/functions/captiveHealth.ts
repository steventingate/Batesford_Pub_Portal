import { Handler } from '@netlify/functions';

const unifiBaseUrl = (process.env.UNIFI_BASE_URL || 'https://wifi.gearedit.com.au').replace(/\/$/, '');
const probePath = process.env.UNIFI_HEALTH_PATH || '/api/self';
const timeoutMs = Number(process.env.UNIFI_HEALTH_TIMEOUT_MS || 5000);

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

  const started = Date.now();
  const targetUrl = `${unifiBaseUrl}${probePath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - started;
    const reachable = response.status > 0;
    return json(reachable ? 200 : 503, {
      ok: reachable,
      probe_url: targetUrl,
      status_code: response.status,
      latency_ms: latencyMs,
      checked_at: new Date().toISOString()
    });
  } catch (error) {
    clearTimeout(timeoutId);
    return json(503, {
      ok: false,
      probe_url: targetUrl,
      error: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - started,
      checked_at: new Date().toISOString()
    });
  }
};

