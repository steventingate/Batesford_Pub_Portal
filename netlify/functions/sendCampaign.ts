import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const provider = (process.env.EMAIL_PROVIDER || 'SMTP2GO').toUpperCase();
const smtp2goKey = process.env.SMTP2GO_API_KEY || '';
const resendKey = process.env.RESEND_API_KEY || '';
const defaultFromEmail = process.env.DEFAULT_FROM_EMAIL || 'hello@thebatesfordhotel.com.au';
const defaultFromName = process.env.DEFAULT_FROM_NAME || 'Batesford Pub';

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

  const data = await response.json().catch(() => ({}));
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

  const data = await response.json().catch(() => ({}));
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return jsonResponse(401, { error: 'Invalid token.' });
  }

  const { data: adminProfile } = await supabase
    .from('admin_profiles')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (!adminProfile) {
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

  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return jsonResponse(404, { error: 'Campaign not found.' });
  }

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

  let query = supabase
    .from('contact_submissions')
    .select('id, name, email, mobile, created_at');

  if (segment.lastSeenDays) {
    const since = new Date();
    since.setDate(since.getDate() - segment.lastSeenDays);
    query = query.gte('created_at', since.toISOString());
  }
  if (segment.hasEmail) {
    query = query.not('email', 'is', null).neq('email', '');
  }
  if (segment.hasMobile) {
    query = query.not('mobile', 'is', null).neq('mobile', '');
  }

  const { data: contacts, error: contactError } = await query;
  if (contactError) {
    return jsonResponse(500, { error: contactError.message });
  }

  let filtered = contacts || [];

  if (segment.includeTags?.length) {
    const { data: includeTags } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag', segment.includeTags);
    const includeSet = new Set((includeTags || []).map((row) => row.contact_id));
    filtered = filtered.filter((contact) => includeSet.has(contact.id));
  }

  if (segment.excludeTags?.length) {
    const { data: excludeTags } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag', segment.excludeTags);
    const excludeSet = new Set((excludeTags || []).map((row) => row.contact_id));
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
    await supabase
      .from('email_campaigns')
      .update({ status: 'sent' })
      .eq('id', campaignId);
    return jsonResponse(200, { ok: true, sent: 0 });
  }

  await supabase
    .from('email_campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId);

  const sendRows = eligible.map((contact) => ({
    campaign_id: campaignId,
    contact_id: contact.id,
    to_email: contact.email,
    status: 'queued'
  }));

  const { data: sendRecords, error: sendError } = await supabase
    .from('email_sends')
    .insert(sendRows)
    .select('id, to_email, contact_id');

  if (sendError) {
    return jsonResponse(500, { error: sendError.message });
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const record of sendRecords || []) {
    const contact = eligible.find((item) => item.id === record.contact_id);
    const firstName = contact?.name?.split(' ')[0] || 'there';
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
      await supabase
        .from('email_sends')
        .update({
          status: 'failed',
          error: result.error,
          sent_at: new Date().toISOString()
        })
        .eq('id', record.id);
    } else {
      sentCount += 1;
      await supabase
        .from('email_sends')
        .update({
          status: 'sent',
          provider_message_id: result.messageId,
          sent_at: new Date().toISOString()
        })
        .eq('id', record.id);
    }
  }

  await supabase
    .from('email_campaigns')
    .update({ status: failedCount ? 'failed' : 'sent' })
    .eq('id', campaignId);

  return jsonResponse(200, { ok: true, sent: sentCount, failed: failedCount });
};
