-- DB security: self-service driver data; operational writes remain server-only.
BEGIN;
-- Harden initial tables against inherited PUBLIC privileges.
REVOKE ALL ON public.profiles,public.user_roles,public.parking_facilities FROM PUBLIC;
-- Owner-scoped self-service tables.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['vehicles','favorite_garages','favorite_destinations','notification_preferences']
 LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',t);
  EXECUTE format('DROP POLICY IF EXISTS own_rows ON public.%I',t);
  EXECUTE format('CREATE POLICY own_rows ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))',t);
 END LOOP;
END $$;
-- Reservations and financial records: clients may read own records only.
GRANT SELECT ON public.bookings,public.booking_events,public.payments,public.notifications TO authenticated;
DROP POLICY IF EXISTS bookings_read_own ON public.bookings;
CREATE POLICY bookings_read_own ON public.bookings FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS booking_events_read_own ON public.booking_events;
CREATE POLICY booking_events_read_own ON public.booking_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND b.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS payments_read_own ON public.payments;
CREATE POLICY payments_read_own ON public.payments FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND b.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS notifications_read_own ON public.notifications;
CREATE POLICY notifications_read_own ON public.notifications FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
DROP POLICY IF EXISTS notifications_mark_own ON public.notifications;
CREATE POLICY notifications_mark_own ON public.notifications FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
-- Public demo ratings only: never expose user IDs or booking IDs.
GRANT SELECT(id,facility_id,rating,comment,is_demo,is_published,created_at) ON public.reviews TO anon,authenticated;
DROP POLICY IF EXISTS reviews_public_demo ON public.reviews;
CREATE POLICY reviews_public_demo ON public.reviews FOR SELECT TO anon,authenticated USING (is_demo AND is_published AND EXISTS(SELECT 1 FROM public.parking_facilities f WHERE f.id=facility_id AND f.is_active));
-- User may read own assignments; cannot grant own privileges.
GRANT SELECT ON public.parking_owners,public.operator_assignments TO authenticated;
DROP POLICY IF EXISTS owners_read_own ON public.parking_owners;
CREATE POLICY owners_read_own ON public.parking_owners FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS operators_read_own ON public.operator_assignments;
CREATE POLICY operators_read_own ON public.operator_assignments FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
-- No client access to booking_access_tokens, payment_events, audit_logs, parking_spaces, pricing_rules.
-- No direct client booking/payment/role writes. Operator and owner scoped operations pending server RPCs.
COMMIT;
SELECT tablename, count(*) AS policies FROM pg_policies WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;
SELECT has_table_privilege('authenticated','public.bookings','INSERT') AS direct_booking_insert, has_table_privilege('authenticated','public.user_roles','INSERT') AS direct_role_insert, has_table_privilege('anon','public.bookings','SELECT') AS anonymous_booking_read, has_table_privilege('authenticated','public.booking_access_tokens','SELECT') AS direct_token_read;
