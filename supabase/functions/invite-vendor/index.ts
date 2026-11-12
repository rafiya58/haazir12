import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: corsHeaders });

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonError("Authentication required", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  const senderName = Deno.env.get("BREVO_SENDER_NAME");
  const siteUrlValue = Deno.env.get("SITE_URL");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !brevoApiKey || !senderEmail || !senderName || !siteUrlValue) {
    console.error("[invite-vendor] Required environment configuration is missing");
    return jsonError("Vendor invitation service is not configured", 500);
  }

  let siteOrigin: string;
  try {
    const siteUrl = new URL(siteUrlValue);
    if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") {
      return jsonError("SITE_URL must use HTTPS", 500);
    }
    siteOrigin = siteUrl.origin;
  } catch {
    return jsonError("SITE_URL is invalid", 500);
  }

  let body: { application_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const applicationId = typeof body.application_id === "string" ? body.application_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
    return jsonError("A valid application_id is required", 400);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(bearer);
  if (callerError || !caller) return jsonError("Invalid session", 401);

  const { data: application, error: applicationError } = await adminClient
    .from("vendor_applications")
    .select("id,user_id,university_id,restaurant_name,status")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    console.error("[invite-vendor] Could not load vendor application:", applicationError.message);
    return jsonError("Unable to verify the vendor application", 500);
  }
  if (!application) return jsonError("Vendor application not found", 404);

  const { data: platformRole, error: platformRoleError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", caller.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  if (platformRoleError) {
    console.error("[invite-vendor] Could not verify Platform Admin role:", platformRoleError.message);
    return jsonError("Unable to verify invitation permission", 500);
  }

  let campusRole = null;
  if (!platformRole) {
    const result = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", caller.id)
      .eq("role", "campus_admin")
      .eq("university_id", application.university_id)
      .maybeSingle();
    campusRole = result.data;
    if (result.error) {
      console.error("[invite-vendor] Could not verify campus role:", result.error.message);
      return jsonError("Unable to verify invitation permission", 500);
    }
  }

  if (!platformRole && !campusRole) {
    return jsonError("Only this campus admin or a Platform Admin can invite the applicant", 403);
  }
  if (application.status !== "approved_pending_acceptance") {
    return jsonError("The application is not approved and awaiting acceptance", 409);
  }

  const { data: { user: applicant }, error: applicantError } = await adminClient.auth.admin.getUserById(application.user_id);
  if (applicantError || !applicant?.email) {
    console.error("[invite-vendor] Could not resolve the applicant's registered Auth email:", applicantError?.message ?? "Email is missing");
    return jsonError("The applicant's registered email is unavailable", 409);
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = toHex(tokenBytes);
  const tokenDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const tokenHash = toHex(new Uint8Array(tokenDigest));
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const revokeToken = async () => {
    try {
      const { data, error } = await adminClient
        .from("vendor_invitation_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", tokenHash)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("id");

      if (error) {
        console.error("[invite-vendor] Invitation token revocation failed:", error.message);
        return false;
      }
      if (data?.length) return true;

      const { data: existingToken, error: checkError } = await adminClient
        .from("vendor_invitation_tokens")
        .select("accepted_at,revoked_at,expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (checkError) {
        console.error("[invite-vendor] Could not confirm invitation token revocation:", checkError.message);
        return false;
      }
      return !existingToken
        || existingToken.accepted_at !== null
        || existingToken.revoked_at !== null
        || new Date(existingToken.expires_at).getTime() <= Date.now();
    } catch {
      console.error("[invite-vendor] Could not confirm invitation token revocation after an unexpected error");
      return false;
    }
  };

  let invitationId: string | null = null;
  try {
    const { data, error } = await adminClient.rpc("issue_vendor_invitation", {
      _application_id: application.id,
      _token_hash: tokenHash,
      _expires_at: expiresAt,
    });
    if (error) {
      console.error("[invite-vendor] Could not issue vendor invitation:", error.message);
    } else if (typeof data === "string") {
      invitationId = data;
    } else {
      console.error("[invite-vendor] Invitation issuance returned no invitation ID");
    }
  } catch {
    console.error("[invite-vendor] Invitation issuance threw an unexpected exception");
  }

  if (!invitationId) {
    const revoked = await revokeToken();
    return jsonError(
      revoked
        ? "Unable to prepare the invitation email"
        : "Unable to prepare the invitation and could not confirm token revocation; administrator action is required",
      500,
    );
  }

  const invitationUrl = new URL("/join-vendor", siteOrigin);
  invitationUrl.searchParams.set("token", rawToken);
  const safeBusinessName = escapeHtml(application.restaurant_name);
  const safeInvitationUrl = escapeHtml(invitationUrl.toString());
  const expiryLabel = new Date(expiresAt).toUTCString();

  try {
    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: applicant.email }],
        subject: "Join your campus as a Haazir vendor",
        htmlContent: `<h2>Your vendor application was approved</h2><p>Your application for ${safeBusinessName} was approved by your campus admin.</p><p><a href="${safeInvitationUrl}">Join as Vendor</a></p><p>This secure link expires on ${expiryLabel} and can only be used once. Sign in to your existing Haazir account to accept.</p><p>If you were not expecting this email, you can ignore it.</p>`,
        textContent: `Your application for ${application.restaurant_name} was approved. Join as Vendor using this one-time link: ${invitationUrl.toString()} This link expires on ${expiryLabel}. Sign in to your existing Haazir account to accept.`,
      }),
    });

    if (!emailResponse.ok) {
      const revoked = await revokeToken();
      console.error("[invite-vendor] Brevo email request failed", { status: emailResponse.status });
      return jsonError(
        revoked
          ? "Brevo could not send the invitation email; the invitation link has been revoked"
          : "Brevo could not send the invitation and token revocation could not be confirmed; administrator action is required",
        502,
      );
    }
  } catch {
    const revoked = await revokeToken();
    console.error("[invite-vendor] Brevo email request threw an exception");
    return jsonError(
      revoked
        ? "The invitation email could not be sent; the invitation link has been revoked"
        : "The invitation email could not be sent and token revocation could not be confirmed; administrator action is required",
      502,
    );
  }

  let deliveryConfirmationError: string | null = null;
  let deliveryConfirmed = false;
  try {
    const { data: confirmedToken, error: confirmationError } = await adminClient
      .from("vendor_invitation_tokens")
      .update({ delivery_confirmed_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .is("delivery_confirmed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (confirmationError) {
      deliveryConfirmationError = confirmationError.message;
    } else if (confirmedToken) {
      deliveryConfirmed = true;
    } else {
      deliveryConfirmationError = "Invitation is no longer active";
    }
  } catch (error) {
    deliveryConfirmationError = error instanceof Error ? error.message : "Unexpected delivery confirmation error";
  }

  if (!deliveryConfirmed) {
    const revoked = await revokeToken();
    console.error("[invite-vendor] Could not confirm invitation delivery", {
      reason: deliveryConfirmationError,
      tokenRevoked: revoked,
    });
    return jsonError(
      "Brevo accepted the email request, but the invitation could not be activated. The link remains unusable unless delivery is confirmed. Ask an administrator to resend it.",
      502,
    );
  }

  console.info("[invite-vendor] Vendor invitation email sent", {
    applicationId: application.id,
    userId: application.user_id,
    invitationId,
    expiresAt,
  });
  return Response.json(
    { application_id: application.id, invitation_sent: true, expires_at: expiresAt },
    { status: 200, headers: corsHeaders },
  );
});
