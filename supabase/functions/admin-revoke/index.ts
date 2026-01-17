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

type RevokePayload = {
  target_user_id?: string;
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
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  let payload: RevokePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const targetUserId = payload.target_user_id?.trim() ?? "";
  if (!targetUserId) {
    return new Response(JSON.stringify({ error: "target_user_id is required." }), {
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

  if (userData.user.id === targetUserId) {
    return new Response(JSON.stringify({ error: "Cannot revoke your own access." }), {
      status: 400,
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

  const { data: updated, error: updateError } = await serviceClient
    .from("admin_profiles")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: userData.user.id
    })
    .eq("user_id", targetUserId)
    .is("revoked_at", null)
    .select("user_id")
    .maybeSingle();

  if (updateError) {
    return new Response(JSON.stringify({ error: "Unable to revoke admin." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  if (!updated) {
    return new Response(JSON.stringify({ ok: true, status: "already_revoked" }), {
      status: 200,
      headers: corsHeaders
    });
  }

  return new Response(JSON.stringify({ ok: true, status: "revoked" }), {
    status: 200,
    headers: corsHeaders
  });
});