-- Confirm all existing unconfirmed users (one-time cleanup since email confirm was on)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- Helper function: promote a user to admin by their email
CREATE OR REPLACE FUNCTION public.promote_to_admin(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT id INTO _user_id FROM auth.users WHERE email = _email LIMIT 1;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', _email;
  END IF;
  -- Remove any existing role for clean assignment
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'admin');
END;
$$;

-- Helper function: assign a user as a vendor for a given restaurant slug
CREATE OR REPLACE FUNCTION public.assign_vendor(_email text, _restaurant_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _restaurant_id uuid;
BEGIN
  SELECT id INTO _user_id FROM auth.users WHERE email = _email LIMIT 1;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', _email;
  END IF;

  SELECT id INTO _restaurant_id FROM public.restaurants WHERE slug = _restaurant_slug LIMIT 1;
  IF _restaurant_id IS NULL THEN
    RAISE EXCEPTION 'No restaurant found with slug %', _restaurant_slug;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role, restaurant_id)
  VALUES (_user_id, 'restaurant', _restaurant_id);
END;
$$;