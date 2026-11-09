CREATE TABLE public.universities (
  id text PRIMARY KEY CHECK (id IN ('iba', 'habib')),
  name text NOT NULL UNIQUE,
  email_domain text NOT NULL UNIQUE
);

INSERT INTO public.universities (id, name, email_domain)
VALUES
  ('iba', 'IBA', 'khi.iba.edu.pk'),
  ('habib', 'Habib University', 'st.habib.edu.pk')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, email_domain = EXCLUDED.email_domain;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS university_id text REFERENCES public.universities(id);

DELETE FROM public.user_roles
WHERE role IN ('admin', 'restaurant');

UPDATE public.user_roles ur
SET university_id = CASE
  WHEN lower(u.email) LIKE '%@st.habib.edu.pk' THEN 'habib'
  WHEN lower(u.email) LIKE '%@khi.iba.edu.pk' THEN 'iba'
  ELSE p.university
END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE ur.user_id = u.id
  AND ur.role = 'student'
  AND ur.university_id IS NULL;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS university_id text REFERENCES public.universities(id);

UPDATE public.restaurants SET university_id = 'iba' WHERE university_id IS NULL;

ALTER TABLE public.restaurants
  ALTER COLUMN university_id SET NOT NULL,
  ALTER COLUMN university_id SET DEFAULT 'iba';

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_campus_admin_university
  ON public.user_roles (user_id, university_id)
  WHERE role = 'campus_admin' AND university_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_vendor_account
  ON public.user_roles (user_id)
  WHERE role = 'vendor';
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_platform_admin
  ON public.user_roles (user_id)
  WHERE role = 'platform_admin';
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_student_university
  ON public.user_roles (user_id, university_id)
  WHERE role = 'student' AND university_id IS NOT NULL;

ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_university_name_key
  ON public.restaurants (university_id, lower(name));

CREATE TABLE public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id text NOT NULL REFERENCES public.universities(id),
  restaurant_name text NOT NULL CHECK (length(trim(restaurant_name)) BETWEEN 2 AND 100),
  description text,
  cuisine text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX vendor_applications_university_status_idx
  ON public.vendor_applications (university_id, status, created_at);

ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  ) AND _user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_university_role(
  _user_id uuid,
  _university_id text,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND university_id = _university_id
      AND role = _role
  ) AND _user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_user_restaurant(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'vendor'
    AND restaurant_id IS NOT NULL
    AND _user_id = auth.uid()
  ORDER BY restaurant_id
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_university_role(uuid, text, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_university_role(uuid, text, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_restaurant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_restaurant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_vendor_application(
  _university_id text,
  _restaurant_name text,
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
    user_id, university_id, restaurant_name, description, cuisine, status,
    review_note, reviewed_by, reviewed_at, updated_at
  )
  VALUES (
    _user_id, _university_id, trim(_restaurant_name), NULLIF(trim(_description), ''),
    NULLIF(trim(_cuisine), ''), 'pending', NULL, NULL, NULL, now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET restaurant_name = EXCLUDED.restaurant_name,
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

CREATE OR REPLACE FUNCTION public.review_vendor_application(
  _application_id uuid,
  _decision text,
  _review_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _application public.vendor_applications%ROWTYPE;
  _slug text;
  _restaurant_id uuid;
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
    _slug := trim(both '-' from regexp_replace(lower(_application.restaurant_name), '[^a-z0-9]+', '-', 'g'));
    IF _slug = '' THEN
      _slug := 'vendor';
    END IF;
    _slug := left(_slug, 80) || '-' || _application.id::text;

    INSERT INTO public.restaurants (
      name, slug, description, cuisine, university_id
    )
    VALUES (
      _application.restaurant_name, _slug, _application.description,
      _application.cuisine, _application.university_id
    )
    RETURNING id INTO _restaurant_id;

    INSERT INTO public.user_roles (user_id, role, restaurant_id, university_id)
    VALUES (_application.user_id, 'vendor', _restaurant_id, _application.university_id);

    UPDATE public.vendor_applications
    SET status = 'approved', review_note = NULLIF(trim(_review_note), ''),
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

REVOKE EXECUTE ON FUNCTION public.submit_vendor_application(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_vendor_application(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_vendor_application(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.promote_to_admin(text);
DROP FUNCTION IF EXISTS public.assign_vendor(text, text);

DROP POLICY IF EXISTS "users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "users view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "auth view restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "admins manage restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "vendors update own restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "auth view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "vendors manage own menu" ON public.menu_items;
DROP POLICY IF EXISTS "admins manage all menus" ON public.menu_items;
DROP POLICY IF EXISTS "students view own orders" ON public.orders;
DROP POLICY IF EXISTS "students create orders" ON public.orders;
DROP POLICY IF EXISTS "vendors view their restaurant orders" ON public.orders;
DROP POLICY IF EXISTS "vendors update their restaurant orders" ON public.orders;
DROP POLICY IF EXISTS "admins view all orders" ON public.orders;
DROP POLICY IF EXISTS "students view own order items" ON public.order_items;
DROP POLICY IF EXISTS "students insert own order items" ON public.order_items;
DROP POLICY IF EXISTS "vendors view restaurant order items" ON public.order_items;
DROP POLICY IF EXISTS "admins view all order items" ON public.order_items;

CREATE POLICY "users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "platform admins view profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "campus admins view university profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles target_role
      JOIN public.user_roles admin_role
        ON admin_role.university_id = target_role.university_id
      WHERE target_role.user_id = profiles.id
        AND admin_role.user_id = auth.uid()
        AND admin_role.role = 'campus_admin'
        AND target_role.role IN ('student', 'vendor', 'campus_admin')
    )
  );
CREATE POLICY "campus admins view applicant profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vendor_applications application
      WHERE application.user_id = profiles.id
        AND public.has_university_role(auth.uid(), application.university_id, 'campus_admin')
    )
  );

CREATE POLICY "users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "platform admins view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "campus admins view university roles" ON public.user_roles
  FOR SELECT USING (
    university_id IS NOT NULL
    AND public.has_university_role(auth.uid(), university_id, 'campus_admin')
  );

CREATE POLICY "authenticated users view universities" ON public.universities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "platform admins manage universities" ON public.universities
  FOR ALL USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "university members view restaurants" ON public.restaurants
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND university_id = restaurants.university_id
    )
  );
CREATE POLICY "platform admins manage restaurants" ON public.restaurants
  FOR ALL USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "campus admins manage university restaurants" ON public.restaurants
  FOR UPDATE USING (public.has_university_role(auth.uid(), university_id, 'campus_admin'))
  WITH CHECK (public.has_university_role(auth.uid(), university_id, 'campus_admin'));
CREATE POLICY "vendors update own restaurant" ON public.restaurants
  FOR UPDATE USING (id = public.get_user_restaurant(auth.uid()))
  WITH CHECK (id = public.get_user_restaurant(auth.uid()));

CREATE POLICY "university members view menu items" ON public.menu_items
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.restaurants
      WHERE restaurants.id = menu_items.restaurant_id
        AND (
          EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND university_id = restaurants.university_id)
        )
    )
  );
