-- DB01.2 (Retroactive documentation of manually applied migration in Supabase SQL Editor)
-- Automatically creates a public.profiles row and assigns the default 'driver' role
-- whenever a new user registers via Supabase Auth (verified with driver@example.com).
-- Safe/idempotent if re-run.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, preferred_language, preferred_theme)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'preferred_language' IN ('es', 'en') THEN NEW.raw_user_meta_data->>'preferred_language'
      ELSE 'es'
    END,
    CASE
      WHEN NEW.raw_user_meta_data->>'preferred_theme' IN ('light', 'dark') THEN NEW.raw_user_meta_data->>'preferred_theme'
      ELSE 'light'
    END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
