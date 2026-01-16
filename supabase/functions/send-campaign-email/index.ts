import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Payload = {
  template_id?: string;
  mode?: "test" | "single";
  guest_id?: string | null;
  to_email?: string | null;
  to_name?: string | null;
  subject_override?: string | null;
  debug?: boolean;
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

const stripEmptyImages = (html: string) => {
  return html.replace(/<img[^>]*src=['"]{0,1}['"]{0,1}[^>]*>/gi, "");
};

const applyTokens = (template: string, tokens: Record<string, string>) => {
  let result = template;
  Object.entries(tokens).forEach(([key, value]) => {
    result = result.split(`{{${key}}}`).join(value);
  });
  return stripEmptyImages(result);
};

const getFirstName = (fullName: string | null) => {
  if (!fullName) return "there";
  return fullName.split(" ")[0] || "there";
};

const toLocalDate = (iso: string | null, fallback: string) => {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed." }),
      { status: 405, headers: corsHeaders },
    );
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

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: corsHeaders },
    );
  }

  if (!payload.template_id || !payload.mode) {
    return new Response(
      JSON.stringify({ error: "template_id and mode are required." }),
      { status: 400, headers: corsHeaders },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth
    .getUser();
  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized." }),
      { status: 401, headers: corsHeaders },
    );
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc(
    "is_admin",
  );
  if (adminError || !isAdmin) {
    return new Response(
      JSON.stringify({ error: "Admin access required." }),
      { status: 403, headers: corsHeaders },
    );
  }

  if (payload.mode === "test" && !payload.to_email) {
    return new Response(
      JSON.stringify({ error: "to_email is required for test mode." }),
      { status: 400, headers: corsHeaders },
    );
  }

  if (payload.mode === "single" && !payload.guest_id && !payload.to_email) {
    return new Response(
      JSON.stringify({ error: "guest_id or to_email is required." }),
      { status: 400, headers: corsHeaders },
    );
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: template, error: templateError } = await serviceClient
    .from("campaign_templates")
    .select("id, name, subject, body_html, body_text")
    .eq("id", payload.template_id)
    .single();

  if (templateError || !template) {
    return new Response(
      JSON.stringify({ error: "Template not found." }),
      { status: 404, headers: corsHeaders },
    );
  }

  const { data: brandAssets } = await serviceClient
    .from("brand_assets")
    .select("key, url");
  const brandMap: Record<string, string> = {};
  (brandAssets ?? []).forEach((row: { key: string; url: string }) => {
    brandMap[row.key] = row.url;
  });

  const fallbackDate = new Date().toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  let toEmail = payload.to_email?.trim().toLowerCase() || "";
  let recipientName = payload.to_name?.trim() || "";
  let visitCount: number | null = null;
  let lastSeenAt: string | null = null;
  let guestId: string | null = payload.guest_id ?? null;

  if (payload.mode === "single" && guestId) {
    const { data: guestProfile } = await serviceClient
      .from("guest_profiles")
      .select("guest_id, email, full_name, visit_count, last_seen_at")
      .eq("guest_id", guestId)
      .maybeSingle();
    if (guestProfile) {
      toEmail = toEmail || guestProfile.email || "";
      recipientName = recipientName || guestProfile.full_name || "";
      visitCount = guestProfile.visit_count ?? null;
      lastSeenAt = guestProfile.last_seen_at ?? null;
    } else {
      const { data: guestRow } = await serviceClient
        .from("guests")
        .select("id, email, full_name")
        .eq("id", guestId)
        .maybeSingle();
      if (guestRow) {
        toEmail = toEmail || guestRow.email || "";
        recipientName = recipientName || guestRow.full_name || "";
      }
    }
  }

  if (!toEmail) {
    return new Response(
      JSON.stringify({ error: "Recipient email could not be resolved." }),
      { status: 400, headers: corsHeaders },
    );
  }

  const tokens = {
    brand_logo_url: brandMap.logo || "",
    hero_image_url: brandMap.hero_default || "",
    footer_banner_url: brandMap.footer_banner || "",
    website_link: "https://www.thebatesfordhotel.com.au/",
    venue_address: "700 Ballarat Road, Batesford VIC 3213",
    booking_link: "https://www.thebatesfordhotel.com.au/",
    first_name:
      payload.mode === "test"
        ? getFirstName(recipientName || userData.user.email || null)
        : getFirstName(recipientName || null),
    visit_count: String(visitCount ?? 3),
    last_visit_date: toLocalDate(lastSeenAt, fallbackDate),
  };

  const subject = applyTokens(
    payload.subject_override?.trim() || template.subject,
    tokens,
  );
  const htmlBody = applyTokens(template.body_html, tokens);
  const textBody = applyTokens(template.body_text, tokens);

  const campaignName = `${template.name} - ${payload.mode === "test" ? "Test" : "Single"} - ${
    new Date().toLocaleDateString("en-AU")
  }`;

  const { data: campaign, error: campaignError } = await serviceClient
    .from("campaigns")
    .insert({
      name: campaignName,
      template_id: template.id,
      channel: "email",
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return new Response(
      JSON.stringify({ error: "Unable to create campaign." }),
      { status: 500, headers: corsHeaders },
    );
  }

  const sentAt = new Date().toISOString();
  const { data: run, error: runError } = await serviceClient
    .from("campaign_runs")
    .insert({
      campaign_id: campaign.id,
      sent_at: sentAt,
      recipient_count: 1,
      status: "sent",
      run_type: payload.mode === "test" ? "test" : "single",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return new Response(
      JSON.stringify({ error: "Unable to create campaign run." }),
      { status: 500, headers: corsHeaders },
    );
  }

  const { error: recipientError } = await serviceClient
    .from("campaign_recipients")
    .insert({
      campaign_run_id: run.id,
      guest_id: guestId,
      email: toEmail,
      sent_at: sentAt,
      recipient_type: payload.mode === "test" ? "test" : "guest",
      recipient_name: recipientName || null,
    });

  if (recipientError) {
    return new Response(
      JSON.stringify({ error: "Unable to create campaign recipient." }),
      { status: 500, headers: corsHeaders },
    );
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM");
  let simulated = false;

  if (resendKey && resendFrom) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [toEmail],
        subject,
        html: htmlBody,
        text: textBody,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      await serviceClient
        .from("campaign_runs")
        .update({ status: "failed" })
        .eq("id", run.id);
      return new Response(
        JSON.stringify({
          error: "Email send failed.",
          provider_status: res.status,
          provider_response: errorText,
        }),
        { status: 502, headers: corsHeaders },
      );
    }
  } else {
    simulated = true;
  }

  return new Response(
    JSON.stringify({
      success: true,
      run_id: run.id,
      to: toEmail,
      mode: payload.mode,
      simulated,
    }),
    { status: 200, headers: corsHeaders },
  );
});
