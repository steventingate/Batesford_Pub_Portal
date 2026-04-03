import { schedule } from '@netlify/functions';

const unifiBaseUrl = (process.env.UNIFI_BASE_URL || 'https://wifi.gearedit.com.au').replace(/\/$/, '');
const probePath = process.env.UNIFI_HEALTH_PATH || '/api/self';
const timeoutMs = Number(process.env.UNIFI_HEALTH_TIMEOUT_MS || 5000);

export const handler = schedule('*/1 * * * *', async () => {
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
    console.log(JSON.stringify({
      type: 'captive_health_synthetic',
      ok: response.ok,
      status_code: response.status,
      latency_ms: Date.now() - started,
      target: targetUrl
    }));
  } catch (error) {
    clearTimeout(timeoutId);
    console.log(JSON.stringify({
      type: 'captive_health_synthetic',
      ok: false,
      latency_ms: Date.now() - started,
      target: targetUrl,
      error: error instanceof Error ? error.message : String(error)
    }));
  }

  return {
    statusCode: 200,
    body: ''
  };
});
