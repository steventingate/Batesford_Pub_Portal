import { Handler } from '@netlify/functions';

type Smtp2GoResponse = { data?: { failures?: { message?: string }[]; email_id?: string } };

type ResendResponse = { id?: string; message?: string };

type Campaign = {
  id: string;
  subject: string;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  html_body: string;
  segment_json: Record<string, unknown> | null;
};

type ContactRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

type AdminProfile = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const provider = (process.env.EMAIL_PROVIDER || 'SMTP2GO').toUpperCase();
const smtp2goKey = process.env.SMTP2GO_API_KEY || '';
const resendKey = process.env.RESEND_API_KEY || '';
const defaultFromEmail = process.env.DEFAULT_FROM_EMAIL || 'hello@thebatesfordhotel.com.au';
const defaultFromName = process.env.DEFAULT_FROM_NAME || 'Batesford Pub';

const restBase = supabaseUrl ? `${supabaseUrl}/rest/v1` : '';
const authBase = supabaseUrl ? `${supabaseUrl}/auth/v1` : '';

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});

const applyMergeTags = (html: string, data: Record<string, string>) => {
  return html
    .replace(/{{\s*first_name\s*}}/gi, data.first_name || 'there')
    .replace(/{{\s*email\s*}}/gi, data.email || '')
    .replace(/{{\s*venue_name\s*}}/gi, data.venue_name || 'Batesford Pub');
};

const apiHeaders = (authToken?: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${authToken || serviceRoleKey}`,
  'Content-Type': 'application/json'
});

const restUrl = (path: string, params?: Record<string, string> | Array<[string, string]>) => {
  const url = new URL(`${restBase}/${path}`);
  if (params) {
    if (Array.isArray(params)) {
      params.forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    } else {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
  }
  return url.toString();
};

const fetchJson = async <T>(url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    return { ok: false, data: null as T | null, error: data?.message || 'Request failed.' };
  }
  return { ok: true, data: data as T, error: null };
};

const fetchAuthUser = async (token: string) => {
  const response = await fetch(`${authBase}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceRoleKey
    }
  });

  const data = (await response.json().catch(() => null)) as { message?: string; id?: string } | null;
  if (!response.ok) {
    return { ok: false, data: null, error: data?.message || 'Invalid token.' };
  }
  return { ok: true, data };
};

const fetchSingle = async <T>(path: string, params: Record<string, string> | Array<[string, string]>) => {
  const url = restUrl(path, params);
  return fetchJson<T>(url, {
    method: 'GET',
    headers: {
      ...apiHeaders(),
      Accept: 'application/vnd.pgrst.object+json'
    }
  });
};

const fetchList = async <T>(path: string, params: Record<string, string> | Array<[string, string]>) => {
  const url = restUrl(path, params);
  return fetchJson<T>(url, {
    method: 'GET',
    headers: apiHeaders()
  });
};

const patchRow = async (path: string, params: Record<string, string>, payload: Record<string, unknown>) => {
  const url = restUrl(path, params);
  return fetchJson(url, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(payload)
  });
};

const insertRows = async <T>(path: string, payload: unknown) => {
  const url = restUrl(path, { select: 'id,to_email,contact_id' });
  return fetchJson<T>(url, {
    method: 'POST',
    headers: {
      ...apiHeaders(),
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });
};

const sendViaSmtp2Go = async (payload: {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
}) => {
  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: smtp2goKey,
      to: [payload.to],
      sender: payload.fromEmail,
      subject: payload.subject,
      html_body: payload.html,
      reply_to: payload.replyTo || undefined
    })
  });

  const data = (await response.json().catch(() => ({}))) as Smtp2GoResponse;
  if (!response.ok || data?.data?.failures?.length) {
    return { ok: false, messageId: null, error: data?.data?.failures?.[0]?.message || 'SMTP2GO send failed' };
  }

  return { ok: true, messageId: data?.data?.email_id || null, error: null };
};

const sendViaResend = async (payload: {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`
    },
    body: JSON.stringify({
      from: `${payload.fromName} <${payload.fromEmail}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.replyTo || undefined
    })
  });

  const data = (await response.json().catch(() => ({}))) as ResendResponse;
  if (!response.ok) {
    return { ok: false, messageId: null, error: data?.message || 'Resend send failed' };
  }

  return { ok: true, messageId: data?.id || null, error: null };
};

