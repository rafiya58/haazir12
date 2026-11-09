ALTER TABLE public.vendor_applications
  ADD COLUMN IF NOT EXISTS contact_number text;

ALTER TABLE public.vendor_applications
  DROP CONSTRAINT IF EXISTS vendor_applications_contact_number_check,
  ADD CONSTRAINT vendor_applications_contact_number_check
    CHECK (
      contact_number IS NULL
      OR contact_number ~ '^\+?[0-9][0-9 ()-]{6,23}$'
    );

DROP FUNCTION public.submit_vendor_application(text, text, text, text);

CREATE FUNCTION public.submit_vendor_application(
  _university_id text,
  _restaurant_name text,
  _contact_number text,
  _description text DEFAULT NULL,
  _cuisine text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _application_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _university_id IS NULL OR _university_id NOT IN ('iba', 'habib') THEN
    RAISE EXCEPTION 'Select a supported university';
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
    WHERE public.vendor_applications.status <> 'approved'
  RETURNING id INTO _application_id;

  IF _application_id IS NULL THEN
    RAISE EXCEPTION 'A vendor application is already approved for this university';
  END IF;

  RETURN _application_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_vendor_application(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(text, text, text, text, text) TO authenticated;
