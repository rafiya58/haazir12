ALTER TABLE public.vendor_applications
  DROP CONSTRAINT IF EXISTS vendor_applications_status_check,
  ADD CONSTRAINT vendor_applications_status_check
    CHECK (status IN ('pending', 'approved_pending_acceptance', 'approved', 'rejected'));

CREATE TABLE public.vendor_invitation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.vendor_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id text NOT NULL REFERENCES public.universities(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivery_confirmed_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT vendor_invitation_tokens_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT vendor_invitation_tokens_terminal_state_check CHECK (
    accepted_at IS NULL OR revoked_at IS NULL
  ),
  CONSTRAINT vendor_invitation_tokens_delivery_check CHECK (
    accepted_at IS NULL OR delivery_confirmed_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX vendor_invitation_tokens_one_active_per_application
  ON public.vendor_invitation_tokens (application_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.vendor_invitation_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendor_invitation_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.vendor_invitation_tokens TO service_role;
GRANT UPDATE (delivery_confirmed_at, revoked_at) ON TABLE public.vendor_invitation_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.submit_vendor_application(
  _university_id text,
  _restaurant_name text,
  _contact_number text,
  _description text DEFAULT NULL,
  _cuisine text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _application_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _university_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.universities WHERE id = _university_id
  ) THEN
    RAISE EXCEPTION 'Select a supported campus';
  END IF;
  IF _restaurant_name IS NULL OR length(trim(_restaurant_name)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Business name must be between 2 and 100 characters';
  END IF;
  IF _contact_number IS NULL OR trim(_contact_number) !~ '^\+?[0-9][0-9 ()-]{6,23}$' THEN
    RAISE EXCEPTION 'Enter a valid contact number';
  END IF;
  IF length(coalesce(_description, '')) > 1000 OR length(coalesce(_cuisine, '')) > 100 THEN
    RAISE EXCEPTION 'Business description or type is too long';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'vendor'
  ) THEN
    RAISE EXCEPTION 'This account already has an approved vendor role';
  END IF;

  INSERT INTO public.vendor_applications (
    user_id, university_id, restaurant_name, contact_number, description, cuisine, status,
    review_note, reviewed_by, reviewed_at, updated_at
  )
  VALUES (
    _user_id, _university_id, trim(_restaurant_name), trim(_contact_number),
    NULLIF(trim(_description), ''), NULLIF(trim(_cuisine), ''), 'pending',
    NULL, NULL, NULL, now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET university_id = EXCLUDED.university_id,
        restaurant_name = EXCLUDED.restaurant_name,
        contact_number = EXCLUDED.contact_number,
        description = EXCLUDED.description,
        cuisine = EXCLUDED.cuisine,
        status = 'pending',
        review_note = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at = now()
    WHERE public.vendor_applications.status IN ('pending', 'rejected')
  RETURNING id INTO _application_id;

  IF _application_id IS NULL THEN
    RAISE EXCEPTION 'A vendor application cannot be resubmitted after approval';
  END IF;
  RETURN _application_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_vendor_application(
  _application_id uuid,
  _decision text,
  _review_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  _application public.vendor_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR _decision IS NULL OR _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid application review';
  END IF;

  SELECT * INTO _application
  FROM public.vendor_applications
  WHERE id = _application_id
  FOR UPDATE;

  IF NOT FOUND OR _application.status <> 'pending' THEN
    RAISE EXCEPTION 'Pending vendor application not found';
  END IF;

  IF NOT public.has_role(auth.uid(), 'platform_admin')
     AND NOT public.has_university_role(auth.uid(), _application.university_id, 'campus_admin') THEN
    RAISE EXCEPTION 'You are not allowed to review this university application';
  END IF;

  IF _decision = 'approve' THEN
    UPDATE public.vendor_applications
    SET status = 'approved_pending_acceptance', review_note = NULLIF(trim(_review_note), ''),
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = _application.id;
  ELSE
    UPDATE public.vendor_applications
    SET status = 'rejected', review_note = NULLIF(trim(_review_note), ''),
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = _application.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_vendor_invitation(
  _application_id uuid,
  _token_hash text,
  _expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  _application public.vendor_applications%ROWTYPE;
  _invitation_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted invitation service can issue vendor invitations';
  END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'A lowercase SHA-256 token hash is required';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Invitation expiry must be in the future';
  END IF;

  SELECT * INTO _application
  FROM public.vendor_applications
  WHERE id = _application_id
  FOR UPDATE;

  IF NOT FOUND OR _application.status <> 'approved_pending_acceptance' THEN
    RAISE EXCEPTION 'Application is not awaiting vendor invitation acceptance';
  END IF;

  UPDATE public.vendor_invitation_tokens
  SET revoked_at = clock_timestamp()
  WHERE application_id = _application.id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  INSERT INTO public.vendor_invitation_tokens (
    application_id, user_id, university_id, token_hash, expires_at
  )
  VALUES (
    _application.id, _application.user_id, _application.university_id, _token_hash, _expires_at
  )
  RETURNING id INTO _invitation_id;

  RETURN _invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_vendor_invitation(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vendor_invitation(uuid, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_vendor_invitation(_token_hash text)
RETURNS TABLE (application_id uuid, restaurant_id uuid, university_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  _application public.vendor_applications%ROWTYPE;
  _invitation public.vendor_invitation_tokens%ROWTYPE;
  _application_id uuid;
  _restaurant_id uuid;
  _slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid vendor invitation';
  END IF;

  SELECT token.application_id INTO _application_id
  FROM public.vendor_invitation_tokens AS token
  WHERE token.token_hash = _token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired vendor invitation';
  END IF;

  SELECT * INTO _application
  FROM public.vendor_applications
  WHERE id = _application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor application no longer exists';
  END IF;

  SELECT * INTO _invitation
  FROM public.vendor_invitation_tokens
  WHERE token_hash = _token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired vendor invitation';
  END IF;
  IF _invitation.user_id <> auth.uid() OR _application.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This vendor invitation belongs to another account';
  END IF;
  IF _invitation.university_id <> _application.university_id THEN
    RAISE EXCEPTION 'Vendor invitation campus does not match the application';
  END IF;

  IF _invitation.accepted_at IS NOT NULL THEN
    IF _application.status <> 'approved' THEN
      RAISE EXCEPTION 'Previously accepted invitation has an inconsistent application status';
    END IF;

    SELECT role.restaurant_id INTO _restaurant_id
    FROM public.user_roles AS role
    WHERE role.user_id = auth.uid()
      AND role.role = 'vendor'
      AND role.university_id = _application.university_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invitation was accepted but the vendor role is unavailable';
    END IF;

    RETURN QUERY
    SELECT _application.id, _restaurant_id, _application.university_id;
    RETURN;
  END IF;

  IF _invitation.revoked_at IS NOT NULL
     OR _invitation.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid, expired, or revoked vendor invitation';
  END IF;
  IF _application.status <> 'approved_pending_acceptance' THEN
    RAISE EXCEPTION 'Vendor application is not awaiting acceptance';
  END IF;
  IF _invitation.delivery_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Vendor invitation delivery is not confirmed yet';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'vendor'
  ) THEN
    RAISE EXCEPTION 'This account already has a vendor role';
  END IF;

  _slug := trim(both '-' from regexp_replace(lower(_application.restaurant_name), '[^a-z0-9]+', '-', 'g'));
  IF _slug = '' THEN
    _slug := 'vendor';
  END IF;
  _slug := left(_slug, 80) || '-' || _application.id::text;

  INSERT INTO public.restaurants (name, slug, description, cuisine, university_id)
  VALUES (
    _application.restaurant_name, _slug, _application.description,
    _application.cuisine, _application.university_id
  )
  RETURNING id INTO _restaurant_id;

  INSERT INTO public.user_roles (user_id, role, restaurant_id, university_id)
  VALUES (auth.uid(), 'vendor', _restaurant_id, _application.university_id);

  UPDATE public.vendor_invitation_tokens
  SET accepted_at = clock_timestamp()
  WHERE id = _invitation.id;

  UPDATE public.vendor_applications
  SET status = 'approved', updated_at = now()
  WHERE id = _application.id;

  RETURN QUERY
  SELECT _application.id, _restaurant_id, _application.university_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_vendor_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_vendor_invitation(text) TO authenticated;