const sendEmail = async (payload: {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
}) => {
  if (provider === 'RESEND') {
    return sendViaResend(payload);
  }
  return sendViaSmtp2Go(payload);
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing Supabase environment variables.' });
  }

  const token = event.headers.authorization?.replace('Bearer ', '') || '';
  if (!token) {
    return jsonResponse(401, { error: 'Missing authorization token.' });
  }

  const authUser = await fetchAuthUser(token);
  if (!authUser.ok || !authUser.data?.id) {
    return jsonResponse(401, { error: 'Invalid token.' });
  }

  const adminResult = await fetchSingle<AdminProfile>('admin_profiles', {
    select: 'user_id,full_name,role',
    user_id: `eq.${authUser.data.id}`,
    role: 'in.(admin,manager)'
  });

  if (!adminResult.ok || !adminResult.data) {
    return jsonResponse(403, { error: 'Not an admin.' });
  }

  const body = JSON.parse(event.body || '{}');
  const { campaignId, mode, testEmail } = body as {
    campaignId?: string;
    mode?: 'send' | 'test';
    testEmail?: string;
  };

  if (!campaignId) {
    return jsonResponse(400, { error: 'Missing campaignId.' });
  }

  const campaignResult = await fetchSingle<Campaign>('email_campaigns', {
    select: '*',
    id: `eq.${campaignId}`
  });

  if (!campaignResult.ok || !campaignResult.data) {
    return jsonResponse(404, { error: 'Campaign not found.' });
  }

  const campaign = campaignResult.data;

  if (mode === 'test') {
    if (!testEmail) {
      return jsonResponse(400, { error: 'Missing test email.' });
    }
    const html = applyMergeTags(campaign.html_body, {
      first_name: 'Guest',
      email: testEmail,
      venue_name: 'Batesford Pub'
    });
    const result = await sendEmail({
      to: testEmail,
      subject: campaign.subject,
      html,
      fromEmail: campaign.from_email || defaultFromEmail,
      fromName: campaign.from_name || defaultFromName,
      replyTo: campaign.reply_to || undefined
    });

    if (!result.ok) {
      return jsonResponse(500, { error: result.error || 'Send failed.' });
    }

    return jsonResponse(200, { ok: true, messageId: result.messageId });
  }

  const segment = (campaign.segment_json || {}) as {
    lastSeenDays?: number;
    returningOnly?: boolean;
    hasEmail?: boolean;
    hasMobile?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
  };

  const params: Array<[string, string]> = [['select', 'id,full_name,email,phone,created_at']];

  if (segment.lastSeenDays) {
    const since = new Date();
    since.setDate(since.getDate() - segment.lastSeenDays);
    params.push(['created_at', `gte.${since.toISOString()}`]);
  }
  if (segment.hasEmail) {
    params.push(['email', 'not.is.null'], ['email', 'neq.']);
  }
  if (segment.hasMobile) {
    params.push(['phone', 'not.is.null'], ['phone', 'neq.']);
  }

  const contactsResult = await fetchList<ContactRow[]>('contact_submissions', params);
  if (!contactsResult.ok) {
    return jsonResponse(500, { error: contactsResult.error || 'Failed to load contacts.' });
  }

  let filtered = contactsResult.data || [];

  if (segment.includeTags?.length) {
    const tags = segment.includeTags.map((tag) => tag.replace(/,/g, '')).join(',');
    const includeTagsResult = await fetchList<{ contact_id: string }[]>('contact_tags', {
      select: 'contact_id',
      tag: `in.(${tags})`
    });
    const includeSet = new Set((includeTagsResult.data || []).map((row) => row.contact_id));
    filtered = filtered.filter((contact) => includeSet.has(contact.id));
  }

  if (segment.excludeTags?.length) {
    const tags = segment.excludeTags.map((tag) => tag.replace(/,/g, '')).join(',');
    const excludeTagsResult = await fetchList<{ contact_id: string }[]>('contact_tags', {
      select: 'contact_id',
      tag: `in.(${tags})`
    });
    const excludeSet = new Set((excludeTagsResult.data || []).map((row) => row.contact_id));
    filtered = filtered.filter((contact) => !excludeSet.has(contact.id));
  }

  if (segment.returningOnly) {
    const counts: Record<string, number> = {};
    filtered.forEach((contact) => {
      if (contact.email) {
        const key = contact.email.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    filtered = filtered.filter((contact) => {
      if (!contact.email) return false;
      return counts[contact.email.toLowerCase()] > 1;
    });
  }

  const eligible = filtered.filter((contact) => contact.email);

  if (!eligible.length) {
    await patchRow('email_campaigns', { id: `eq.${campaignId}` }, { status: 'sent' });
    return jsonResponse(200, { ok: true, sent: 0 });
  }

  await patchRow('email_campaigns', { id: `eq.${campaignId}` }, { status: 'sending' });

  const sendRows = eligible.map((contact) => ({
    campaign_id: campaignId,
    contact_id: contact.id,
    to_email: contact.email,
    status: 'queued'
  }));

  const sendRecordsResult = await insertRows<{ id: string; to_email: string; contact_id: string }[]>('email_sends', sendRows);
  if (!sendRecordsResult.ok || !sendRecordsResult.data) {
    return jsonResponse(500, { error: sendRecordsResult.error || 'Failed to queue sends.' });
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const record of sendRecordsResult.data) {
    const contact = eligible.find((item) => item.id === record.contact_id);
    const firstName = contact?.full_name?.split(' ')[0] || 'there';
    const html = applyMergeTags(campaign.html_body, {
      first_name: firstName,
      email: record.to_email || '',
      venue_name: 'Batesford Pub'
    });

    const result = await sendEmail({
      to: record.to_email,
      subject: campaign.subject,
      html,
      fromEmail: campaign.from_email || defaultFromEmail,
      fromName: campaign.from_name || defaultFromName,
      replyTo: campaign.reply_to || undefined
    });

    if (!result.ok) {
      failedCount += 1;
      await patchRow('email_sends', { id: `eq.${record.id}` }, {
        status: 'failed',
        error: result.error,
        sent_at: new Date().toISOString()
      });
    } else {
      sentCount += 1;
      await patchRow('email_sends', { id: `eq.${record.id}` }, {
        status: 'sent',
        provider_message_id: result.messageId,
        sent_at: new Date().toISOString()
      });
    }
  }

  await patchRow('email_campaigns', { id: `eq.${campaignId}` }, { status: failedCount ? 'failed' : 'sent' });

  return jsonResponse(200, { ok: true, sent: sentCount, failed: failedCount });
};
