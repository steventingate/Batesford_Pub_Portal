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
  return html.replace(/<img\b[^>]*>/gi, (match) => {
    const srcMatch = match.match(/\bsrc\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))/i);
    if (!srcMatch) return "";
    const src = (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim();
    return src ? match : "";
  });
};

const applyTokens = (template: string, tokens: Record<string, string>) => {
  let result = template;
  Object.entries(tokens).forEach(([key, value]) => {
    result = result.split(`{{${key}}}`).join(value);
  });
  return stripEmptyImages(result);
};

const stripInlineImageTokens = (value: string) => {
  return value.replace(/\[\[image:[^\]]+\]\]/gi, "");
};

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const normalizeInlineTokenHtml = (value: string) => {
  return value
    .replace(/&amp;quot;|&amp;#34;/gi, "\"")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&amp;#91;|&amp;#93;/gi, (match) =>
      match.includes("91") ? "[" : "]",
    )
    .replace(/&amp;lbrack;|&amp;rbrack;/gi, (match) =>
      match.includes("lbrack") ? "[" : "]",
    )
    .replace(/&#91;|&lbrack;/gi, "[")
    .replace(/&#93;|&rbrack;/gi, "]");
};

const replaceInlineImageTokens = (
  html: string,
  resolveUrl: (path: string) => string,
) => {
  const normalizedHtml = normalizeInlineTokenHtml(html);
  return normalizedHtml.replace(/\[\[image:([^\]]+)\]\]/gi, (_match, attrs) => {
    const pathMatch = attrs.match(/path=(?:\"([^\"]+)\"|'([^']+)')/i);
    if (!pathMatch) return "";
    const altMatch = attrs.match(/alt=(?:\"([^\"]*)\"|'([^']*)')/i);
    const path = pathMatch[1] || pathMatch[2];
    const altText = altMatch ? (altMatch[1] || altMatch[2]) : "";
    const url = resolveUrl(path);
    if (!url) return "";
    const alt = escapeHtml(altText);
    return (
      `<br />` +
      `<img src="${url}" alt="${alt}" width="600" ` +
      `style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;margin:12px 0;" />` +
      `<br />`
    );
  });
};

type SocialLink = {
  label: string;
  url: string;
  iconUrl: string;
};

const buildSocialRow = (links: SocialLink[]) => {
  const active = links.filter((link) => /^https?:\/\//i.test(link.url));
  if (!active.length) return "";
  const items = active
    .map(
      (link) =>
        `<td style="padding:0 6px;">
          <a href="${link.url}" style="display:inline-block;">
            <img src="${link.iconUrl}" alt="${link.label}" width="28" height="28" style="display:block;border:0;" />
          </a>
        </td>`,
    )
    .join("");

  return `<tr>
        <td align="center" style="padding:16px 24px 8px;border-top:1px solid #efe6d8;background-color:#f9f6f0;">
          <p style="margin:0 0 8px;font-family:'Source Sans 3', Arial, sans-serif;font-size:13px;font-weight:600;color:#1f2a24;">
            Follow us
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              ${items}
            </tr>
          </table>
        </td>
      </tr>`;
};

const buildEmailShell = (
  bodyHtml: string,
  options: {
    logoUrl: string;
    heroUrl: string;
    footerUrl: string;
    footerText: string;
    socialLinks: SocialLink[];
  },
) => {
  const logoRow = options.logoUrl
    ? `<tr>
        <td style="padding:24px 24px 8px;">
          <img src="${options.logoUrl}" alt="Batesford Pub" width="180" style="display:block;max-width:180px;height:auto;border:0;" />
        </td>
      </tr>`
    : "";
  const heroRow = options.heroUrl
    ? `<tr>
        <td style="padding:0 24px 16px;">
          <img src="${options.heroUrl}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;" />
        </td>
      </tr>`
    : "";
  const footerImageRow = options.footerUrl
    ? `<tr>
        <td style="padding:16px 24px 0;">
          <img src="${options.footerUrl}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;" />
        </td>
      </tr>`
    : "";

  const socialRow = buildSocialRow(options.socialLinks);

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Batesford Pub</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f3ed;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f6f3ed;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6dfd3;">
            ${logoRow}
            ${heroRow}
            <tr>
              <td style="padding:0 24px 8px;font-family:'Source Sans 3', Arial, sans-serif;font-size:16px;line-height:24px;color:#1f2a24;">
                ${bodyHtml}
              </td>
            </tr>
            ${footerImageRow}
            ${socialRow}
            <tr>
              <td style="padding:12px 24px 24px;font-family:'Source Sans 3', Arial, sans-serif;font-size:12px;line-height:18px;color:#6b7a71;text-align:center;">
                ${options.footerText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

const defaultBookingLink = "https://www.thebatesfordhotel.com.au/";
const defaultVenueAddress = "700 Ballarat Road, Batesford VIC 3213";
const defaultWebsiteLink = "https://www.thebatesfordhotel.com.au/";
const defaultFacebookLink = "https://www.facebook.com/";
const defaultInstagramLink = "https://www.instagram.com/";
const defaultTiktokLink = "https://www.tiktok.com/";
const defaultXLink = "https://x.com/";
const defaultLinkedinLink = "https://www.linkedin.com/";

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
    .select(
      "id, name, subject, body_html, body_text, hero_image_path, footer_image_path, inline_images",
    )
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

  const { data: appSettings } = await serviceClient
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "booking_link",
      "venue_address",
      "website_link",
      "facebook_link",
      "instagram_link",
      "tiktok_link",
      "x_link",
      "linkedin_link",
      "facebook_enabled",
      "instagram_enabled",
      "tiktok_enabled",
      "x_enabled",
      "linkedin_enabled",
    ]);
  const appSettingsMap: Record<string, string> = {};
  (appSettings ?? []).forEach((row: { key: string; value: string }) => {
    appSettingsMap[row.key] = row.value;
  });
  const parseSettingBool = (value: string | undefined, fallback: boolean) => {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "false" || normalized === "0") return false;
    if (normalized === "true" || normalized === "1") return true;
    return fallback;
  };
  const resolvedSettings = {
    booking_link: appSettingsMap.booking_link ?? defaultBookingLink,
    venue_address: appSettingsMap.venue_address ?? defaultVenueAddress,
    website_link: appSettingsMap.website_link ?? defaultWebsiteLink,
    facebook_link: appSettingsMap.facebook_link ?? defaultFacebookLink,
    instagram_link: appSettingsMap.instagram_link ?? defaultInstagramLink,
    tiktok_link: appSettingsMap.tiktok_link ?? defaultTiktokLink,
    x_link: appSettingsMap.x_link ?? defaultXLink,
    linkedin_link: appSettingsMap.linkedin_link ?? defaultLinkedinLink,
    facebook_enabled: parseSettingBool(appSettingsMap.facebook_enabled, true),
    instagram_enabled: parseSettingBool(appSettingsMap.instagram_enabled, true),
    tiktok_enabled: parseSettingBool(appSettingsMap.tiktok_enabled, true),
    x_enabled: parseSettingBool(appSettingsMap.x_enabled, true),
    linkedin_enabled: parseSettingBool(appSettingsMap.linkedin_enabled, true),
  };

  const publicUrlCache = new Map<string, string>();
  const isAbsoluteUrl = (value: string) =>
    /^https?:\/\//i.test(value) || value.startsWith("data:");
  const resolveStorageUrl = (path: string) => {
    if (!path) return "";
    if (isAbsoluteUrl(path)) return path;
    if (publicUrlCache.has(path)) return publicUrlCache.get(path) ?? "";
    const { data } = serviceClient.storage.from("campaign-assets").getPublicUrl(
      path,
    );
    const url = data.publicUrl;
    publicUrlCache.set(path, url);
    return url;
  };

  const renderEmailHtml = (params: {
    subject: string;
    body_html: string;
    hero_image_path?: string | null;
    footer_image_path?: string | null;
    variables: Record<string, string>;
  }) => {
    const heroPath = params.hero_image_path ?? brandMap.hero_default ?? "";
    const footerPath = params.footer_image_path ?? brandMap.footer_banner ?? "";
    const logoUrl = resolveStorageUrl(brandMap.logo ?? "");
    const heroUrl = resolveStorageUrl(heroPath);
    const footerUrl = resolveStorageUrl(footerPath);

    const tokens = {
      ...params.variables,
      brand_logo_url: logoUrl,
      hero_image_url: heroUrl,
      footer_banner_url: footerUrl,
    };

    const bodyWithInlineImages = replaceInlineImageTokens(
      params.body_html,
      resolveStorageUrl,
    );
    const hasLogoToken = params.body_html.includes("{{brand_logo_url}}");
    const hasHeroToken = params.body_html.includes("{{hero_image_url}}");
    const hasFooterToken = params.body_html.includes("{{footer_banner_url}}");
    const resolvedBody = applyTokens(bodyWithInlineImages, tokens);
    const footerText = applyTokens("{{venue_address}} | {{website_link}}", tokens);
    const socialLinks: SocialLink[] = [
      {
        label: "Facebook",
        url: tokens.facebook_link ?? "",
        iconUrl: "https://cdn.simpleicons.org/facebook/1a472a",
      },
      {
        label: "Instagram",
        url: tokens.instagram_link ?? "",
        iconUrl: "https://cdn.simpleicons.org/instagram/1a472a",
      },
      {
        label: "TikTok",
        url: tokens.tiktok_link ?? "",
        iconUrl: "https://cdn.simpleicons.org/tiktok/1a472a",
      },
      {
        label: "X",
        url: tokens.x_link ?? "",
        iconUrl: "https://cdn.simpleicons.org/x/1a472a",
      },
      {
        label: "LinkedIn",
        url: tokens.linkedin_link ?? "",
        iconUrl: "https://cdn.simpleicons.org/linkedin/1a472a",
      },
    ];

    return {
      subject: applyTokens(params.subject, tokens),
      html: buildEmailShell(resolvedBody, {
        logoUrl: hasLogoToken ? "" : logoUrl,
        heroUrl: hasHeroToken ? "" : heroUrl,
        footerUrl: hasFooterToken ? "" : footerUrl,
        footerText,
        socialLinks,
      }),
    };
  };

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

  const variables = {
    website_link: resolvedSettings.website_link,
    venue_address: resolvedSettings.venue_address,
    booking_link: resolvedSettings.booking_link,
    facebook_link: resolvedSettings.facebook_enabled ? resolvedSettings.facebook_link : "",
    instagram_link: resolvedSettings.instagram_enabled ? resolvedSettings.instagram_link : "",
    tiktok_link: resolvedSettings.tiktok_enabled ? resolvedSettings.tiktok_link : "",
    x_link: resolvedSettings.x_enabled ? resolvedSettings.x_link : "",
    linkedin_link: resolvedSettings.linkedin_enabled ? resolvedSettings.linkedin_link : "",
    first_name:
      payload.mode === "test"
        ? getFirstName(recipientName || userData.user.email || null)
        : getFirstName(recipientName || null),
    visit_count: String(visitCount ?? 3),
    last_visit_date: toLocalDate(lastSeenAt, fallbackDate),
  };

  const rendered = renderEmailHtml({
    subject: payload.subject_override?.trim() || template.subject,
    body_html: template.body_html,
    hero_image_path: template.hero_image_path ?? null,
    footer_image_path: template.footer_image_path ?? null,
    variables,
  });
  const brandTokenUrls = {
    brand_logo_url: resolveStorageUrl(brandMap.logo ?? ""),
    hero_image_url: resolveStorageUrl(
      template.hero_image_path ?? brandMap.hero_default ?? "",
    ),
    footer_banner_url: resolveStorageUrl(
      template.footer_image_path ?? brandMap.footer_banner ?? "",
    ),
  };
  const subject = rendered.subject;
  const htmlBody = rendered.html;
  const textBody = applyTokens(
    stripInlineImageTokens(template.body_text),
    { ...variables, ...brandTokenUrls },
  );

  const campaignName = `${template.name} - ${payload.mode === "test" ? "Test" : "Single"} - ${
    new Date().toLocaleDateString("en-AU")
  }`;
  const resolvedHeroPath = template.hero_image_path ?? brandMap.hero_default ?? null;
  const resolvedFooterPath =
    template.footer_image_path ?? brandMap.footer_banner ?? null;
  const inlineImages = template.inline_images ?? [];

  const { data: campaign, error: campaignError } = await serviceClient
    .from("campaigns")
    .insert({
      name: campaignName,
      template_id: template.id,
      channel: "email",
      hero_image_path: resolvedHeroPath,
      footer_image_path: resolvedFooterPath,
      inline_images: inlineImages,
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
