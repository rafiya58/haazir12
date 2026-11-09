import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer (.+)$/i);
  if (!match) {
    return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Campus admin invite function is missing required Supabase environment variables.");
    return Response.json({ error: "Invite service is not configured" }, { status: 500, headers: corsHeaders });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(match[1]);
  if (callerError || !caller) {
    return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
  }

  const { data: platformRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", caller.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  if (roleError) {
    console.error("Could not verify platform admin role:", roleError.message);
    return Response.json({ error: "Unable to verify invite permission" }, { status: 500, headers: corsHeaders });
  }
  if (!platformRole) {
    return Response.json({ error: "Only platform admins can invite university admins" }, { status: 403, headers: corsHeaders });
  }

  let body: { email?: unknown; university_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const universityId = body.university_id;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400, headers: corsHeaders });
  }
  if (universityId !== "iba" && universityId !== "habib") {
    return Response.json({ error: "Select a supported university" }, { status: 400, headers: corsHeaders });
  }

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      account_type: "campus_admin",
      university_id: universityId,
      requires_password_setup: true,
    },
  });
  if (inviteError || !inviteData.user) {
    console.error("Campus admin invitation failed:", inviteError?.message ?? "No invited user returned");
    return Response.json(
      { error: inviteError?.message ?? "Unable to create the invitation" },
      { status: 400, headers: corsHeaders },
    );
  }

  const { error: assignmentError } = await adminClient.from("user_roles").insert({
    user_id: inviteData.user.id,
    role: "campus_admin",
    university_id: universityId,
  });
  if (assignmentError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
    if (rollbackError) {
      console.error("Could not remove incomplete campus admin invitation:", rollbackError.message);
    }
    console.error("Could not assign campus admin role:", assignmentError.message);
    return Response.json({ error: "Invitation could not be assigned to the university" }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ invited: true }, { status: 200, headers: corsHeaders });
});
