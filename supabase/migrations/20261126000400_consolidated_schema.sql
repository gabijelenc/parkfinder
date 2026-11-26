-- parkFinder consolidated schema; run once after DB01 and parking_facilities.
-- Existing DB02.2 tables are preserved if already created.
BEGIN;
CREATE TABLE IF NOT EXISTS public.parking_amenities (
 facility_id uuid NOT NULL REFERENCES public.parking_facilities(id) ON DELETE CASCADE,
 amenity text NOT NULL CHECK (amenity IN ('covered','security_cctv','ev_charging','accessible','valet','open_24h')),
 available boolean, PRIMARY KEY(facility_id,amenity)
);
CREATE TABLE IF NOT EXISTS public.operating_hours (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid NOT NULL REFERENCES public.parking_facilities(id) ON DELETE CASCADE,
 day_of_week smallint NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), opening_time time, closing_time time,
 is_closed boolean NOT NULL DEFAULT false, is_24_hours boolean NOT NULL DEFAULT false, UNIQUE(facility_id,day_of_week),
 CHECK ((is_closed AND NOT is_24_hours AND opening_time IS NULL AND closing_time IS NULL) OR
 (is_24_hours AND NOT is_closed AND opening_time IS NULL AND closing_time IS NULL) OR
 (NOT is_closed AND NOT is_24_hours AND opening_time IS NOT NULL AND closing_time IS NOT NULL AND opening_time<>closing_time))
);
CREATE TABLE IF NOT EXISTS public.parking_spaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid NOT NULL REFERENCES public.parking_facilities(id),
 label text NOT NULL, max_height_m numeric(4,2) CHECK(max_height_m>0), accessible boolean NOT NULL DEFAULT false,
 ev_charging boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true, UNIQUE(facility_id,label), UNIQUE(id,facility_id)
);
CREATE TABLE IF NOT EXISTS public.facility_vehicle_types (
 facility_id uuid REFERENCES public.parking_facilities(id), vehicle_type text CHECK(vehicle_type IN ('motorcycle','car','suv','van')), PRIMARY KEY(facility_id,vehicle_type)
);
CREATE TABLE IF NOT EXISTS public.parking_owners (
 facility_id uuid REFERENCES public.parking_facilities(id), user_id uuid REFERENCES public.profiles(id), PRIMARY KEY(facility_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.operator_assignments (
 facility_id uuid REFERENCES public.parking_facilities(id), user_id uuid REFERENCES public.profiles(id), PRIMARY KEY(facility_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.vehicles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 plate text NOT NULL, make text, model text, color text, vehicle_type text NOT NULL CHECK(vehicle_type IN ('motorcycle','car','suv','van')),
 height_m numeric(4,2) CHECK(height_m>0), is_default boolean NOT NULL DEFAULT false, UNIQUE(user_id,plate), UNIQUE(id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_one_default ON public.vehicles(user_id) WHERE is_default;
CREATE TABLE IF NOT EXISTS public.favorite_garages (
 user_id uuid REFERENCES public.profiles(id), facility_id uuid REFERENCES public.parking_facilities(id), PRIMARY KEY(user_id,facility_id)
);
CREATE TABLE IF NOT EXISTS public.favorite_destinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 label text NOT NULL, address text, latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS public.pricing_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid REFERENCES public.parking_facilities(id),
 rule_type text NOT NULL CHECK(rule_type IN ('vehicle','occupancy','peak','weekend')), parameters jsonb NOT NULL DEFAULT '{}',
 multiplier numeric(8,4) NOT NULL CHECK(multiplier>0), is_active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 facility_id uuid NOT NULL REFERENCES public.parking_facilities(id), space_id uuid,
 vehicle_id uuid NOT NULL, vehicle_snapshot jsonb NOT NULL DEFAULT '{}',
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','confirmed','checked_in','completed','cancelled','no_show','expired')),
 total_amount numeric(12,2) NOT NULL CHECK(total_amount>=0), currency text NOT NULL DEFAULT 'ARS',
 quote_snapshot jsonb NOT NULL DEFAULT '{}', hold_expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '72 hours'),
 FOREIGN KEY(vehicle_id,user_id) REFERENCES public.vehicles(id,user_id),
 FOREIGN KEY(space_id,facility_id) REFERENCES public.parking_spaces(id,facility_id)
);
CREATE INDEX IF NOT EXISTS bookings_facility_interval ON public.bookings(facility_id,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS public.booking_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES public.bookings(id),
 actor_id uuid REFERENCES public.profiles(id), event_type text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES public.bookings(id),
 provider text NOT NULL CHECK(provider IN ('mercado_pago','pay_at_garage')), provider_reference text UNIQUE,
 idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), amount numeric(12,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL DEFAULT 'ARS', status text NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled','refunded')),
 is_test boolean NOT NULL DEFAULT true CHECK(is_test), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES public.payments(id),
 provider_event_id text UNIQUE, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.booking_access_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES public.bookings(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid NOT NULL REFERENCES public.parking_facilities(id),
 booking_id uuid UNIQUE REFERENCES public.bookings(id), user_id uuid REFERENCES public.profiles(id),
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5), comment text, is_demo boolean NOT NULL DEFAULT false,
 is_published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 booking_id uuid REFERENCES public.bookings(id), kind text NOT NULL, message text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notification_preferences (
 user_id uuid REFERENCES public.profiles(id), kind text, enabled boolean NOT NULL DEFAULT true, PRIMARY KEY(user_id,kind)
);
CREATE TABLE IF NOT EXISTS public.audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES public.profiles(id),
 action text NOT NULL, entity_type text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- All new tables fail closed. Only catalog read access is enabled below.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['parking_amenities','operating_hours','parking_spaces','facility_vehicle_types','parking_owners','operator_assignments','vehicles','favorite_garages','favorite_destinations','pricing_rules','bookings','booking_events','payments','payment_events','booking_access_tokens','reviews','notifications','notification_preferences','audit_logs']
 LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END $$;
GRANT SELECT ON public.parking_amenities,public.operating_hours,public.facility_vehicle_types TO anon,authenticated;
DROP POLICY IF EXISTS amenities_select_active ON public.parking_amenities;
CREATE POLICY amenities_select_active ON public.parking_amenities FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.parking_facilities f WHERE f.id=facility_id AND f.is_active));
DROP POLICY IF EXISTS hours_select_active ON public.operating_hours;
CREATE POLICY hours_select_active ON public.operating_hours FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.parking_facilities f WHERE f.id=facility_id AND f.is_active));
DROP POLICY IF EXISTS vehicle_types_select_active ON public.facility_vehicle_types;
CREATE POLICY vehicle_types_select_active ON public.facility_vehicle_types FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.parking_facilities f WHERE f.id=facility_id AND f.is_active));
COMMIT;
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
