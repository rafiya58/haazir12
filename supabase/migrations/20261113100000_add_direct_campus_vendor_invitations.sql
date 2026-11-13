CREATE TABLE public.direct_vendor_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email)),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 80),
  university_id text NOT NULL REFERENCES public.universities(id),
  restaurant_name text NOT NULL CHECK (length(trim(restaurant_name)) BETWEEN 2 AND 100),
  contact_number text NOT NULL CHECK (trim(contact_number) ~ '^\+?[0-9][0-9 ()-]{6,23}$'),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  cuisine text CHECK (cuisine IS NULL OR length(cuisine) <= 100),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending_setup' CHECK (status IN ('pending_setup', 'completed')),
  restaurant_id uuid UNIQUE REFERENCES public.restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT direct_vendor_invitations_completion_state_check CHECK (
    (status = 'pending_setup' AND restaurant_id IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND restaurant_id IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX direct_vendor_invitations_unique_email
  ON public.direct_vendor_invitations (lower(email));
CREATE INDEX direct_vendor_invitations_university_status_idx
  ON public.direct_vendor_invitations (university_id, status, created_at);

ALTER TABLE public.direct_vendor_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.direct_vendor_invitations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_direct_vendor_invitation(
  _user_id uuid,
  _email text,
  _full_name text,
  _university_id text,
  _restaurant_name text,
  _contact_number text,
  _description text DEFAULT NULL,
  _cuisine text DEFAULT NULL,
  _invited_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  _invitation_id uuid;
  _auth_email text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted invitation service can create direct vendor invitations';
  END IF;
  IF _invited_by IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _invited_by
      AND role = 'campus_admin'
      AND university_id = _university_id
  ) THEN
    RAISE EXCEPTION 'Inviter is not a Campus Admin for this university';
  END IF;
  IF _email IS NULL OR _email <> lower(trim(_email)) OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A normalized valid email address is required';
  END IF;
  IF _full_name IS NULL OR length(trim(_full_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Vendor name must be between 2 and 80 characters';
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

  SELECT lower(u.email) INTO _auth_email
  FROM auth.users AS u
  WHERE u.id = _user_id;
  IF NOT FOUND OR _auth_email IS DISTINCT FROM _email THEN
    RAISE EXCEPTION 'Invited Auth user email does not match the requested email';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.restaurants AS restaurant
    WHERE restaurant.university_id = _university_id
      AND lower(restaurant.name) = lower(trim(_restaurant_name))
  ) THEN
    RAISE EXCEPTION 'A restaurant with this name already exists at this university';
  END IF;

  INSERT INTO public.direct_vendor_invitations (
    user_id, email, full_name, university_id, restaurant_name, contact_number,
    description, cuisine, invited_by
  )
  VALUES (
    _user_id, _email, trim(_full_name), _university_id, trim(_restaurant_name), trim(_contact_number),
    NULLIF(trim(_description), ''), NULLIF(trim(_cuisine), ''), _invited_by
  )
  RETURNING id INTO _invitation_id;

  RETURN _invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_vendor_invitation(uuid, text, text, text, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_vendor_invitation(uuid, text, text, text, text, text, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_direct_vendor_invitation()
RETURNS TABLE (invitation_id uuid, restaurant_id uuid, university_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  _invitation public.direct_vendor_invitations%ROWTYPE;
  _auth_email text;
  _email_confirmed_at timestamptz;
  _encrypted_password text;
  _slug text;
  _restaurant_id uuid;
  _constraint_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _invitation
  FROM public.direct_vendor_invitations AS invitation
  WHERE invitation.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No direct vendor invitation exists for this account';
  END IF;

  SELECT lower(u.email), u.email_confirmed_at, u.encrypted_password
  INTO _auth_email, _email_confirmed_at, _encrypted_password
  FROM auth.users AS u
  WHERE u.id = auth.uid();
  IF NOT FOUND OR _auth_email IS DISTINCT FROM _invitation.email THEN
    RAISE EXCEPTION 'Authenticated account does not match the invited email';
  END IF;
  IF _email_confirmed_at IS NULL OR coalesce(_encrypted_password, '') = '' THEN
    RAISE EXCEPTION 'Verify the invitation and set a password before completing vendor setup';
  END IF;

  IF _invitation.status = 'completed' THEN
    RETURN QUERY
    SELECT _invitation.id, _invitation.restaurant_id, _invitation.university_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles AS role
    WHERE role.user_id = auth.uid() AND role.role = 'vendor'
  ) THEN
    RAISE EXCEPTION 'This account already has an assigned vendor role';
  END IF;

  _slug := trim(both '-' from regexp_replace(lower(_invitation.restaurant_name), '[^a-z0-9]+', '-', 'g'));
  IF _slug = '' THEN
    _slug := 'vendor';
  END IF;
  _slug := left(_slug, 80) || '-' || _invitation.id::text;

  IF EXISTS (
    SELECT 1 FROM public.restaurants AS restaurant
    WHERE restaurant.university_id = _invitation.university_id
      AND lower(restaurant.name) = lower(_invitation.restaurant_name)
  ) THEN
    RAISE EXCEPTION 'A restaurant with this name already exists at this university';
  END IF;

  BEGIN
    INSERT INTO public.restaurants (name, slug, description, cuisine, university_id)
    VALUES (
      _invitation.restaurant_name, _slug, _invitation.description,
      _invitation.cuisine, _invitation.university_id
    )
    RETURNING id INTO _restaurant_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS _constraint_name = CONSTRAINT_NAME;
    IF _constraint_name = 'restaurants_university_name_key' THEN
      RAISE EXCEPTION 'A restaurant with this name already exists at this university';
    END IF;
    RAISE;
  END;

  INSERT INTO public.user_roles (user_id, role, restaurant_id, university_id)
  VALUES (auth.uid(), 'vendor', _restaurant_id, _invitation.university_id);

  UPDATE public.direct_vendor_invitations AS invitation
  SET status = 'completed', restaurant_id = _restaurant_id, completed_at = now()
  WHERE invitation.id = _invitation.id;

  RETURN QUERY
  SELECT _invitation.id, _restaurant_id, _invitation.university_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_direct_vendor_invitation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_direct_vendor_invitation() TO authenticated;
