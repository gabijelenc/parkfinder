-- =============================================================================
-- parkFinder — Sprint 2C · 01_backend_migration.sql
-- Consolidated, Non-Destructive, Idempotent Backend Migration
-- Target: Supabase PostgreSQL 17.12 (Project: parkfinder-dev / qerrmfdpxbjwmeprwrbc)
-- Database Timezone: UTC | Business Timezone: America/Argentina/Buenos_Aires (UTC-3)
--
-- Execution Order in Supabase SQL Editor:
--   1. 01_backend_migration.sql  (this file)
--   2. 02_demo_seed.sql
--   3. 03_database_tests.sql
--
-- Prerequisites (already applied on parkfinder-dev):
--   - 22 base tables with RLS enabled (migrations 000100..000500)
--   - Auth trigger on_auth_user_created
--
-- Safety:
--   - Never drops or recreates existing tables.
--   - All SECURITY DEFINER functions lock search_path and enforce auth.uid().
--   - Enforces facility-level transactional locking + PostgreSQL GiST exclusion
--     constraint to prevent concurrent overbooking on the last available space.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Required Extensions (available by default in Supabase PostgreSQL 17)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- 2. Non-Destructive Incremental Schema Refinements on Existing 22 Tables
-- -----------------------------------------------------------------------------