CREATE POLICY "vendors manage own menu" ON public.menu_items
  FOR ALL USING (restaurant_id = public.get_user_restaurant(auth.uid()))
  WITH CHECK (restaurant_id = public.get_user_restaurant(auth.uid()));
CREATE POLICY "platform admins manage all menus" ON public.menu_items
  FOR ALL USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "campus admins manage university menus" ON public.menu_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.restaurants
      WHERE restaurants.id = menu_items.restaurant_id
        AND public.has_university_role(auth.uid(), restaurants.university_id, 'campus_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants
      WHERE restaurants.id = menu_items.restaurant_id
        AND public.has_university_role(auth.uid(), restaurants.university_id, 'campus_admin')
    )
  );

CREATE POLICY "students view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "students create own orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = student_id AND public.has_role(auth.uid(), 'student')
  );
CREATE POLICY "vendors view their restaurant orders" ON public.orders
  FOR SELECT USING (restaurant_id = public.get_user_restaurant(auth.uid()));
CREATE POLICY "vendors update their restaurant orders" ON public.orders
  FOR UPDATE USING (restaurant_id = public.get_user_restaurant(auth.uid()))
  WITH CHECK (restaurant_id = public.get_user_restaurant(auth.uid()));
CREATE POLICY "platform admins view all orders" ON public.orders
  FOR SELECT USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "platform admins update all orders" ON public.orders
  FOR UPDATE USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "campus admins view university orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.restaurants
      WHERE restaurants.id = orders.restaurant_id
        AND public.has_university_role(auth.uid(), restaurants.university_id, 'campus_admin')
    )
  );
CREATE POLICY "users view own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.student_id = auth.uid())
  );
CREATE POLICY "students insert own order items" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.student_id = auth.uid())
      AND public.has_role(auth.uid(), 'student')
  );
CREATE POLICY "vendors view restaurant order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id = public.get_user_restaurant(auth.uid())
    )
  );
CREATE POLICY "platform admins view all order items" ON public.order_items
  FOR SELECT USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "campus admins view university order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_items.order_id
        AND public.has_university_role(auth.uid(), r.university_id, 'campus_admin')
    )
  );

CREATE POLICY "applicants view own vendor applications" ON public.vendor_applications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "university admins view vendor applications" ON public.vendor_applications
  FOR SELECT USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_university_role(auth.uid(), university_id, 'campus_admin')
  );
CREATE POLICY "applicants insert vendor applications" ON public.vendor_applications
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND status = 'pending'
      AND reviewed_by IS NULL AND reviewed_at IS NULL
  );
CREATE POLICY "applicants update pending vendor applications" ON public.vendor_applications
  FOR UPDATE USING (
    auth.uid() = user_id AND status IN ('pending', 'rejected')
  )
  WITH CHECK (
    auth.uid() = user_id AND status = 'pending'
      AND reviewed_by IS NULL AND reviewed_at IS NULL
  );

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
BEGIN
  IF account_type = 'student' THEN
    IF selected_university = 'iba' AND email_domain IS DISTINCT FROM 'khi.iba.edu.pk' THEN
      RAISE EXCEPTION 'Student accounts selected as IBA must use a khi.iba.edu.pk email';
    ELSIF selected_university = 'habib' AND email_domain IS DISTINCT FROM 'st.habib.edu.pk' THEN
      RAISE EXCEPTION 'Student accounts selected as Habib University must use a st.habib.edu.pk email';
    ELSIF selected_university NOT IN ('iba', 'habib') OR selected_university IS NULL THEN
      RAISE EXCEPTION 'Select a supported university for student signup';
    END IF;
    IF selected_student_id IS NULL THEN
      RAISE EXCEPTION 'Student ID is required for student signup';
    END IF;
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

CREATE INDEX IF NOT EXISTS user_roles_university_role_idx
  ON public.user_roles (university_id, role);
