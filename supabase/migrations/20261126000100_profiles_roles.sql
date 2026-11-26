-- DB01.1: executed by user in Supabase SQL Editor; screenshots confirm both tables and RLS.
BEGIN;
CREATE TABLE public.profiles (
 id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 full_name TEXT, phone TEXT,
 preferred_language TEXT NOT NULL DEFAULT 'es' CHECK (preferred_language IN ('es','en')),
 preferred_theme TEXT NOT NULL DEFAULT 'light' CHECK (preferred_theme IN ('light','dark')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.user_roles (
 user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK (role IN ('driver','operator','owner','admin')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (user_id,role)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon,authenticated;
REVOKE ALL ON public.user_roles FROM anon,authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name,phone,preferred_language,preferred_theme) ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid()=id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id) WITH CHECK (auth.uid()=id);
CREATE POLICY roles_select_own ON public.user_roles FOR SELECT TO authenticated USING (auth.uid()=user_id);
COMMIT;
