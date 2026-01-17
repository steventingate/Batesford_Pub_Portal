import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
};

const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
};

type InvitePayload = {
  email?: string;
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
      headers: corsHeaders
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("APP_URL");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !appUrl) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  let payload: InvitePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const email = payload.email?.trim().toLowerCase() ?? "";
  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "Valid email is required." }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: corsHeaders
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: adminRow, error: adminCheckError } = await serviceClient
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (adminCheckError || !adminRow) {
    return new Response(JSON.stringify({ error: "Admin access required." }), {
      status: 403,
      headers: corsHeaders
    });
  }

  const { data: invited, error: inviteError } = await serviceClient.auth.admin
    .inviteUserByEmail(email, { redirectTo: appUrl });

  if (inviteError || !invited?.user) {
    return new Response(JSON.stringify({ error: "Invite failed." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  const { error: upsertError } = await serviceClient
    .from("admin_profiles")
    .upsert(
      {
        user_id: invited.user.id,
        email,
        role: "admin",
        created_by: userData.user.id,
        revoked_at: null,
        revoked_by: null
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    return new Response(JSON.stringify({ error: "Unable to grant admin." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  return new Response(JSON.stringify({ ok: true, user_id: invited.user.id }), {
    status: 200,
    headers: corsHeaders
  });
});