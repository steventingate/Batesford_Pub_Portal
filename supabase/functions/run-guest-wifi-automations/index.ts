import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  automation_id?: string | null;
  dry_run?: boolean;
};

type AutomationRow = {
  id: string;
  name: string;
  trigger_type: string;
  channel: string;
  segment_definition: Record<string, unknown> | null;
  template: { subject?: string; body?: string } | null;
  enabled: boolean;
  linked_voucher_id: string | null;
};

type GuestRow = {
  guest_id: string;
  email: string | null;
  full_name: string | null;
  mobile: string | null;
  segment: string | null;
  visit_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  marketing_consent: boolean | null;
  unsubscribe_status: boolean | null;
  tags: string[] | null;
};

const isAllowedOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      url.hostname.endsWith(".netlify.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
};

const buildCorsHeaders = (origin: string | null) => {
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
};

const daysSince = (value: string | null) => {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
};

const getSegmentMatch = (
  guest: GuestRow,
  segmentDefinition: Record<string, unknown> | null,
) => {
  if (!segmentDefinition) return true;
  const requiredSegment = typeof segmentDefinition.segment === "string"
    ? segmentDefinition.segment
    : null;
  const requireEmail = segmentDefinition.hasEmail === true;
  const requireMobile = segmentDefinition.hasMobile === true;
  const requiredTags = Array.isArray(segmentDefinition.tags)
    ? segmentDefinition.tags.map((tag) => String(tag).toLowerCase())
    : [];

  if (requiredSegment && guest.segment !== requiredSegment) return false;
  if (requireEmail && !guest.email) return false;
  if (requireMobile && !guest.mobile) return false;
  if (requiredTags.length) {
    const guestTags = (guest.tags ?? []).map((tag) => tag.toLowerCase());
    if (!requiredTags.every((tag) => guestTags.includes(tag))) return false;
  }
  return true;
};

const getTriggerMatch = (guest: GuestRow, triggerType: string) => {
  const visits = Number(guest.visit_count ?? 0);
  const lastSeenDays = daysSince(guest.last_seen_at);

  if (triggerType === "first_visit_welcome") return visits === 1;
  if (triggerType === "after_3_visits") return visits >= 3;
  if (triggerType === "regular_customer_reward") return visits >= 5;
  if (triggerType === "failed_authorization_alert") return false;
  if (triggerType.startsWith("lapsed_")) {
    const days = Number(triggerType.replace("lapsed_", "").replace("_days", ""));
    return Number.isFinite(days) ? lastSeenDays >= days : false;
  }
  return false;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration." }),
      { status: 500, headers: corsHeaders },
    );
  }

  let payload: Payload = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
  if (adminError || !isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let automationQuery = serviceClient
    .from("automations")
    .select("id, name, trigger_type, channel, segment_definition, template, enabled, linked_voucher_id")
    .eq("enabled", true);

  if (payload.automation_id) {
    automationQuery = automationQuery.eq("id", payload.automation_id);
  }

  const { data: automations, error: automationError } = await automationQuery;
  if (automationError) {
    return new Response(JSON.stringify({ error: automationError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const { data: guests, error: guestError } = await serviceClient
    .from("guest_summary_view")
    .select("guest_id, email, full_name, mobile, segment, visit_count, first_seen_at, last_seen_at, marketing_consent, unsubscribe_status, tags");

  if (guestError) {
    return new Response(JSON.stringify({ error: guestError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const sendEnabled = Deno.env.get("AUTOMATIONS_SEND_ENABLED") === "true";
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM");
  const canActuallySend = sendEnabled && Boolean(resendKey) && Boolean(resendFrom) && !payload.dry_run;

  const summaries: Array<Record<string, unknown>> = [];

  for (const automation of (automations ?? []) as AutomationRow[]) {
    const { data: run, error: runError } = await serviceClient
      .from("automation_runs")
      .insert({
        automation_id: automation.id,
        status: "running",
      })
      .select("id")
      .single();

    if (runError || !run) {
      summaries.push({
        automation_id: automation.id,
        name: automation.name,
        error: "Could not create run record",
      });
      continue;
    }

    try {
      const eligibleGuests = ((guests ?? []) as GuestRow[])
        .filter((guest) => guest.marketing_consent === true)
        .filter((guest) => guest.unsubscribe_status !== true)
        .filter((guest) => getSegmentMatch(guest, automation.segment_definition))
        .filter((guest) => getTriggerMatch(guest, automation.trigger_type))
        .filter((guest) => {
          if (automation.channel === "email") return Boolean(guest.email);
          if (automation.channel === "sms") return Boolean(guest.mobile);
          return true;
        });

      let sentCount = 0;
      let dedupedCount = 0;

      const { data: existingDeliveries } = await serviceClient
        .from("automation_deliveries")
        .select("guest_id")
        .eq("automation_id", automation.id);

      const existingGuestIds = new Set(
        (existingDeliveries ?? []).map((row: { guest_id: string }) => row.guest_id),
      );

      const toProcess = eligibleGuests.filter((guest) => {
        const seen = existingGuestIds.has(guest.guest_id);
        if (seen) dedupedCount += 1;
        return !seen;
      });

      if (canActuallySend && automation.channel === "email") {
        for (const guest of toProcess) {
          const subject = automation.template?.subject?.trim() || automation.name;
          const body = automation.template?.body?.trim() || "Automation send";
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: resendFrom,
              to: [guest.email],
              subject,
              text: `${guest.full_name || "Guest"} - ${body}`,
            }),
          });

          if (res.ok) {
            sentCount += 1;
            await serviceClient.from("automation_deliveries").insert({
              automation_id: automation.id,
              automation_run_id: run.id,
              guest_id: guest.guest_id,
              channel: automation.channel,
              status: "sent",
              delivered_at: new Date().toISOString(),
            });
          }
        }
      }

      const status = canActuallySend ? "completed" : "simulated";
      await serviceClient
        .from("automation_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          result: {
            dry_run: !canActuallySend,
            matched_guests: eligibleGuests.length,
            processed_guests: toProcess.length,
            deduped_guests: dedupedCount,
            sent_count: sentCount,
          },
        })
        .eq("id", run.id);

      await serviceClient
        .from("automations")
        .update({
          last_run_at: new Date().toISOString(),
        })
        .eq("id", automation.id);

      summaries.push({
        automation_id: automation.id,
        name: automation.name,
        status,
        matched_guests: eligibleGuests.length,
        processed_guests: toProcess.length,
        deduped_guests: dedupedCount,
        sent_count: sentCount,
      });
    } catch (error) {
      await serviceClient
        .from("automation_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", run.id);

      summaries.push({
        automation_id: automation.id,
        name: automation.name,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      simulated: !canActuallySend,
      results: summaries,
    }),
    { status: 200, headers: corsHeaders },
  );
});
