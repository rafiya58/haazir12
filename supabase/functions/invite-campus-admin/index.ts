import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return jsonError("Authentication required", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Campus admin invite function is missing required Supabase environment variables.");
    return jsonError("Invite service is not configured", 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(match[1]);
  if (callerError || !caller) return jsonError("Invalid session", 401);

  const { data: platformRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", caller.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  if (roleError) {
    console.error("Could not verify platform admin role:", roleError.message);
    return jsonError("Unable to verify invite permission", 500);
  }
  if (!platformRole) return jsonError("Only platform admins can onboard campuses", 403);

  let body: {
    campus_name?: unknown;
    email_domain?: unknown;
    location?: unknown;
    contact_email?: unknown;
    admin_email?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const campusName = typeof body.campus_name === "string" ? body.campus_name.trim() : "";
  const emailDomain = typeof body.email_domain === "string" ? body.email_domain.trim().toLowerCase() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const contactEmail = typeof body.contact_email === "string" ? body.contact_email.trim().toLowerCase() : "";
  const adminEmail = typeof body.admin_email === "string" ? body.admin_email.trim().toLowerCase() : "";

  if (campusName.length < 2 || campusName.length > 100) {
    return jsonError("Campus name must be between 2 and 100 characters", 400);
  }
  if (location.length > 200) return jsonError("Campus location must be at most 200 characters", 400);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(emailDomain) || emailDomain.length > 255) {
    return jsonError("Enter a valid student email domain", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 255) {
    return jsonError("Enter a valid campus admin email address", 400);
  }
  if (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 255)) {
    return jsonError("Enter a valid campus contact email address", 400);
  }

  const campusSlug = campusName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+$/g, "");
  if (!campusSlug) return jsonError("Campus name must include letters or numbers", 400);
  const campusId = `${campusSlug.slice(0, 55)}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: campus, error: campusError } = await adminClient
    .from("universities")
    .insert({
      id: campusId,
      name: campusName,
      email_domain: emailDomain,
      location: location || null,
      contact_email: contactEmail || null,
    })
    .select("id")
    .single();
  if (campusError || !campus) {
    return jsonError(
      campusError?.code === "23505"
        ? "A campus with this name or email domain already exists"
        : campusError?.message ?? "Unable to create the campus",
      campusError?.code === "23505" ? 409 : 400,
    );
  }

  const siteUrl = Deno.env.get("SITE_URL") ?? request.headers.get("Origin") ?? supabaseUrl;
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: adminEmail,
    options: {
      redirectTo: `${siteUrl.replace(/\/+$/, "")}/`,
      data: {
        account_type: "campus_admin",
        university_id: campus.id,
        requires_password_setup: true,
      },
    },
  });
  if (inviteError || !inviteData.user || !inviteData.properties?.action_link) {
    const { error: cleanupError } = await adminClient.from("universities").delete().eq("id", campus.id);
    if (cleanupError) console.error("Could not remove campus after invitation creation failed:", cleanupError.message);
    console.error("Campus admin invitation link creation failed:", inviteError?.message ?? "No link returned");
    return jsonError(inviteError?.message ?? "Unable to create the invitation link", 400);
  }

  const { error: assignmentError } = await adminClient.from("user_roles").insert({
    user_id: inviteData.user.id,
    role: "campus_admin",
    university_id: campus.id,
  });
  if (assignmentError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
    if (rollbackError) console.error("Could not remove incomplete campus admin invitation:", rollbackError.message);
    const { error: campusRollbackError } = await adminClient.from("universities").delete().eq("id", campus.id);
    if (campusRollbackError) console.error("Could not remove campus after role assignment failed:", campusRollbackError.message);
    console.error("Could not assign campus admin role:", assignmentError.message);
    return jsonError("Invitation could not be assigned to the campus", 500);
  }

  return Response.json(
    { campus_id: campus.id, invite_url: inviteData.properties.action_link },
    { status: 200, headers: corsHeaders },
  );
});
