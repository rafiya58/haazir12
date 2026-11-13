import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: corsHeaders });

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactRegex = /^\+?[0-9][0-9 ()-]{6,23}$/;
const userPageSize = 1000;

const emailAlreadyRegistered = async (adminClient: ReturnType<typeof createClient>, email: string) => {
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: userPageSize });
    if (error) throw error;
    if (data.users.some((user) => user.email?.toLowerCase() === email)) return true;
    if (data.users.length < userPageSize) return false;
  }
};

const restaurantNameAlreadyExists = async (
  adminClient: ReturnType<typeof createClient>,
  universityId: string,
  restaurantName: string,
) => {
  for (let offset = 0; ; offset += userPageSize) {
    const { data, error } = await adminClient
      .from("restaurants")
      .select("id,name")
      .eq("university_id", universityId)
      .order("id")
      .range(offset, offset + userPageSize - 1);
    if (error) throw error;
    if (!data) throw new Error("Restaurant name lookup returned no data");
    if (data.some((restaurant) => restaurant.name.toLowerCase() === restaurantName.toLowerCase())) return true;
    if (data.length < userPageSize) return false;
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonError("Authentication required", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrlValue = Deno.env.get("SITE_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !siteUrlValue) {
    console.error("[invite-campus-vendor] Required Supabase environment configuration is missing");
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

  let body: {
    university_id?: unknown;
    full_name?: unknown;
    email?: unknown;
    restaurant_name?: unknown;
    contact_number?: unknown;
    description?: unknown;
    cuisine?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const universityId = typeof body.university_id === "string" ? body.university_id : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const restaurantName = typeof body.restaurant_name === "string" ? body.restaurant_name.trim() : "";
  const contactNumber = typeof body.contact_number === "string" ? body.contact_number.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const cuisine = typeof body.cuisine === "string" ? body.cuisine.trim() : "";

  if (!universityId) return jsonError("Select a campus", 400);
  if (fullName.length < 2 || fullName.length > 80) return jsonError("Vendor name must be between 2 and 80 characters", 400);
  if (!emailRegex.test(email) || email.length > 255) return jsonError("Enter a valid vendor email address", 400);
  if (restaurantName.length < 2 || restaurantName.length > 100) return jsonError("Business name must be between 2 and 100 characters", 400);
  if (!contactRegex.test(contactNumber)) return jsonError("Enter a valid contact number", 400);
  if (description.length < 10 || description.length > 1000) return jsonError("Business description must be between 10 and 1000 characters", 400);
  if (cuisine.length > 100) return jsonError("Cuisine or business type must be at most 100 characters", 400);

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(bearer);
  if (callerError || !caller) return jsonError("Invalid session", 401);

  const { data: campusRole, error: campusRoleError } = await adminClient
    .from("user_roles")
    .select("user_id,university_id")
    .eq("user_id", caller.id)
    .eq("role", "campus_admin")
    .eq("university_id", universityId)
    .maybeSingle();

  if (campusRoleError) {
    console.error("[invite-campus-vendor] Campus Admin role lookup failed:", campusRoleError.message);
    return jsonError("Unable to verify Campus Admin permissions", 500);
  }
  if (!campusRole) return jsonError("You can only invite vendors for a campus you administer", 403);

  try {
    if (await restaurantNameAlreadyExists(adminClient, campusRole.university_id, restaurantName)) {
      return jsonError("A restaurant with this name already exists at this campus", 409);
    }
  } catch (error) {
    console.error("[invite-campus-vendor] Restaurant name lookup failed:", error instanceof Error ? error.message : "Unknown error");
    return jsonError("Unable to check whether this business name is already in use", 500);
  }

  try {
    if (await emailAlreadyRegistered(adminClient, email)) {
      return jsonError("This email already has a Haazir account. Ask the user to sign in and use the existing-user vendor application flow.", 409);
    }
  } catch (error) {
    console.error("[invite-campus-vendor] Existing Auth account check failed:", error instanceof Error ? error.message : "Unknown error");
    return jsonError("Unable to verify whether this email already has an account", 500);
  }

  const redirectTo = `${siteOrigin}/set-vendor-password`;
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      account_type: "direct_vendor_invitation",
      full_name: fullName,
      requires_password_setup: true,
    },
  });

  if (inviteError || !inviteData.user) {
    console.error("[invite-campus-vendor] Auth invitation failed:", inviteError?.message ?? "No user returned");
    return jsonError(inviteError?.message ?? "Unable to create the vendor invitation", 400);
  }

  const { error: recordError } = await adminClient.rpc("create_direct_vendor_invitation", {
    _user_id: inviteData.user.id,
    _email: email,
    _full_name: fullName,
    _university_id: campusRole.university_id,
    _restaurant_name: restaurantName,
    _contact_number: contactNumber,
    _description: description,
    _cuisine: cuisine,
    _invited_by: caller.id,
  });

  if (recordError) {
    console.error("[invite-campus-vendor] Could not store vendor setup details:", recordError.message);
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
    if (rollbackError) {
      console.error("[invite-campus-vendor] Could not remove the newly invited user after setup storage failed:", rollbackError.message);
      return jsonError("Invitation was sent, but vendor setup could not be stored and the new account could not be rolled back. Contact support.", 500);
    }
    return jsonError("Vendor setup could not be stored; the newly created Auth account was rolled back", 500);
  }

  return Response.json(
    { invited: true, invited_email: email, university_id: campusRole.university_id },
    { status: 200, headers: corsHeaders },
  );
});
