import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: corsHeaders });

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const describeError = (error: unknown) => {
  const fields = ["name", "message", "status", "code", "details", "hint", "error_description", "error_code"];
  const source = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  const description: Record<string, string | number | boolean> = {};

  for (const field of fields) {
    const value = source[field];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      description[field] = value;
    }
  }
  if (Object.keys(description).length === 0) {
    description.message = typeof error === "string" ? error : "Unknown error";
  }
  return description;
};

const logFailure = (operation: string, error: unknown) => {
  console.error(`[invite-campus-admin] ${operation} failed`, describeError(error));
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const configuredSiteUrl = Deno.env.get("SITE_URL");
  console.info("[invite-campus-admin] Function started", {
    method: request.method,
    origin,
    configuredSiteUrl: configuredSiteUrl ?? null,
  });

  if (request.method === "OPTIONS") {
    console.info("[invite-campus-admin] CORS preflight handled");
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    logFailure("Request method validation", `Unsupported method: ${request.method}`);
    return jsonError("Method not allowed", 405);
  }

  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    logFailure("Authentication header validation", "Bearer authorization header was missing or malformed");
    return jsonError("Authentication required", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    const missingVariables = [
      !supabaseUrl && "SUPABASE_URL",
      !anonKey && "SUPABASE_ANON_KEY",
      !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    logFailure("Supabase environment validation", `Missing variables: ${missingVariables.join(", ")}`);
    return jsonError("Invite service is not configured", 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.info("[invite-campus-admin] Platform Admin authentication verification starting");
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(match[1]);
  if (callerError || !caller) {
    logFailure("Platform Admin authentication verification", callerError ?? "Supabase returned no authenticated user");
    return jsonError("Invalid session", 401);
  }
  console.info("[invite-campus-admin] Platform Admin authentication verification succeeded", { callerId: caller.id });

  console.info("[invite-campus-admin] Platform Admin role verification starting", { callerId: caller.id });
  const { data: platformRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", caller.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  if (roleError) {
    logFailure("Platform Admin role verification", roleError);
    return jsonError("Unable to verify invite permission", 500);
  }
  if (!platformRole) {
    logFailure("Platform Admin role verification", "No platform_admin role found for caller");
    return jsonError("Only platform admins can onboard campuses", 403);
  }
  console.info("[invite-campus-admin] Platform Admin role verification succeeded", { callerId: caller.id });

  let body: {
    campus_name?: unknown;
    email_domain?: unknown;
    location?: unknown;
    contact_email?: unknown;
    admin_email?: unknown;
  };
  console.info("[invite-campus-admin] Request body parsing and validation starting");
  try {
    body = await request.json();
  } catch (error) {
    logFailure("Request body parsing", error);
    return jsonError("Invalid request body", 400);
  }

  const campusName = typeof body.campus_name === "string" ? body.campus_name.trim() : "";
  const emailDomain = typeof body.email_domain === "string" ? body.email_domain.trim().toLowerCase() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const contactEmail = typeof body.contact_email === "string" ? body.contact_email.trim().toLowerCase() : "";
  const adminEmail = typeof body.admin_email === "string" ? body.admin_email.trim().toLowerCase() : "";

  if (campusName.length < 2 || campusName.length > 100) {
    logFailure("Request body validation", "campus_name must be between 2 and 100 characters");
    return jsonError("Campus name must be between 2 and 100 characters", 400);
  }
  if (location.length > 200) {
    logFailure("Request body validation", "location must be at most 200 characters");
    return jsonError("Campus location must be at most 200 characters", 400);
  }
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(emailDomain) || emailDomain.length > 255) {
    logFailure("Request body validation", "email_domain must be a valid domain of at most 255 characters");
    return jsonError("Enter a valid student email domain", 400);
  }
  if (!emailRegex.test(adminEmail) || adminEmail.length > 255) {
    logFailure("Request body validation", "admin_email must be a valid email address of at most 255 characters");
    return jsonError("Enter a valid campus admin email address", 400);
  }
  if (contactEmail && (!emailRegex.test(contactEmail) || contactEmail.length > 255)) {
    logFailure("Request body validation", "contact_email must be a valid email address of at most 255 characters");
    return jsonError("Enter a valid campus contact email address", 400);
  }
  console.info("[invite-campus-admin] Request body validation succeeded", {
    campusNameLength: campusName.length,
    emailDomain,
    hasLocation: Boolean(location),
    hasContactEmail: Boolean(contactEmail),
    hasAdminEmail: Boolean(adminEmail),
  });

  const campusSlug = campusName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+$/g, "");
  if (!campusSlug) {
    logFailure("Campus name normalization", "campus_name produced an empty slug");
    return jsonError("Campus name must include letters or numbers", 400);
  }
  const campusId = `${campusSlug.slice(0, 55)}-${crypto.randomUUID().slice(0, 8)}`;

  console.info("[invite-campus-admin] University creation starting", { campusId });
  console.info("[invite-campus-admin] Generated university ID", { campusId });
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
    logFailure("University creation", campusError ?? "Supabase returned no created university");
    return jsonError(
      campusError?.code === "23505"
        ? "A campus with this name or email domain already exists"
        : campusError?.message ?? "Unable to create the campus",
      campusError?.code === "23505" ? 409 : 400,
    );
  }
  console.info("[invite-campus-admin] University creation succeeded", { universityId: campus.id });

  const siteUrl = configuredSiteUrl ?? origin ?? supabaseUrl;
  const redirectTo = `${siteUrl.replace(/\/+$/, "")}/set-password`;
  console.info("[invite-campus-admin] Invitation API call starting", {
    universityId: campus.id,
    adminEmailDomain: adminEmail.split("@")[1] ?? null,
    redirectTo,
  });
  type InviteResult = Awaited<ReturnType<typeof adminClient.auth.admin.inviteUserByEmail>>;
  let inviteResult: InviteResult;
  try {
    inviteResult = await adminClient.auth.admin.inviteUserByEmail(adminEmail, {
      redirectTo,
      data: {
        account_type: "campus_admin",
        university_id: campus.id,
        requires_password_setup: true,
      },
    });
  } catch (error) {
    logFailure("Campus Admin invitation API exception", error);
    const { error: cleanupError } = await adminClient.from("universities").delete().eq("id", campus.id);
    if (cleanupError) logFailure("University cleanup after invitation exception", cleanupError);
    else console.info("[invite-campus-admin] University removed after invitation exception", { universityId: campus.id });
    return jsonError("Unable to send the invitation email", 500);
  }
  const { data: inviteData, error: inviteError } = inviteResult;
  console.info("[invite-campus-admin] Invitation API call returned", {
    userId: inviteData.user?.id ?? null,
    error: inviteError ? describeError(inviteError) : null,
  });
  if (inviteError || !inviteData.user) {
    logFailure("Campus Admin invitation", inviteError ?? "Supabase returned no invited user");
    const { error: cleanupError } = await adminClient.from("universities").delete().eq("id", campus.id);
    if (cleanupError) logFailure("University cleanup after invitation failure", cleanupError);
    else console.info("[invite-campus-admin] University removed after invitation failure", { universityId: campus.id });
    return jsonError(inviteError?.message ?? "Unable to send the invitation email", 400);
  }
  console.info("[invite-campus-admin] Campus Admin invitation succeeded", { userId: inviteData.user.id });

  console.info("[invite-campus-admin] Campus Admin role insertion starting", {
    userId: inviteData.user.id,
    universityId: campus.id,
  });
  const { error: assignmentError } = await adminClient.from("user_roles").insert({
    user_id: inviteData.user.id,
    role: "campus_admin",
    university_id: campus.id,
  });
  if (assignmentError) {
    logFailure("Campus Admin role insertion", assignmentError);
    console.info("[invite-campus-admin] Rolling back Campus Admin invitation", { userId: inviteData.user.id });
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
    if (rollbackError) logFailure("Invited user rollback", rollbackError);
    else console.info("[invite-campus-admin] Invited user rollback succeeded", { userId: inviteData.user.id });
    const { error: campusRollbackError } = await adminClient.from("universities").delete().eq("id", campus.id);
    if (campusRollbackError) logFailure("University rollback after role insertion failure", campusRollbackError);
    else console.info("[invite-campus-admin] University rollback succeeded", { universityId: campus.id });
    return jsonError("Invitation could not be assigned to the campus", 500);
  }
  console.info("[invite-campus-admin] Campus Admin role insertion succeeded", {
    userId: inviteData.user.id,
    universityId: campus.id,
  });

  return Response.json(
    { campus_id: campus.id },
    { status: 200, headers: corsHeaders },
  );
});
