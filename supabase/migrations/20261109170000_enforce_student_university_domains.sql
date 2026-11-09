CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_university text := NEW.raw_user_meta_data->>'university';
  account_type text := NEW.raw_user_meta_data->>'account_type';
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
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  IF email_domain IN ('khi.iba.edu.pk', 'st.habib.edu.pk')
     AND account_type IS DISTINCT FROM 'staff' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
