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

  const { data: existingAdmin, error: adminCheckError } = await serviceClient
    .from("admin_profiles")
    .select("id")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (adminCheckError) {
    return new Response(JSON.stringify({ error: "Unable to check admin status." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  if (existingAdmin) {
    return new Response(JSON.stringify({ ok: false, status: "already_exists" }), {
      status: 403,
      headers: corsHeaders
    });
  }

  const { error: insertError } = await serviceClient
    .from("admin_profiles")
    .insert({
      user_id: userData.user.id,
      email: userData.user.email,
      role: "admin",
      created_by: userData.user.id
    });

  if (insertError) {
    return new Response(JSON.stringify({ error: "Unable to bootstrap admin." }), {
      status: 500,
      headers: corsHeaders
    });
  }

  return new Response(JSON.stringify({ ok: true, status: "bootstrapped" }), {
    status: 200,
    headers: corsHeaders
  });
});