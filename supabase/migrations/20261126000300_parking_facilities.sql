-- DB02.1 (Retroactive documentation of manually applied migration in Supabase SQL Editor)
-- Creates public.parking_facilities with RLS enabled and read-only public access to active rows.
-- Live columns verified on project qerrmfdpxbjwmeprwrbc:
--   id, slug, name, address, city, latitude, longitude, base_hourly_rate,
--   currency, max_height_m, is_active, is_demo, created_at.
BEGIN;

CREATE TABLE IF NOT EXISTS public.parking_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL DEFAULT 'Buenos Aires',
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  base_hourly_rate numeric(12,2) NOT NULL CHECK (base_hourly_rate >= 0),
  currency text NOT NULL DEFAULT 'ARS',
  max_height_m numeric(4,2) CHECK (max_height_m > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parking_facilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parking_facilities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.parking_facilities TO anon, authenticated;

DROP POLICY IF EXISTS facilities_select_active ON public.parking_facilities;
CREATE POLICY facilities_select_active
  ON public.parking_facilities
  FOR SELECT
  TO anon, authenticated
  USING (is_active);

COMMIT;