-- 2.1 parking_facilities: add capacity, QA separation, provenance & media metadata
ALTER TABLE public.parking_facilities
  ADD COLUMN IF NOT EXISTS total_spaces integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_qa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_provenance text NOT NULL DEFAULT 'synthetic_demo',
  ADD COLUMN IF NOT EXISTS rating_score numeric(3,2),
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_image text,
  ADD COLUMN IF NOT EXISTS gallery_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_facilities_total_spaces_check') THEN
    ALTER TABLE public.parking_facilities ADD CONSTRAINT parking_facilities_total_spaces_check CHECK (total_spaces >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_facilities_rating_score_check') THEN
    ALTER TABLE public.parking_facilities ADD CONSTRAINT parking_facilities_rating_score_check CHECK (rating_score IS NULL OR (rating_score >= 1 AND rating_score <= 5));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_facilities_review_count_check') THEN
    ALTER TABLE public.parking_facilities ADD CONSTRAINT parking_facilities_review_count_check CHECK (review_count >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS parking_facilities_slug_uidx ON public.parking_facilities (slug);
CREATE INDEX IF NOT EXISTS parking_facilities_active_qa_idx ON public.parking_facilities (is_active, is_qa);

-- 2.2 profiles: add default payment preference & updated_at
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_payment_method text NOT NULL DEFAULT 'pay_at_garage',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_default_payment_method_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_default_payment_method_check
      CHECK (default_payment_method IN ('pay_at_garage', 'mercado_pago'));
  END IF;
END $$;

GRANT UPDATE (full_name, phone, preferred_language, preferred_theme, default_payment_method)
  ON public.profiles TO authenticated;

-- 2.3 vehicles: add timestamps & enforce clean default-vehicle switching
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2.4 favorite_destinations: add zone_id, timestamps & deduplication index
ALTER TABLE public.favorite_destinations
  ADD COLUMN IF NOT EXISTS zone_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS favorite_destinations_user_label_uidx
  ON public.favorite_destinations (user_id, lower(trim(label)));

-- 2.5 reviews: add bilingual synthetic demo display fields (without exposing user_id/booking_id)
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS author_label text,
  ADD COLUMN IF NOT EXISTS comment_en text,
  ADD COLUMN IF NOT EXISTS review_date date;

GRANT SELECT (id, facility_id, rating, comment, comment_en, author_label, review_date, is_demo, is_published, created_at)
  ON public.reviews TO anon, authenticated;

-- 2.6 pricing_rules: unique key index for idempotent rule seeding
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_unique_key_uidx
  ON public.pricing_rules (
    COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_type,
    (parameters->>'key')
  );

-- 2.7 parking_spaces: lookup index for active spaces per facility
CREATE INDEX IF NOT EXISTS parking_spaces_facility_active_idx
  ON public.parking_spaces (facility_id, is_active, label);

-- 2.8 bookings: add human-readable code, payment method, cancellation audit & exclusion constraint
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_code text,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'pay_at_garage',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_payment_method_check') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_payment_method_check
      CHECK (payment_method IN ('pay_at_garage', 'mercado_pago'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_cancellation_fee_check') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_cancellation_fee_check
      CHECK (cancellation_fee_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlapping_space') THEN
    SET LOCAL search_path = public, extensions;
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_overlapping_space
      EXCLUDE USING gist (
        space_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (space_id IS NOT NULL AND status IN ('pending_payment', 'confirmed', 'checked_in'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_booking_code_uidx
  ON public.bookings (booking_code)
  WHERE booking_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_active_capacity_idx
  ON public.bookings (facility_id, starts_at, ends_at)
  WHERE status IN ('pending_payment', 'confirmed', 'checked_in');

CREATE INDEX IF NOT EXISTS bookings_hold_expires_idx
  ON public.bookings (hold_expires_at)
  WHERE status = 'pending_payment';

CREATE INDEX IF NOT EXISTS bookings_user_created_idx
  ON public.bookings (user_id, created_at DESC);

-- 2.9 payments & payment_events: Sprint 2D Mercado Pago Checkout Pro preparation
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS mp_preference_id text,
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS payments_external_ref_uidx
  ON public.payments (external_reference)
  WHERE external_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_mp_payment_id_uidx
  ON public.payments (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_booking_idx ON public.payments (booking_id);

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS raw_status text,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- 2.10 booking_events & notifications indexes
CREATE INDEX IF NOT EXISTS booking_events_booking_created_idx
  ON public.booking_events (booking_id, created_at ASC);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- 2.11 Internal system_settings table (fail-closed RLS; configurable hold TTL & business rules)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  description text,
  approval_status text NOT NULL DEFAULT 'proposed_pending_team_approval',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_settings FROM PUBLIC, anon, authenticated;

INSERT INTO public.system_settings (key, value_json, description, approval_status)
VALUES
  ('booking_hold_minutes', '10'::jsonb, 'Temporary checkout hold TTL in minutes (proposed initial value)', 'proposed_pending_team_approval'),
  ('max_booking_hours', '72'::jsonb, 'Maximum booking stay duration in hours', 'proposed_pending_team_approval'),
  ('business_timezone', '"America/Argentina/Buenos_Aires"'::jsonb, 'Authoritative business timezone (UTC-3, no DST)', 'approved'),
  ('cancellation_policy', '{"free_before_hours": 2, "late_fee_pct": 20, "no_show_fee_pct": 30, "grace_minutes": 15}'::jsonb, 'Proposed cancellation & no-show policy per reglas_negocio_v01.md R06', 'proposed_pending_team_approval'),
  ('pricing_policy', '{"version": "pf-v2-proposed-hourly-proration", "rounding": "single_final_round", "peak_hours": [[8,10],[17,20]], "peak_factor": 1.15, "weekend_days": [0,6], "weekend_factor": 1.10}'::jsonb, 'Dynamic pricing parameters synchronized with core-booking.js', 'proposed_pending_team_approval')
ON CONFLICT (key) DO UPDATE
  SET value_json = EXCLUDED.value_json,
      description = EXCLUDED.description,
      updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. Trigger Helpers & Auth Trigger Hardening
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pf_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pf_set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.pf_set_updated_at();

DROP TRIGGER IF EXISTS trg_facilities_updated_at ON public.parking_facilities;
CREATE TRIGGER trg_facilities_updated_at
  BEFORE UPDATE ON public.parking_facilities
  FOR EACH ROW EXECUTE FUNCTION public.pf_set_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.pf_set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.pf_set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.pf_set_updated_at();

-- Ensure setting a vehicle as default atomically unsets any prior default for that user
CREATE OR REPLACE FUNCTION public.pf_vehicles_ensure_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_default IS TRUE THEN
    UPDATE public.vehicles
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id IS DISTINCT FROM NEW.id
       AND is_default IS TRUE;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pf_vehicles_ensure_single_default() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vehicles_single_default ON public.vehicles;
CREATE TRIGGER trg_vehicles_single_default
  BEFORE INSERT OR UPDATE OF is_default ON public.vehicles
  FOR EACH ROW
  WHEN (NEW.is_default IS TRUE)
  EXECUTE FUNCTION public.pf_vehicles_ensure_single_default();

-- Harden handle_new_user() to also seed default notification preferences
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kind text;
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

  FOREACH v_kind IN ARRAY ARRAY['booking_confirmed', 'reminder_1h', 'ending_30m', 'extension_offer', 'exit_summary', 'review_prompt']
  LOOP
    INSERT INTO public.notification_preferences (user_id, kind, enabled)
    VALUES (NEW.id, v_kind, true)
    ON CONFLICT (user_id, kind) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4. Internal Domain Helpers (Not Directly Callable by Clients)
-- -----------------------------------------------------------------------------

-- 4.1 Role check helper prepared for driver, operator, owner, admin
CREATE OR REPLACE FUNCTION public.pf_has_role(p_user_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id
       AND ur.role = p_role
  );
$$;

REVOKE ALL ON FUNCTION public.pf_has_role(uuid, text) FROM PUBLIC, anon, authenticated;

-- 4.2 Setting reader
CREATE OR REPLACE FUNCTION public.pf_get_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT (value_json)::text::integer FROM public.system_settings WHERE key = p_key),
    p_default
  );
$$;

REVOKE ALL ON FUNCTION public.pf_get_setting_int(text, integer) FROM PUBLIC, anon, authenticated;

-- 4.3 Default vehicle height by type (mirrors core-booking.js VEHICLE_TYPES)
CREATE OR REPLACE FUNCTION public.pf_default_vehicle_height(p_vehicle_type text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_vehicle_type
    WHEN 'motorcycle' THEN 1.30::numeric(4,2)
    WHEN 'car'        THEN 1.55::numeric(4,2)
    WHEN 'suv'        THEN 1.85::numeric(4,2)
    WHEN 'van'        THEN 2.20::numeric(4,2)
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.pf_default_vehicle_height(text) FROM PUBLIC, anon, authenticated;

-- 4.4 Human-readable unique booking code generator (PF-2026-XXXXXX)
CREATE OR REPLACE FUNCTION public.pf_generate_booking_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_chars CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  v_i int;
  v_try int := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_bytes := gen_random_bytes(6);
    v_code := 'PF-' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY') || '-';
    FOR v_i IN 0..5 LOOP
      v_code := v_code || substr(v_chars, (get_byte(v_bytes, v_i) % length(v_chars)) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.bookings WHERE booking_code = v_code);
    IF v_try > 20 THEN
      RAISE EXCEPTION 'Unable to generate unique booking_code';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.pf_generate_booking_code() FROM PUBLIC, anon, authenticated;

-- 4.5 Expire overdue temporary holds for a facility (no pg_cron needed on free tier)
CREATE OR REPLACE FUNCTION public.pf_expire_stale_holds_for_facility(p_facility_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rec record;
  v_count integer := 0;
BEGIN
  FOR v_rec IN
    UPDATE public.bookings
       SET status = 'expired',
           updated_at = now()
     WHERE status = 'pending_payment'
       AND hold_expires_at IS NOT NULL
       AND hold_expires_at <= now()
       AND (p_facility_id IS NULL OR facility_id = p_facility_id)
    RETURNING id, user_id, facility_id, booking_code, hold_expires_at
  LOOP
    v_count := v_count + 1;

    UPDATE public.payments
       SET status = 'cancelled',
           updated_at = now()
     WHERE booking_id = v_rec.id
       AND status = 'pending';

    INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
    VALUES (
      v_rec.id,
      NULL,
      'hold_expired',
      jsonb_build_object(
        'booking_code', v_rec.booking_code,
        'hold_expires_at', v_rec.hold_expires_at,
        'expired_at', now()
      )
    );
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pf_expire_stale_holds_for_facility(uuid) FROM PUBLIC, anon, authenticated;

-- 4.6 Day-by-day Buenos Aires (UTC-3) operating hours validation for half-open [starts_at, ends_at)
CREATE OR REPLACE FUNCTION public.pf_check_operating_hours(
  p_facility_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz CONSTANT text := 'America/Argentina/Buenos_Aires';
  v_cursor timestamptz := p_starts_at;
  v_local_start timestamp;
  v_next_midnight timestamptz;
  v_slice_end timestamptz;
  v_local_end timestamp;
  v_dow smallint;
  v_start_min integer;
  v_end_min integer;
  v_oh record;
  v_open_min integer;
  v_close_min integer;
  v_safety integer := 0;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('compatible', false, 'code', 'INVALID_INTERVAL');
  END IF;

  WHILE v_cursor < p_ends_at AND v_safety < 10 LOOP
    v_safety := v_safety + 1;
    v_local_start := v_cursor AT TIME ZONE v_tz;
    v_dow := EXTRACT(DOW FROM v_local_start)::smallint;
    v_start_min := (EXTRACT(HOUR FROM v_local_start)::integer * 60) + EXTRACT(MINUTE FROM v_local_start)::integer;

    v_next_midnight := (date_trunc('day', v_local_start) + interval '1 day') AT TIME ZONE v_tz;
    v_slice_end := LEAST(p_ends_at, v_next_midnight);
    IF v_slice_end >= v_next_midnight THEN
      v_end_min := 1440;
    ELSE
      v_local_end := v_slice_end AT TIME ZONE v_tz;
      v_end_min := (EXTRACT(HOUR FROM v_local_end)::integer * 60) + EXTRACT(MINUTE FROM v_local_end)::integer;
    END IF;

    IF v_end_min > v_start_min THEN
      SELECT *
        INTO v_oh
        FROM public.operating_hours oh
       WHERE oh.facility_id = p_facility_id
         AND oh.day_of_week = v_dow;

      IF NOT FOUND OR v_oh.is_closed THEN
        RETURN jsonb_build_object(
          'compatible', false,
          'code', 'OUT_OF_HOURS',
          'spansClosedPeriod', true,
          'closedDate', to_char(v_local_start, 'YYYY-MM-DD')
        );
      END IF;

      IF NOT v_oh.is_24_hours THEN
        v_open_min := (EXTRACT(HOUR FROM v_oh.opening_time)::integer * 60) + EXTRACT(MINUTE FROM v_oh.opening_time)::integer;
        v_close_min := (EXTRACT(HOUR FROM v_oh.closing_time)::integer * 60) + EXTRACT(MINUTE FROM v_oh.closing_time)::integer;

        IF v_open_min < v_close_min THEN
          IF v_start_min < v_open_min OR v_end_min > v_close_min THEN
            RETURN jsonb_build_object(
              'compatible', false,
              'code', 'OUT_OF_HOURS',
              'spansClosedPeriod', true,
              'open', to_char(v_oh.opening_time, 'HH24:MI'),
              'close', to_char(v_oh.closing_time, 'HH24:MI')
            );
          END IF;
        ELSIF v_open_min > v_close_min THEN
          -- Overnight operating window: closed during [close_min, open_min)
          IF v_start_min < v_open_min AND v_end_min > v_close_min THEN
            RETURN jsonb_build_object(
              'compatible', false,
              'code', 'OUT_OF_HOURS',
              'spansClosedPeriod', true,
              'open', to_char(v_oh.opening_time, 'HH24:MI'),
              'close', to_char(v_oh.closing_time, 'HH24:MI')
            );
          END IF;
        END IF;
      END IF;
    END IF;

    v_cursor := v_slice_end;
  END LOOP;

  RETURN jsonb_build_object('compatible', true, 'code', 'OK', 'spansClosedPeriod', false);
END;
$$;

REVOKE ALL ON FUNCTION public.pf_check_operating_hours(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- 4.7 Exact half-open [starts_at, ends_at) sweep-line peak concurrent bookings
-- Departures (-1) are ordered BEFORE arrivals (+1) on timestamp ties so adjacent
-- intervals [08:00, 11:00) and [11:00, 13:00) NEVER double-count capacity.
-- Expired pending_payment holds (hold_expires_at <= now()) NEVER consume capacity.
CREATE OR REPLACE FUNCTION public.pf_peak_concurrent_in_interval(
  p_facility_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH active_overlapping AS (
    SELECT
      GREATEST(b.starts_at, p_starts_at) AS c_start,
      LEAST(b.ends_at, p_ends_at) AS c_end
    FROM public.bookings b
    WHERE b.facility_id = p_facility_id
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND (
        b.status IN ('confirmed', 'checked_in')
        OR (b.status = 'pending_payment' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > now()))
      )
      AND b.starts_at < p_ends_at
      AND p_starts_at < b.ends_at
  ),
  events AS (
    SELECT c_start AS ev_time, 1 AS delta FROM active_overlapping WHERE c_start < c_end
    UNION ALL
    SELECT c_end   AS ev_time, -1 AS delta FROM active_overlapping WHERE c_start < c_end
  ),
  running AS (
    SELECT
      SUM(delta) OVER (ORDER BY ev_time ASC, delta ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS concurrent_count
    FROM events
  )
  SELECT COALESCE(MAX(concurrent_count), 0)::integer FROM running;
$$;

REVOKE ALL ON FUNCTION public.pf_peak_concurrent_in_interval(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;

-- 4.8 Find an available physical parking_space compatible with height for [starts_at, ends_at)
CREATE OR REPLACE FUNCTION public.pf_find_available_space(
  p_facility_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_effective_height numeric,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ps.id
    FROM public.parking_spaces ps
   WHERE ps.facility_id = p_facility_id
     AND ps.is_active IS TRUE
     AND (ps.max_height_m IS NULL OR p_effective_height IS NULL OR ps.max_height_m >= p_effective_height)
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
        WHERE b.space_id = ps.id
          AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
          AND (
            b.status IN ('confirmed', 'checked_in')
            OR (b.status = 'pending_payment' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > now()))
          )
          AND b.starts_at < p_ends_at
          AND p_starts_at < b.ends_at
     )
   ORDER BY ps.label ASC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pf_find_available_space(uuid, timestamptz, timestamptz, numeric, uuid) FROM PUBLIC, anon, authenticated;

-- 4.9 Authoritative Dynamic Pricing Engine (mirrors core-booking.js calculateDynamicQuote 100%)
-- Rules (proposed defaults per reglas_negocio_v01.md R04):
--   Vehicle: motorcycle=0.65, car=1.00, suv=1.30, van=1.55
--   Occupancy per segment: <50%=1.00, 50%..<75%=1.20, >=75%=1.40
--   Peak hours (BA local time): 08:00-10:00 and 17:00-20:00 -> 1.15
--   Weekend (BA local time): Saturday (6) and Sunday (0) -> 1.10
--   Rounding: single final ROUND(total_exact, 0) ONLY at the end.
CREATE OR REPLACE FUNCTION public.pf_calculate_quote_internal(
  p_facility_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_vehicle_type text,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz CONSTANT text := 'America/Argentina/Buenos_Aires';
  v_fac record;
  v_total_spaces integer;
  v_vehicle_factor numeric;
  v_cursor timestamptz := p_starts_at;
  v_cursor_local timestamp;
  v_next_hour_ts timestamptz;
  v_seg_end timestamptz;
  v_end_local timestamp;
  v_end_label text;
  v_seg_minutes integer;
  v_seg_hours numeric;
  v_peak_in_seg integer;
  v_occ_ratio numeric;
  v_occ_factor numeric;
  v_local_hour integer;
  v_dow integer;
  v_peak_factor numeric;
  v_weekend_factor numeric;
  v_combined numeric;
  v_sub_exact numeric;
  v_total_exact numeric := 0;
  v_duration_minutes integer;
  v_duration_hours numeric;
  v_base_subtotal numeric;
  v_total_ars numeric;
  v_effective_mult numeric;
  v_peak_count integer := 0;
  v_weekend_count integer := 0;
  v_max_occ_factor numeric := 1.00;
  v_max_occ_ratio numeric := 0;
  v_segments jsonb := '[]'::jsonb;
  v_safety integer := 0;
BEGIN
  SELECT id, base_hourly_rate, currency, total_spaces
    INTO v_fac
    FROM public.parking_facilities
   WHERE id = p_facility_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Effective capacity: prefer active physical spaces count when spaces exist, else total_spaces
  SELECT GREATEST(
    COALESCE((SELECT COUNT(*)::integer FROM public.parking_spaces WHERE facility_id = p_facility_id AND is_active), 0),
    0
  ) INTO v_total_spaces;
  IF v_total_spaces = 0 THEN
    v_total_spaces := GREATEST(COALESCE(v_fac.total_spaces, 0), 0);
  END IF;

  v_vehicle_factor := CASE p_vehicle_type
    WHEN 'motorcycle' THEN 0.65
    WHEN 'car'        THEN 1.00
    WHEN 'suv'        THEN 1.30
    WHEN 'van'        THEN 1.55
    ELSE NULL
  END;
  IF v_vehicle_factor IS NULL THEN
    RETURN NULL;
  END IF;

  v_duration_minutes := ROUND(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60.0)::integer;
  IF v_duration_minutes <= 0 THEN
    RETURN NULL;
  END IF;
  v_duration_hours := v_duration_minutes::numeric / 60.0;
  v_base_subtotal := v_fac.base_hourly_rate * v_duration_hours;

  WHILE v_cursor < p_ends_at AND v_safety < 100 LOOP
    v_safety := v_safety + 1;
    v_cursor_local := v_cursor AT TIME ZONE v_tz;
    v_next_hour_ts := (date_trunc('hour', v_cursor_local) + interval '1 hour') AT TIME ZONE v_tz;
    v_seg_end := LEAST(p_ends_at, v_next_hour_ts);
    v_end_local := v_seg_end AT TIME ZONE v_tz;

    IF to_char(v_end_local, 'YYYY-MM-DD') <> to_char(v_cursor_local, 'YYYY-MM-DD')
       AND to_char(v_end_local, 'HH24:MI') = '00:00' THEN
      v_end_label := '24:00';
    ELSE
      v_end_label := to_char(v_end_local, 'HH24:MI');
    END IF;

    v_seg_minutes := ROUND(EXTRACT(EPOCH FROM (v_seg_end - v_cursor)) / 60.0)::integer;
    v_seg_hours := v_seg_minutes::numeric / 60.0;

    v_peak_in_seg := public.pf_peak_concurrent_in_interval(p_facility_id, v_cursor, v_seg_end, p_exclude_booking_id);
    v_occ_ratio := CASE WHEN v_total_spaces > 0 THEN LEAST(1.0, v_peak_in_seg::numeric / v_total_spaces::numeric) ELSE 1.0 END;
    v_occ_factor := CASE
      WHEN v_occ_ratio < 0.50 THEN 1.00
      WHEN v_occ_ratio < 0.75 THEN 1.20
      ELSE 1.40
    END;

    v_local_hour := EXTRACT(HOUR FROM v_cursor_local)::integer;
    v_dow := EXTRACT(DOW FROM v_cursor_local)::integer;

    v_peak_factor := CASE
      WHEN (v_local_hour >= 8 AND v_local_hour < 10) OR (v_local_hour >= 17 AND v_local_hour < 20) THEN 1.15
      ELSE 1.00
    END;

    v_weekend_factor := CASE
      WHEN v_dow IN (0, 6) THEN 1.10
      ELSE 1.00
    END;

    IF v_peak_factor > 1.00 THEN v_peak_count := v_peak_count + 1; END IF;
    IF v_weekend_factor > 1.00 THEN v_weekend_count := v_weekend_count + 1; END IF;
    IF v_occ_factor > v_max_occ_factor THEN v_max_occ_factor := v_occ_factor; END IF;
    IF v_occ_ratio > v_max_occ_ratio THEN v_max_occ_ratio := v_occ_ratio; END IF;

    v_combined := v_vehicle_factor * v_occ_factor * v_peak_factor * v_weekend_factor;
    v_sub_exact := v_fac.base_hourly_rate * v_seg_hours * v_combined;
    v_total_exact := v_total_exact + v_sub_exact;

    v_segments := v_segments || jsonb_build_array(jsonb_build_object(
      'date', to_char(v_cursor_local, 'YYYY-MM-DD'),
      'dayOfWeek', v_dow,
      'start', to_char(v_cursor_local, 'HH24:MI'),
      'end', v_end_label,
      'durationMinutes', v_seg_minutes,
      'durationHours', ROUND(v_seg_hours, 6),
      'peakConcurrent', v_peak_in_seg,
      'occupancyRatio', ROUND(v_occ_ratio, 6),
      'occupancyFactor', v_occ_factor,
      'peakFactor', v_peak_factor,
      'weekendFactor', v_weekend_factor,
      'vehicleFactor', v_vehicle_factor,
      'combinedMultiplier', ROUND(v_combined, 6),
      'subtotalExact', ROUND(v_sub_exact, 6)
    ));

    v_cursor := v_seg_end;
  END LOOP;

  -- Single final rounding ONLY (matches JS Math.round for positive amounts)
  v_total_ars := ROUND(v_total_exact, 0);
  v_effective_mult := CASE WHEN v_base_subtotal > 0 THEN v_total_exact / v_base_subtotal ELSE 1 END;

  RETURN jsonb_build_object(
    'currency', COALESCE(v_fac.currency, 'ARS'),
    'policyVersion', 'pf-v2-proposed-hourly-proration',
    'rounding', 'single_final_round',
    'quotedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'baseRatePerHour', v_fac.base_hourly_rate,
    'durationMinutes', v_duration_minutes,
    'durationHours', ROUND(v_duration_hours, 6),
    'baseSubtotal', ROUND(v_base_subtotal, 4),
    'vehicleType', p_vehicle_type,
    'vehicleFactor', v_vehicle_factor,
    'hasPeak', v_peak_count > 0,
    'peakSegmentsCount', v_peak_count,
    'hasWeekend', v_weekend_count > 0,
    'weekendSegmentsCount', v_weekend_count,
    'maxOccupancyRatio', ROUND(v_max_occ_ratio, 6),
    'maxOccupancyFactor', v_max_occ_factor,
    'effectiveMultiplier', ROUND(v_effective_mult, 6),
    'totalExact', ROUND(v_total_exact, 6),
    'totalArs', v_total_ars,
    'segments', v_segments,
    'authority', 'supabase_postgresql'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_calculate_quote_internal(uuid, timestamptz, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Client-Callable Authoritative RPC Functions
-- -----------------------------------------------------------------------------

-- 5.1 Public catalog & availability query (anonymous browsing allowed, no PII exposed)
CREATE OR REPLACE FUNCTION public.pf_get_catalog_availability(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_vehicle_type text DEFAULT 'car',
  p_vehicle_height_m numeric DEFAULT NULL,
  p_include_qa boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max_hours integer := public.pf_get_setting_int('max_booking_hours', 72);
  v_dur_minutes integer;
  v_eff_height numeric;
  v_fac record;
  v_hours_check jsonb;
  v_veh_accepted boolean;
  v_total_spaces integer;
  v_peak integer;
  v_free_spaces integer;
  v_free_compat_space uuid;
  v_avail_spaces integer;
  v_occ_ratio numeric;
  v_quote jsonb;
  v_eligible boolean;
  v_reason text;
  v_amenities jsonb;
  v_veh_types jsonb;
  v_op_hours jsonb;
  v_reviews jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NON_POSITIVE_DURATION', 'facilities', '[]'::jsonb);
  END IF;

  v_dur_minutes := ROUND(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60.0)::integer;
  IF v_dur_minutes > (v_max_hours * 60) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXCEEDS_MAX_DURATION', 'maxDurationHours', v_max_hours, 'facilities', '[]'::jsonb);
  END IF;

  IF p_vehicle_type NOT IN ('motorcycle', 'car', 'suv', 'van') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VEHICLE_TYPE', 'facilities', '[]'::jsonb);
  END IF;

  v_eff_height := COALESCE(
    CASE WHEN p_vehicle_height_m IS NOT NULL AND p_vehicle_height_m > 0 THEN p_vehicle_height_m ELSE NULL END,
    public.pf_default_vehicle_height(p_vehicle_type)
  );

  FOR v_fac IN
    SELECT f.*
      FROM public.parking_facilities f
     WHERE f.is_active IS TRUE
       AND (p_include_qa IS TRUE OR f.is_qa IS FALSE)
     ORDER BY f.is_qa ASC, f.name ASC
  LOOP
    -- Expire stale holds lazily if this caller is authenticated/non-read-only;
    -- peak calculation also ignores expired holds even in read-only transactions.
    SELECT GREATEST(
      COALESCE((SELECT COUNT(*)::integer FROM public.parking_spaces ps WHERE ps.facility_id = v_fac.id AND ps.is_active), 0),
      0
    ) INTO v_total_spaces;
    IF v_total_spaces = 0 THEN
      v_total_spaces := GREATEST(COALESCE(v_fac.total_spaces, 0), 0);
    END IF;

    v_hours_check := public.pf_check_operating_hours(v_fac.id, p_starts_at, p_ends_at);
    v_veh_accepted := EXISTS (
      SELECT 1 FROM public.facility_vehicle_types fvt
       WHERE fvt.facility_id = v_fac.id AND fvt.vehicle_type = p_vehicle_type
    );

    v_peak := public.pf_peak_concurrent_in_interval(v_fac.id, p_starts_at, p_ends_at, NULL);
    v_free_spaces := GREATEST(0, v_total_spaces - v_peak);
    v_free_compat_space := public.pf_find_available_space(v_fac.id, p_starts_at, p_ends_at, v_eff_height, NULL);
    v_avail_spaces := CASE WHEN v_free_compat_space IS NULL THEN 0 ELSE v_free_spaces END;
    v_occ_ratio := CASE WHEN v_total_spaces > 0 THEN LEAST(1.0, v_peak::numeric / v_total_spaces::numeric) ELSE 1.0 END;

    v_quote := public.pf_calculate_quote_internal(v_fac.id, p_starts_at, p_ends_at, p_vehicle_type, NULL);

    v_eligible := true;
    v_reason := 'OK';
    IF NOT COALESCE((v_hours_check->>'compatible')::boolean, false) THEN
      v_eligible := false;
      v_reason := 'OUT_OF_HOURS';
    ELSIF NOT v_veh_accepted THEN
      v_eligible := false;
      v_reason := 'VEHICLE_TYPE_NOT_ACCEPTED';
    ELSIF v_fac.max_height_m IS NOT NULL AND v_eff_height > v_fac.max_height_m THEN
      v_eligible := false;
      v_reason := 'HEIGHT_EXCEEDS_CLEARANCE';
    ELSIF v_avail_spaces <= 0 THEN
      v_eligible := false;
      v_reason := 'NO_AVAILABILITY';
    END IF;

    SELECT COALESCE(jsonb_object_agg(pa.amenity, pa.available), '{}'::jsonb)
      INTO v_amenities
      FROM public.parking_amenities pa
     WHERE pa.facility_id = v_fac.id;

    SELECT COALESCE(jsonb_agg(fvt.vehicle_type ORDER BY array_position(ARRAY['motorcycle','car','suv','van'], fvt.vehicle_type)), '[]'::jsonb)
      INTO v_veh_types
      FROM public.facility_vehicle_types fvt
     WHERE fvt.facility_id = v_fac.id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'dayOfWeek', oh.day_of_week,
        'open', CASE WHEN oh.is_24_hours THEN '00:00' WHEN oh.opening_time IS NOT NULL THEN to_char(oh.opening_time, 'HH24:MI') ELSE NULL END,
        'close', CASE WHEN oh.is_24_hours THEN '24:00' WHEN oh.closing_time IS NOT NULL THEN to_char(oh.closing_time, 'HH24:MI') ELSE NULL END,
        'is24Hours', oh.is_24_hours,
        'isClosed', oh.is_closed
      ) ORDER BY oh.day_of_week
    ), '[]'::jsonb)
      INTO v_op_hours
      FROM public.operating_hours oh
     WHERE oh.facility_id = v_fac.id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'author', COALESCE(r.author_label, 'Conductor Demo'),
        'date', COALESCE(to_char(r.review_date, 'YYYY-MM-DD'), to_char(r.created_at, 'YYYY-MM-DD')),
        'rating', r.rating,
        'textEs', r.comment,
        'textEn', COALESCE(r.comment_en, r.comment),
        'provenance', 'synthetic_demo'
      ) ORDER BY r.review_date DESC NULLS LAST, r.created_at DESC
    ), '[]'::jsonb)
      INTO v_reviews
      FROM public.reviews r
     WHERE r.facility_id = v_fac.id
       AND r.is_demo IS TRUE
       AND r.is_published IS TRUE;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'uuid', v_fac.id,
      'id', v_fac.slug,
      'slug', v_fac.slug,
      'name', v_fac.name,
      'address', v_fac.address,
      'city', v_fac.city,
      'lat', v_fac.latitude,
      'lng', v_fac.longitude,
      'ratePerHour', v_fac.base_hourly_rate,
      'currency', v_fac.currency,
      'totalSpaces', v_total_spaces,
      'maxHeightM', v_fac.max_height_m,
      'isActive', v_fac.is_active,
      'isDemo', v_fac.is_demo,
      'isQa', v_fac.is_qa,
      'dataProvenance', v_fac.data_provenance,
      'mainImage', v_fac.main_image,
      'gallery', v_fac.gallery_json,
      'acceptedVehicleTypes', v_veh_types,
      'operatingHoursByDay', v_op_hours,
      'open24', COALESCE((SELECT bool_and(oh.is_24_hours) FROM public.operating_hours oh WHERE oh.facility_id = v_fac.id), false),
      'amenitiesDb', v_amenities,
      'rating', jsonb_build_object(
        'score', v_fac.rating_score,
        'reviewCount', v_fac.review_count,
        'provenance', v_fac.data_provenance
      ),
      'demoReviews', v_reviews,
      'evaluation', jsonb_build_object(
        'eligible', v_eligible,
        'reasonCode', v_reason,
        'hoursCheck', v_hours_check,
        'vehicleCheck', jsonb_build_object(
          'compatible', (v_veh_accepted AND (v_fac.max_height_m IS NULL OR v_eff_height <= v_fac.max_height_m)),
          'code', CASE
            WHEN NOT v_veh_accepted THEN 'VEHICLE_TYPE_NOT_ACCEPTED'
            WHEN v_fac.max_height_m IS NOT NULL AND v_eff_height > v_fac.max_height_m THEN 'HEIGHT_EXCEEDS_CLEARANCE'
            ELSE 'OK'
          END,
          'vehicleType', p_vehicle_type,
          'vehicleHeightM', v_eff_height,
          'maxHeightM', v_fac.max_height_m
        ),
        'availability', jsonb_build_object(
          'totalSpaces', v_total_spaces,
          'peakConcurrent', v_peak,
          'availableSpaces', v_avail_spaces,
          'occupancyRatio', ROUND(v_occ_ratio, 6)
        ),
        'quote', v_quote
      )
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'serverTime', now(),
    'holdMinutes', public.pf_get_setting_int('booking_hold_minutes', 10),
    'facilities', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_get_catalog_availability(timestamptz, timestamptz, text, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_get_catalog_availability(timestamptz, timestamptz, text, numeric, boolean) TO anon, authenticated;

-- 5.2 Single-facility quote & availability RPC
CREATE OR REPLACE FUNCTION public.pf_get_facility_quote(
  p_facility_slug_or_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_vehicle_type text DEFAULT 'car',
  p_vehicle_height_m numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fac record;
  v_max_hours integer := public.pf_get_setting_int('max_booking_hours', 72);
  v_dur_minutes integer;
  v_eff_height numeric;
  v_hours_check jsonb;
  v_veh_accepted boolean;
  v_total_spaces integer;
  v_peak integer;
  v_avail integer;
  v_free_space uuid;
  v_quote jsonb;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NON_POSITIVE_DURATION');
  END IF;

  v_dur_minutes := ROUND(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60.0)::integer;
  IF v_dur_minutes > (v_max_hours * 60) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXCEEDS_MAX_DURATION', 'maxDurationHours', v_max_hours);
  END IF;

  IF p_vehicle_type NOT IN ('motorcycle', 'car', 'suv', 'van') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VEHICLE_TYPE');
  END IF;

  SELECT *
    INTO v_fac
    FROM public.parking_facilities f
   WHERE f.is_active IS TRUE
     AND (f.slug = p_facility_slug_or_id OR f.id::text = p_facility_slug_or_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FACILITY_NOT_FOUND');
  END IF;

  v_eff_height := COALESCE(
    CASE WHEN p_vehicle_height_m IS NOT NULL AND p_vehicle_height_m > 0 THEN p_vehicle_height_m ELSE NULL END,
    public.pf_default_vehicle_height(p_vehicle_type)
  );

  SELECT GREATEST(
    COALESCE((SELECT COUNT(*)::integer FROM public.parking_spaces ps WHERE ps.facility_id = v_fac.id AND ps.is_active), 0),
    0
  ) INTO v_total_spaces;
  IF v_total_spaces = 0 THEN v_total_spaces := GREATEST(COALESCE(v_fac.total_spaces, 0), 0); END IF;

  v_hours_check := public.pf_check_operating_hours(v_fac.id, p_starts_at, p_ends_at);
  v_veh_accepted := EXISTS (
    SELECT 1 FROM public.facility_vehicle_types fvt
     WHERE fvt.facility_id = v_fac.id AND fvt.vehicle_type = p_vehicle_type
  );
  v_peak := public.pf_peak_concurrent_in_interval(v_fac.id, p_starts_at, p_ends_at, NULL);
  v_free_space := public.pf_find_available_space(v_fac.id, p_starts_at, p_ends_at, v_eff_height, NULL);
  v_avail := CASE WHEN v_free_space IS NULL THEN 0 ELSE GREATEST(0, v_total_spaces - v_peak) END;
  v_quote := public.pf_calculate_quote_internal(v_fac.id, p_starts_at, p_ends_at, p_vehicle_type, NULL);

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'facilityId', v_fac.id,
    'slug', v_fac.slug,
    'eligible', (
      COALESCE((v_hours_check->>'compatible')::boolean, false)
      AND v_veh_accepted
      AND (v_fac.max_height_m IS NULL OR v_eff_height <= v_fac.max_height_m)
      AND v_avail > 0
    ),
    'reasonCode', CASE
      WHEN NOT COALESCE((v_hours_check->>'compatible')::boolean, false) THEN 'OUT_OF_HOURS'
      WHEN NOT v_veh_accepted THEN 'VEHICLE_TYPE_NOT_ACCEPTED'
      WHEN v_fac.max_height_m IS NOT NULL AND v_eff_height > v_fac.max_height_m THEN 'HEIGHT_EXCEEDS_CLEARANCE'
      WHEN v_avail <= 0 THEN 'NO_AVAILABILITY'
      ELSE 'OK'
    END,
    'availability', jsonb_build_object(
      'totalSpaces', v_total_spaces,
      'peakConcurrent', v_peak,
      'availableSpaces', v_avail,
      'occupancyRatio', CASE WHEN v_total_spaces > 0 THEN ROUND(LEAST(1.0, v_peak::numeric / v_total_spaces::numeric), 6) ELSE 1 END
    ),
    'quote', v_quote
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_get_facility_quote(text, timestamptz, timestamptz, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_get_facility_quote(text, timestamptz, timestamptz, text, numeric) TO anon, authenticated;

-- 5.3 Atomic Temporary Booking Hold Creation (Transactional Concurrency Control)
-- Acquires facility advisory + row lock (FOR UPDATE), expires stale holds, validates all rules,
-- allocates a compatible free space_id, snapshots vehicle & authoritative quote, and creates
-- a pending_payment hold expiring in configurable booking_hold_minutes (default 10 min).
CREATE OR REPLACE FUNCTION public.pf_create_booking_hold(
  p_facility_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_payment_method text DEFAULT 'pay_at_garage',
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hold_minutes integer := public.pf_get_setting_int('booking_hold_minutes', 10);
  v_max_hours integer := public.pf_get_setting_int('max_booking_hours', 72);
  v_dur_minutes integer;
  v_fac record;
  v_veh record;
  v_existing_payment record;
  v_existing_booking record;
  v_eff_height numeric;
  v_hours_check jsonb;
  v_veh_accepted boolean;
  v_space_id uuid;
  v_quote jsonb;
  v_total_amount numeric(12,2);
  v_booking_code text;
  v_hold_expires_at timestamptz;
  v_booking_id uuid;
  v_payment_id uuid;
  v_idem_key uuid := COALESCE(p_idempotency_key, gen_random_uuid());
  v_veh_snapshot jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  IF p_payment_method NOT IN ('pay_at_garage', 'mercado_pago') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT_METHOD');
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NON_POSITIVE_DURATION');
  END IF;

  -- Require future start time (small 2-minute clock skew allowance)
  IF p_starts_at < (now() - interval '2 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAST_START_TIME');
  END IF;

  v_dur_minutes := ROUND(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60.0)::integer;
  IF v_dur_minutes <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NON_POSITIVE_DURATION');
  END IF;
  IF v_dur_minutes > (v_max_hours * 60) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXCEEDS_MAX_DURATION', 'maxDurationHours', v_max_hours);
  END IF;

  -- Idempotency check: if caller retries same p_idempotency_key, return existing hold/booking
  IF p_idempotency_key IS NOT NULL THEN
    SELECT p.*, b.id AS b_id, b.user_id AS b_user_id, b.booking_code, b.status AS b_status,
           b.total_amount, b.quote_snapshot, b.vehicle_snapshot, b.hold_expires_at, b.starts_at, b.ends_at, b.space_id
      INTO v_existing_payment
      FROM public.payments p
      JOIN public.bookings b ON b.id = p.booking_id
     WHERE p.idempotency_key = p_idempotency_key
       AND b.user_id = v_uid
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'code', 'OK',
        'idempotentReplay', true,
        'booking', jsonb_build_object(
          'id', v_existing_payment.b_id,
          'bookingCode', v_existing_payment.booking_code,
          'status', v_existing_payment.b_status,
          'startsAt', v_existing_payment.starts_at,
          'endsAt', v_existing_payment.ends_at,
          'totalAmount', v_existing_payment.total_amount,
          'holdExpiresAt', v_existing_payment.hold_expires_at,
          'spaceId', v_existing_payment.space_id,
          'quote', v_existing_payment.quote_snapshot,
          'vehicleSnapshot', v_existing_payment.vehicle_snapshot
        )
      );
    END IF;
  END IF;

  -- Verify vehicle belongs strictly to auth.uid()
  SELECT *
    INTO v_veh
    FROM public.vehicles v
   WHERE v.id = p_vehicle_id
     AND v.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VEHICLE_NOT_FOUND');
  END IF;

  -- CRITICAL: Serialize all capacity-affecting operations for this facility
  PERFORM pg_advisory_xact_lock(hashtextextended(p_facility_id::text, 0));

  SELECT *
    INTO v_fac
    FROM public.parking_facilities f
   WHERE f.id = p_facility_id
     AND f.is_active IS TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FACILITY_NOT_FOUND');
  END IF;

  -- Expire any overdue holds for this facility BEFORE checking capacity
  PERFORM public.pf_expire_stale_holds_for_facility(v_fac.id);

  -- Operating hours validation (BA local time, day-by-day)
  v_hours_check := public.pf_check_operating_hours(v_fac.id, p_starts_at, p_ends_at);
  IF NOT COALESCE((v_hours_check->>'compatible')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUT_OF_HOURS', 'details', v_hours_check);
  END IF;

  -- Vehicle type compatibility
  v_veh_accepted := EXISTS (
    SELECT 1 FROM public.facility_vehicle_types fvt
     WHERE fvt.facility_id = v_fac.id
       AND fvt.vehicle_type = v_veh.vehicle_type
  );
  IF NOT v_veh_accepted THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VEHICLE_TYPE_NOT_ACCEPTED', 'vehicleType', v_veh.vehicle_type);
  END IF;

  -- Vehicle height validation
  v_eff_height := COALESCE(v_veh.height_m, public.pf_default_vehicle_height(v_veh.vehicle_type));
  IF v_fac.max_height_m IS NOT NULL AND v_eff_height > v_fac.max_height_m THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'HEIGHT_EXCEEDS_CLEARANCE',
      'vehicleHeightM', v_eff_height,
      'maxHeightM', v_fac.max_height_m
    );
  END IF;

  -- Allocate a concrete free physical space (also enforced by bookings_no_overlapping_space exclusion constraint)
  v_space_id := public.pf_find_available_space(v_fac.id, p_starts_at, p_ends_at, v_eff_height, NULL);
  IF v_space_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_AVAILABILITY');
  END IF;

  -- Authoritative server-side dynamic quote (client prices are never accepted)
  v_quote := public.pf_calculate_quote_internal(v_fac.id, p_starts_at, p_ends_at, v_veh.vehicle_type, NULL);
  v_total_amount := (v_quote->>'totalArs')::numeric(12,2);
  v_booking_code := public.pf_generate_booking_code();
  v_hold_expires_at := now() + make_interval(mins => v_hold_minutes);

  v_veh_snapshot := jsonb_build_object(
    'vehicle_id', v_veh.id,
    'plate', upper(trim(v_veh.plate)),
    'make', v_veh.make,
    'model', v_veh.model,
    'color', v_veh.color,
    'vehicle_type', v_veh.vehicle_type,
    'height_m', v_eff_height
  );

  INSERT INTO public.bookings (
    user_id, facility_id, space_id, vehicle_id, vehicle_snapshot,
    starts_at, ends_at, status, total_amount, currency,
    quote_snapshot, hold_expires_at, booking_code, payment_method
  )
  VALUES (
    v_uid, v_fac.id, v_space_id, v_veh.id, v_veh_snapshot,
    p_starts_at, p_ends_at, 'pending_payment', v_total_amount, COALESCE(v_fac.currency, 'ARS'),
    v_quote, v_hold_expires_at, v_booking_code, p_payment_method
  )
  RETURNING id INTO v_booking_id;

  -- Create initial test payment record (always is_test = true; client can NEVER mark approved)
  INSERT INTO public.payments (
    booking_id, provider, external_reference, idempotency_key,
    amount, currency, status, is_test, metadata
  )
  VALUES (
    v_booking_id,
    p_payment_method,
    v_booking_code,
    v_idem_key,
    v_total_amount,
    COALESCE(v_fac.currency, 'ARS'),
    'pending',
    true,
    jsonb_build_object(
      'sprint', '2C',
      'mode', 'simulated_demo_only',
      'real_payment', false
    )
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
  VALUES (
    v_booking_id,
    v_uid,
    'hold_created',
    jsonb_build_object(
      'booking_code', v_booking_code,
      'space_id', v_space_id,
      'hold_expires_at', v_hold_expires_at,
      'total_amount', v_total_amount,
      'payment_method', p_payment_method
    )
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'booking.hold_created',
    'booking',
    v_booking_id,
    jsonb_build_object('facility_id', v_fac.id, 'booking_code', v_booking_code, 'total_amount', v_total_amount)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'holdMinutes', v_hold_minutes,
    'booking', jsonb_build_object(
      'id', v_booking_id,
      'bookingCode', v_booking_code,
      'status', 'pending_payment',
      'facilityId', v_fac.id,
      'facilitySlug', v_fac.slug,
      'facilityName', v_fac.name,
      'facilityAddress', v_fac.address,
      'lat', v_fac.latitude,
      'lng', v_fac.longitude,
      'spaceId', v_space_id,
      'startsAt', p_starts_at,
      'endsAt', p_ends_at,
      'totalAmount', v_total_amount,
      'currency', COALESCE(v_fac.currency, 'ARS'),
      'paymentMethod', p_payment_method,
      'holdExpiresAt', v_hold_expires_at,
      'quote', v_quote,
      'vehicleSnapshot', v_veh_snapshot
    ),
    'payment', jsonb_build_object(
      'id', v_payment_id,
      'provider', p_payment_method,
      'externalReference', v_booking_code,
      'status', 'pending',
      'isTest', true
    )
  );
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_AVAILABILITY');
END;
$$;

REVOKE ALL ON FUNCTION public.pf_create_booking_hold(uuid, uuid, timestamptz, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_create_booking_hold(uuid, uuid, timestamptz, timestamptz, text, uuid) TO authenticated;

-- 5.4 Confirm Temporary Hold (Sprint 2C Demo Confirmation — never overbooks after expiry)
-- Note: For real Mercado Pago payments in Sprint 2D, confirmation will require server-side
-- webhook verification against Mercado Pago's API; clients can NEVER mark a payment approved.
CREATE OR REPLACE FUNCTION public.pf_confirm_booking_demo(
  p_booking_id uuid,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_fac record;
  v_method text;
  v_raw_token text;
  v_token_hash text;
  v_notify_enabled boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT *
    INTO v_b
    FROM public.bookings
   WHERE id = p_booking_id
     AND user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_FOUND');
  END IF;

  -- Lock facility row to prevent race with hold expiration or concurrent booking
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b.facility_id::text, 0));

  SELECT *
    INTO v_fac
    FROM public.parking_facilities
   WHERE id = v_b.facility_id
   FOR UPDATE;

  -- Re-read booking under lock
  SELECT *
    INTO v_b
    FROM public.bookings
   WHERE id = p_booking_id
     AND user_id = v_uid
   FOR UPDATE;

  IF v_b.status = 'confirmed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CONFIRMED',
      'booking', jsonb_build_object(
        'id', v_b.id,
        'bookingCode', v_b.booking_code,
        'status', v_b.status,
        'totalAmount', v_b.total_amount,
        'startsAt', v_b.starts_at,
        'endsAt', v_b.ends_at,
        'paymentMethod', v_b.payment_method,
        'quote', v_b.quote_snapshot,
        'vehicleSnapshot', v_b.vehicle_snapshot
      )
    );
  END IF;

  IF v_b.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_BOOKING_TRANSITION', 'currentStatus', v_b.status);
  END IF;

  -- Safely handle expired temporary holds: transition to expired, never confirm or overbook
  IF v_b.hold_expires_at IS NOT NULL AND v_b.hold_expires_at <= now() THEN
    UPDATE public.bookings
       SET status = 'expired',
           updated_at = now()
     WHERE id = v_b.id;

    UPDATE public.payments
       SET status = 'cancelled',
           updated_at = now()
     WHERE booking_id = v_b.id AND status = 'pending';

    INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
    VALUES (
      v_b.id,
      v_uid,
      'hold_expired',
      jsonb_build_object('attempted_confirm_at', now(), 'hold_expires_at', v_b.hold_expires_at)
    );

    RETURN jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED');
  END IF;

  v_method := COALESCE(p_payment_method, v_b.payment_method, 'pay_at_garage');
  IF v_method NOT IN ('pay_at_garage', 'mercado_pago') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT_METHOD');
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed',
         payment_method = v_method,
         hold_expires_at = NULL,
         updated_at = now()
   WHERE id = v_b.id;

  -- Payment remains status = 'pending' & is_test = true; clients NEVER mark payments approved!
  UPDATE public.payments
     SET provider = v_method,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'confirmed_mode', CASE WHEN v_method = 'mercado_pago' THEN 'demo_mp_stub_sprint_2c' ELSE 'pay_at_garage_demo' END,
           'real_payment', false,
           'client_cannot_approve', true
         ),
         updated_at = now()
   WHERE booking_id = v_b.id
     AND status = 'pending';

  -- Issue hashed access token (only SHA-256 hash stored in booking_access_tokens; table has zero client SELECT)
  v_raw_token := encode(gen_random_bytes(24), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  INSERT INTO public.booking_access_tokens (booking_id, token_hash, expires_at)
  VALUES (v_b.id, v_token_hash, v_b.ends_at + interval '2 hours');

  INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
  VALUES (
    v_b.id,
    v_uid,
    'confirmed_demo',
    jsonb_build_object(
      'booking_code', v_b.booking_code,
      'payment_method', v_method,
      'total_amount', v_b.total_amount,
      'payment_note', 'Simulated demo confirmation (Sprint 2C); no real charge processed'
    )
  );

  SELECT COALESCE(np.enabled, true)
    INTO v_notify_enabled
    FROM public.notification_preferences np
   WHERE np.user_id = v_uid AND np.kind = 'booking_confirmed';

  IF v_notify_enabled THEN
    INSERT INTO public.notifications (user_id, booking_id, kind, message)
    VALUES (
      v_uid,
      v_b.id,
      'booking_confirmed',
      format('Reserva %s confirmada en %s (ARS %s · demo).', v_b.booking_code, v_fac.name, v_b.total_amount::bigint)
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'booking.confirmed_demo',
    'booking',
    v_b.id,
    jsonb_build_object('booking_code', v_b.booking_code, 'payment_method', v_method, 'total_amount', v_b.total_amount)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'booking', jsonb_build_object(
      'id', v_b.id,
      'bookingCode', v_b.booking_code,
      'status', 'confirmed',
      'facilityId', v_fac.id,
      'facilitySlug', v_fac.slug,
      'facilityName', v_fac.name,
      'facilityAddress', v_fac.address,
      'lat', v_fac.latitude,
      'lng', v_fac.longitude,
      'spaceId', v_b.space_id,
      'startsAt', v_b.starts_at,
      'endsAt', v_b.ends_at,
      'totalAmount', v_b.total_amount,
      'currency', v_b.currency,
      'paymentMethod', v_method,
      'paymentStatus', 'pending',
      'isTestPayment', true,
      'quote', v_b.quote_snapshot,
      'vehicleSnapshot', v_b.vehicle_snapshot,
      'qrAccessPreview', 'PFQR:' || v_b.booking_code || ':' || substr(v_raw_token, 1, 12)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_confirm_booking_demo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_confirm_booking_demo(uuid, text) TO authenticated;

-- 5.5 Cancel Booking & Atomically Release Capacity
CREATE OR REPLACE FUNCTION public.pf_cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT 'user_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_fac record;
  v_hours_until numeric;
  v_fee numeric(12,2) := 0;
  v_reason text := COALESCE(NULLIF(TRIM(p_reason), ''), 'user_cancelled');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_FOUND');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_b.facility_id::text, 0));

  SELECT * INTO v_fac FROM public.parking_facilities WHERE id = v_b.facility_id FOR UPDATE;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND user_id = v_uid FOR UPDATE;

  IF v_b.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CANCELLED');
  END IF;

  IF v_b.status NOT IN ('pending_payment', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_CANCEL_STATUS', 'currentStatus', v_b.status);
  END IF;

  -- Proposed demo cancellation fee policy (R06): >=2h before start = 0%, <2h = 20% (0% for unconfirmed holds)
  v_hours_until := EXTRACT(EPOCH FROM (v_b.starts_at - now())) / 3600.0;
  IF v_b.status = 'confirmed' AND v_hours_until < 2.0 THEN
    v_fee := ROUND(v_b.total_amount * 0.20, 0);
  ELSE
    v_fee := 0;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         hold_expires_at = NULL,
         cancelled_at = now(),
         cancellation_reason = v_reason,
         cancellation_fee_amount = v_fee,
         updated_at = now()
   WHERE id = v_b.id;

  -- Revoke any active QR access tokens
  UPDATE public.booking_access_tokens
     SET revoked_at = now()
   WHERE booking_id = v_b.id
     AND revoked_at IS NULL;

  -- Cancel pending test payment record
  UPDATE public.payments
     SET status = 'cancelled',
         updated_at = now()
   WHERE booking_id = v_b.id
     AND status = 'pending';

  INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
  VALUES (
    v_b.id,
    v_uid,
    'cancelled',
    jsonb_build_object(
      'reason', v_reason,
      'previous_status', v_b.status,
      'cancellation_fee_ars', v_fee,
      'policy_note', 'Proposed R06 policy (0% >=2h prior, 20% <2h prior; demo only)'
    )
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'booking.cancelled',
    'booking',
    v_b.id,
    jsonb_build_object('booking_code', v_b.booking_code, 'fee_ars', v_fee, 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'bookingId', v_b.id,
    'bookingCode', v_b.booking_code,
    'facilityName', v_fac.name,
    'status', 'cancelled',
    'cancelledAt', now(),
    'cancellationFeeArs', v_fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_cancel_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_cancel_booking(uuid, text) TO authenticated;

-- 5.6 Preview Booking Extension (validates capacity, hours, 72h cap & calculates incremental quote)
CREATE OR REPLACE FUNCTION public.pf_preview_booking_extension(
  p_booking_id uuid,
  p_new_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_max_hours integer := public.pf_get_setting_int('max_booking_hours', 72);
  v_b record;
  v_total_minutes integer;
  v_ext_minutes integer;
  v_hours_check jsonb;
  v_eff_height numeric;
  v_same_space_free boolean;
  v_alt_space_id uuid;
  v_inc_quote jsonb;
  v_inc_amount numeric(12,2);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_FOUND');
  END IF;

  IF v_b.status NOT IN ('confirmed', 'checked_in') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EXTENSION_STATUS', 'currentStatus', v_b.status);
  END IF;

  IF p_new_ends_at IS NULL OR p_new_ends_at <= v_b.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXTENSION_MUST_BE_LATER');
  END IF;

  v_total_minutes := ROUND(EXTRACT(EPOCH FROM (p_new_ends_at - v_b.starts_at)) / 60.0)::integer;
  IF v_total_minutes > (v_max_hours * 60) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXCEEDS_MAX_DURATION', 'maxDurationHours', v_max_hours);
  END IF;

  v_ext_minutes := ROUND(EXTRACT(EPOCH FROM (p_new_ends_at - v_b.ends_at)) / 60.0)::integer;

  v_hours_check := public.pf_check_operating_hours(v_b.facility_id, v_b.ends_at, p_new_ends_at);
  IF NOT COALESCE((v_hours_check->>'compatible')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUT_OF_HOURS', 'details', v_hours_check);
  END IF;

  v_eff_height := COALESCE((v_b.vehicle_snapshot->>'height_m')::numeric, public.pf_default_vehicle_height(COALESCE(v_b.vehicle_snapshot->>'vehicle_type', 'car')));

  -- Prefer keeping the same physical space_id; fallback to another space free for the full extended interval
  v_same_space_free := (v_b.space_id IS NOT NULL) AND NOT EXISTS (
    SELECT 1 FROM public.bookings o
     WHERE o.space_id = v_b.space_id
       AND o.id <> v_b.id
       AND (o.status IN ('confirmed', 'checked_in') OR (o.status = 'pending_payment' AND (o.hold_expires_at IS NULL OR o.hold_expires_at > now())))
       AND o.starts_at < p_new_ends_at
       AND v_b.ends_at < o.ends_at
  );

  IF NOT v_same_space_free THEN
    v_alt_space_id := public.pf_find_available_space(v_b.facility_id, v_b.starts_at, p_new_ends_at, v_eff_height, v_b.id);
    IF v_alt_space_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_AVAILABILITY');
    END IF;
  END IF;

  v_inc_quote := public.pf_calculate_quote_internal(
    v_b.facility_id,
    v_b.ends_at,
    p_new_ends_at,
    COALESCE(v_b.vehicle_snapshot->>'vehicle_type', 'car'),
    v_b.id
  );
  v_inc_amount := (v_inc_quote->>'totalArs')::numeric(12,2);

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'bookingId', v_b.id,
    'bookingCode', v_b.booking_code,
    'currentEndsAt', v_b.ends_at,
    'proposedEndsAt', p_new_ends_at,
    'addedMinutes', v_ext_minutes,
    'currentTotalAmount', v_b.total_amount,
    'incrementalAmount', v_inc_amount,
    'newTotalAmount', v_b.total_amount + v_inc_amount,
    'incrementalQuote', v_inc_quote
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_preview_booking_extension(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_preview_booking_extension(uuid, timestamptz) TO authenticated;

-- 5.7 Atomic Booking Extension (locks facility, revalidates capacity, preserves quote & event history)
CREATE OR REPLACE FUNCTION public.pf_extend_booking(
  p_booking_id uuid,
  p_new_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_max_hours integer := public.pf_get_setting_int('max_booking_hours', 72);
  v_b record;
  v_fac record;
  v_total_minutes integer;
  v_hours_check jsonb;
  v_eff_height numeric;
  v_target_space_id uuid;
  v_same_space_free boolean;
  v_inc_quote jsonb;
  v_inc_amount numeric(12,2);
  v_prev_ends_at timestamptz;
  v_new_total numeric(12,2);
  v_updated_quote_snapshot jsonb;
  v_extensions jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_FOUND');
  END IF;

  -- Serialize against concurrent bookings at the same facility
  PERFORM pg_advisory_xact_lock(hashtextextended(v_b.facility_id::text, 0));
  SELECT * INTO v_fac FROM public.parking_facilities WHERE id = v_b.facility_id FOR UPDATE;
  PERFORM public.pf_expire_stale_holds_for_facility(v_b.facility_id);

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND user_id = v_uid FOR UPDATE;

  IF v_b.status NOT IN ('confirmed', 'checked_in') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EXTENSION_STATUS', 'currentStatus', v_b.status);
  END IF;

  IF p_new_ends_at IS NULL OR p_new_ends_at <= v_b.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXTENSION_MUST_BE_LATER');
  END IF;

  v_total_minutes := ROUND(EXTRACT(EPOCH FROM (p_new_ends_at - v_b.starts_at)) / 60.0)::integer;
  IF v_total_minutes > (v_max_hours * 60) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXCEEDS_MAX_DURATION', 'maxDurationHours', v_max_hours);
  END IF;

  v_hours_check := public.pf_check_operating_hours(v_b.facility_id, v_b.ends_at, p_new_ends_at);
  IF NOT COALESCE((v_hours_check->>'compatible')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUT_OF_HOURS', 'details', v_hours_check);
  END IF;

  v_eff_height := COALESCE((v_b.vehicle_snapshot->>'height_m')::numeric, public.pf_default_vehicle_height(COALESCE(v_b.vehicle_snapshot->>'vehicle_type', 'car')));

  v_same_space_free := (v_b.space_id IS NOT NULL) AND NOT EXISTS (
    SELECT 1 FROM public.bookings o
     WHERE o.space_id = v_b.space_id
       AND o.id <> v_b.id
       AND (o.status IN ('confirmed', 'checked_in') OR (o.status = 'pending_payment' AND (o.hold_expires_at IS NULL OR o.hold_expires_at > now())))
       AND o.starts_at < p_new_ends_at
       AND v_b.ends_at < o.ends_at
  );

  IF v_same_space_free THEN
    v_target_space_id := v_b.space_id;
  ELSE
    v_target_space_id := public.pf_find_available_space(v_b.facility_id, v_b.starts_at, p_new_ends_at, v_eff_height, v_b.id);
    IF v_target_space_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_AVAILABILITY');
    END IF;
  END IF;

  v_inc_quote := public.pf_calculate_quote_internal(
    v_b.facility_id,
    v_b.ends_at,
    p_new_ends_at,
    COALESCE(v_b.vehicle_snapshot->>'vehicle_type', 'car'),
    v_b.id
  );
  v_inc_amount := (v_inc_quote->>'totalArs')::numeric(12,2);
  v_prev_ends_at := v_b.ends_at;
  v_new_total := v_b.total_amount + v_inc_amount;

  -- Preserve original locked quote while appending extension quote history
  v_extensions := COALESCE(v_b.quote_snapshot->'extensions', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'extendedAt', now(),
    'previousEndsAt', v_prev_ends_at,
    'newEndsAt', p_new_ends_at,
    'incrementalAmount', v_inc_amount,
    'quote', v_inc_quote
  ));

  v_updated_quote_snapshot := COALESCE(v_b.quote_snapshot, '{}'::jsonb) || jsonb_build_object(
    'extensions', v_extensions,
    'originalTotalArs', COALESCE((v_b.quote_snapshot->>'originalTotalArs')::numeric, (v_b.quote_snapshot->>'totalArs')::numeric, v_b.total_amount),
    'totalArs', v_new_total
  );

  UPDATE public.bookings
     SET ends_at = p_new_ends_at,
         space_id = v_target_space_id,
         total_amount = v_new_total,
         quote_snapshot = v_updated_quote_snapshot,
         updated_at = now()
   WHERE id = v_b.id;

  -- Extend active QR token expiry accordingly
  UPDATE public.booking_access_tokens
     SET expires_at = p_new_ends_at + interval '2 hours'
   WHERE booking_id = v_b.id
     AND revoked_at IS NULL;

  INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
  VALUES (
    v_b.id,
    v_uid,
    'extended',
    jsonb_build_object(
      'previous_ends_at', v_prev_ends_at,
      'new_ends_at', p_new_ends_at,
      'incremental_amount', v_inc_amount,
      'new_total_amount', v_new_total
    )
  );

  INSERT INTO public.notifications (user_id, booking_id, kind, message)
  SELECT v_uid, v_b.id, 'extension_offer',
         format('Reserva %s extendida en %s (+ARS %s · nuevo total ARS %s).', v_b.booking_code, v_fac.name, v_inc_amount::bigint, v_new_total::bigint)
   WHERE COALESCE((SELECT enabled FROM public.notification_preferences WHERE user_id = v_uid AND kind = 'extension_offer'), true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'booking.extended',
    'booking',
    v_b.id,
    jsonb_build_object('booking_code', v_b.booking_code, 'incremental_amount', v_inc_amount, 'new_total_amount', v_new_total)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'bookingId', v_b.id,
    'bookingCode', v_b.booking_code,
    'previousEndsAt', v_prev_ends_at,
    'endsAt', p_new_ends_at,
    'incrementalAmount', v_inc_amount,
    'totalAmount', v_new_total,
    'quote', v_updated_quote_snapshot
  );
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_AVAILABILITY');
END;
$$;

REVOKE ALL ON FUNCTION public.pf_extend_booking(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_extend_booking(uuid, timestamptz) TO authenticated;

-- 5.8 Get Authenticated Driver's Bookings with Event History & Strict Lifecycle Categories
-- CRITICAL (Requirement 12): NEVER auto-classify a booking as 'completed' without an explicit
-- operational 'completed' status! A confirmed booking whose window elapsed without check-in/out
-- remains 'confirmed' (categorized as 'upcoming' / awaiting operational verification) rather
-- than falsely marked 'completed'.
CREATE OR REPLACE FUNCTION public.pf_get_my_bookings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'bookings', '[]'::jsonb);
  END IF;

  -- Lazily expire any overdue holds belonging to this user
  UPDATE public.bookings
     SET status = 'expired', updated_at = now()
   WHERE user_id = v_uid
     AND status = 'pending_payment'
     AND hold_expires_at IS NOT NULL
     AND hold_expires_at <= now();

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at_sort DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        b.created_at AS created_at_sort,
        jsonb_build_object(
          'id', b.id,
          'bookingCode', COALESCE(b.booking_code, left(b.id::text, 8)),
          'status', b.status,
          'uiCategory', CASE
            WHEN b.status = 'completed' THEN 'completed'
            WHEN b.status IN ('cancelled', 'expired', 'no_show') THEN 'cancelled'
            WHEN b.status = 'checked_in' THEN 'active'
            WHEN b.status = 'confirmed' AND now() >= b.starts_at AND now() < b.ends_at THEN 'active'
            WHEN b.status = 'pending_payment' THEN 'upcoming'
            ELSE 'upcoming'
          END,
          'awaitingOperationalClosure', (b.status = 'confirmed' AND now() >= b.ends_at),
          'facilityId', b.facility_id,
          'facilitySlug', f.slug,
          'facilityName', f.name,
          'facilityAddress', f.address,
          'lat', f.latitude,
          'lng', f.longitude,
          'spaceId', b.space_id,
          'spaceLabel', ps.label,
          'vehicleId', b.vehicle_id,
          'vehicleSnapshot', b.vehicle_snapshot,
          'startsAt', b.starts_at,
          'endsAt', b.ends_at,
          'totalAmount', b.total_amount,
          'currency', b.currency,
          'paymentMethod', b.payment_method,
          'paymentStatus', COALESCE((SELECT p.status FROM public.payments p WHERE p.booking_id = b.id ORDER BY p.created_at DESC LIMIT 1), 'pending'),
          'isTestPayment', COALESCE((SELECT p.is_test FROM public.payments p WHERE p.booking_id = b.id ORDER BY p.created_at DESC LIMIT 1), true),
          'holdExpiresAt', b.hold_expires_at,
          'cancelledAt', b.cancelled_at,
          'cancellationReason', b.cancellation_reason,
          'cancellationFeeAmount', b.cancellation_fee_amount,
          'quote', b.quote_snapshot,
          'createdAt', b.created_at,
          'events', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', ev.id,
                'eventType', ev.event_type,
                'details', ev.details,
                'createdAt', ev.created_at
              ) ORDER BY ev.created_at ASC
            )
            FROM public.booking_events ev
            WHERE ev.booking_id = b.id
          ), '[]'::jsonb)
        ) AS item
      FROM public.bookings b
      JOIN public.parking_facilities f ON f.id = b.facility_id
      LEFT JOIN public.parking_spaces ps ON ps.id = b.space_id
      WHERE b.user_id = v_uid
    ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'serverTime', now(),
    'bookings', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_get_my_bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_get_my_bookings() TO authenticated;

-- 5.9 Personal Driver Analytics (distinguishes booked_estimated vs simulated_paid vs actual_parked)
CREATE OR REPLACE FUNCTION public.pf_get_my_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_summary jsonb;
  v_monthly jsonb;
  v_frequent jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT jsonb_build_object(
    'totalBookings', COUNT(*),
    'activeOrConfirmedCount', COUNT(*) FILTER (WHERE status IN ('confirmed', 'checked_in')),
    'completedOperationalCount', COUNT(*) FILTER (WHERE status = 'completed'),
    'cancelledCount', COUNT(*) FILTER (WHERE status IN ('cancelled', 'expired', 'no_show')),
    'bookedEstimatedArs', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('confirmed', 'checked_in', 'completed')), 0),
    'simulatedPaidArs', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('confirmed', 'checked_in', 'completed') AND payment_method = 'mercado_pago'), 0),
    'actualParkedHours', COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 3600.0) FILTER (WHERE status = 'completed')::numeric, 2), 0),
    'bookedEstimatedHours', COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 3600.0) FILTER (WHERE status IN ('confirmed', 'checked_in', 'completed'))::numeric, 2), 0)
  )
    INTO v_summary
    FROM public.bookings
   WHERE user_id = v_uid;

  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'month' DESC), '[]'::jsonb)
    INTO v_monthly
    FROM (
      SELECT jsonb_build_object(
        'month', to_char(starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM'),
        'bookingCount', COUNT(*),
        'bookedEstimatedArs', COALESCE(SUM(total_amount), 0),
        'bookedHours', COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 3600.0)::numeric, 2), 0)
      ) AS m
      FROM public.bookings
      WHERE user_id = v_uid
        AND status IN ('confirmed', 'checked_in', 'completed')
      GROUP BY 1
    ) sub;

  SELECT COALESCE(jsonb_agg(fg ORDER BY (fg->>'visits')::int DESC), '[]'::jsonb)
    INTO v_frequent
    FROM (
      SELECT jsonb_build_object(
        'facilitySlug', f.slug,
        'facilityName', f.name,
        'visits', COUNT(*),
        'totalArs', COALESCE(SUM(b.total_amount), 0)
      ) AS fg
      FROM public.bookings b
      JOIN public.parking_facilities f ON f.id = b.facility_id
      WHERE b.user_id = v_uid
        AND b.status IN ('confirmed', 'checked_in', 'completed')
      GROUP BY f.slug, f.name
      LIMIT 5
    ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'provenanceNote', 'bookedEstimatedArs reflects demo bookings; actualParkedHours only counts operationally completed stays (Sprint 3).',
    'summary', v_summary,
    'monthly', v_monthly,
    'frequentGarages', v_frequent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_get_my_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_get_my_analytics() TO authenticated;

-- 5.10 Atomic Set Default Vehicle RPC
CREATE OR REPLACE FUNCTION public.pf_set_default_vehicle(p_vehicle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND user_id = v_uid)
    INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VEHICLE_NOT_FOUND');
  END IF;

  UPDATE public.vehicles SET is_default = false WHERE user_id = v_uid AND id <> p_vehicle_id AND is_default IS TRUE;
  UPDATE public.vehicles SET is_default = true WHERE id = p_vehicle_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'vehicleId', p_vehicle_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pf_set_default_vehicle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_set_default_vehicle(uuid) TO authenticated;

-- 5.11 Sprint 2D Mercado Pago Checkout Pro Architecture Stub (NO real API calls or credentials)
CREATE OR REPLACE FUNCTION public.pf_prepare_mp_checkout_stub(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_p record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_FOUND');
  END IF;

  SELECT * INTO v_p FROM public.payments WHERE booking_id = v_b.id ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'ok', false,
    'code', 'MERCADO_PAGO_NOT_ACTIVATED_SPRINT_2D',
    'message', 'Mercado Pago Checkout Pro preference creation and webhook verification are scheduled for Sprint 2D (Edge Function + test credentials). No real payment was processed.',
    'preparedContract', jsonb_build_object(
      'provider', 'mercado_pago',
      'checkoutMode', 'checkout_pro_test_only',
      'bookingId', v_b.id,
      'externalReference', COALESCE(v_p.external_reference, v_b.booking_code),
      'idempotencyKey', v_p.idempotency_key,
      'amount', v_b.total_amount,
      'currency', v_b.currency,
      'isTest', true,
      'holdExpiresAt', v_b.hold_expires_at,
      'clientCanApprove', false
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pf_prepare_mp_checkout_stub(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_prepare_mp_checkout_stub(uuid) TO authenticated;

-- 5.12 Manual/Authenticated Hold Cleanup RPC
CREATE OR REPLACE FUNCTION public.pf_release_expired_holds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expired integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  v_expired := public.pf_expire_stale_holds_for_facility(NULL);
  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'expiredCount', v_expired);
END;
$$;

REVOKE ALL ON FUNCTION public.pf_release_expired_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pf_release_expired_holds() TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Security Verification Checks (Read-Only Summary)
-- -----------------------------------------------------------------------------
COMMIT;

SELECT
  '01_backend_migration_applied' AS status,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) AS rls_enabled_tables,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) AS rls_disabled_tables,
  has_table_privilege('authenticated', 'public.bookings', 'INSERT') AS direct_booking_insert,
  has_table_privilege('authenticated', 'public.user_roles', 'INSERT') AS direct_role_insert,
  has_table_privilege('anon', 'public.bookings', 'SELECT') AS anonymous_booking_read,
  has_table_privilege('authenticated', 'public.booking_access_tokens', 'SELECT') AS direct_token_read,
  has_table_privilege('authenticated', 'public.payments', 'UPDATE') AS direct_payment_update,
  has_table_privilege('authenticated', 'public.system_settings', 'SELECT') AS direct_settings_read;
