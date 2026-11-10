ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS contact_email text;

ALTER TABLE public.universities
  DROP CONSTRAINT IF EXISTS universities_id_check,
  ADD CONSTRAINT universities_id_check
    CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(id) <= 64),
  ADD CONSTRAINT universities_email_domain_check
    CHECK (email_domain ~ '^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
  ADD CONSTRAINT universities_contact_email_check
    CHECK (contact_email IS NULL OR contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

CREATE OR REPLACE VIEW public.campus_directory
WITH (security_barrier = true)
AS
SELECT id, name, email_domain
FROM public.universities;

GRANT SELECT ON public.campus_directory TO anon, authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed'));

CREATE OR REPLACE FUNCTION public.enforce_allowed_account_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_roles existing
    WHERE existing.user_id = NEW.user_id
      AND existing.role <> NEW.role
      AND NOT (
        (existing.role = 'student' AND NEW.role = 'vendor')
        OR (existing.role = 'vendor' AND NEW.role = 'student')
      )
  ) THEN
    RAISE EXCEPTION 'Only student and vendor roles may be combined on one account';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_allowed_account_roles
BEFORE INSERT OR UPDATE OF user_id, role ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_allowed_account_roles();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_university text := NEW.raw_user_meta_data->>'university';
  account_type text := NEW.raw_user_meta_data->>'account_type';
  selected_student_id text := NULLIF(btrim(NEW.raw_user_meta_data->>'student_id'), '');
  email_domain text := lower(split_part(NEW.email, '@', 2));
  expected_email_domain text;
BEGIN
  IF account_type = 'student' THEN
    SELECT lower(u.email_domain)
    INTO expected_email_domain
    FROM public.universities u
    WHERE u.id = selected_university;

    IF expected_email_domain IS NULL THEN
      RAISE EXCEPTION 'Select a supported campus for student signup';
    END IF;
    IF email_domain IS DISTINCT FROM expected_email_domain THEN
      RAISE EXCEPTION 'Student account email must match the selected campus domain';
    END IF;
    IF selected_student_id IS NULL THEN
      RAISE EXCEPTION 'Student ID is required for student signup';
    END IF;
  END IF;

  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, university, student_id)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN account_type = 'student' THEN selected_university END,
    CASE WHEN account_type = 'student' THEN selected_student_id END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  IF account_type = 'student' THEN
    INSERT INTO public.user_roles (user_id, role, university_id)
    VALUES (NEW.id, 'student', selected_university)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

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
SET search_path = public
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
    WHERE public.vendor_applications.status <> 'approved'
  RETURNING id INTO _application_id;

  IF _application_id IS NULL THEN
    RAISE EXCEPTION 'A vendor application is already approved for this account';
  END IF;
  RETURN _application_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_payment_status(
  _order_id uuid,
  _payment_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Only platform admins can update payment status';
  END IF;
  IF _payment_status IS NULL OR _payment_status NOT IN ('pending', 'paid', 'failed') THEN
    RAISE EXCEPTION 'Invalid payment status';
  END IF;

  UPDATE public.orders
  SET payment_status = _payment_status
  WHERE id = _order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_order_payment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_payment_status(uuid, text) TO authenticated;
