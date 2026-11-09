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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
