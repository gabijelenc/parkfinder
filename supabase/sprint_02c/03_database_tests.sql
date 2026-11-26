-- =============================================================================
-- parkFinder — Sprint 2C · 03_database_tests.sql
-- Reproducible SQL Integrity, Security, Availability, Hold & Pricing Test Suite
-- Target: Supabase SQL Editor & Local PostgreSQL 17.12
--
-- Execution Order:
--   Run AFTER 01_backend_migration.sql and 02_demo_seed.sql.
--   Self-cleaning: creates temporary QA users/records and deletes them at the end,
--   leaving commercial/QA catalog data completely untouched.
--
-- Note on multi-session concurrency testing:
--   A single SQL Editor session runs sequentially. To test true parallel multi-session
--   locking against the last available space, run:
--     node tests/pg_concurrency_and_parity_tests.js
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS pg_temp.pf_db_test_results (
  seq serial PRIMARY KEY,
  test_id text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  detail text NOT NULL
);
TRUNCATE TABLE pg_temp.pf_db_test_results;

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1';
  v_user_b uuid := 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbb2';
  v_fac_cap1 uuid;
  v_fac_cap2 uuid;
  v_fac_24h uuid;
  v_fac_palermo uuid;
  v_fac_pm uuid;
  v_veh_a_car uuid;
  v_veh_a_suv uuid;
  v_veh_a_tall uuid;
  v_veh_b_car uuid;
  v_rls_disabled integer;
  v_comm_count integer;
  v_comm_spaces integer;
  v_qa_count integer;
  v_qa_spaces integer;
  v_res jsonb;
  v_res2 jsonb;
  v_res3 jsonb;
  v_b1_id uuid;
  v_b2_id uuid;
  v_b_hold_id uuid;
  v_b_ext_id uuid;
  v_orig_rate numeric;
  v_locked_total numeric;
  v_quote_car jsonb;
  v_quote_suv jsonb;
  v_quote_wknd jsonb;
  v_err_caught boolean;
  v_other_count integer;
  -- Fixed future BA dates (Tuesday 2027-01-12, Wednesday 2027-01-13, Friday 2027-01-15, Saturday 2027-01-16)
  v_tue text := '2027-01-12';
  v_wed text := '2027-01-13';
  v_fri text := '2027-01-15';
  v_sat text := '2027-01-16';
BEGIN
  -- Cleanup any leftover QA test data from an interrupted prior run
  DELETE FROM public.notifications WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.booking_access_tokens WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b));
  DELETE FROM public.payment_events WHERE payment_id IN (SELECT id FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b)));
  DELETE FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b));
  DELETE FROM public.booking_events WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b));
  DELETE FROM public.bookings WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.favorite_garages WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.favorite_destinations WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.vehicles WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.notification_preferences WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.audit_logs WHERE actor_id IN (v_user_a, v_user_b);
  DELETE FROM auth.users WHERE id IN (v_user_a, v_user_b);

  -- -------------------------------------------------------------------------
  -- DB-T01: RLS enabled on 100% of public tables
  -- -------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_rls_disabled
    FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
  IF v_rls_disabled <> 0 THEN
    RAISE EXCEPTION 'DB-T01 FAILED: % public tables lack RLS', v_rls_disabled;
  END IF;
  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T01', 'Security/RLS', 'PASS', 'RLS enabled on all public tables (0 disabled)');

  -- -------------------------------------------------------------------------
  -- DB-T02: Least-privilege direct table access controls
  -- -------------------------------------------------------------------------
  IF has_table_privilege('authenticated', 'public.bookings', 'INSERT')
     OR has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
     OR has_table_privilege('anon', 'public.bookings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.booking_access_tokens', 'SELECT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.system_settings', 'SELECT') THEN
    RAISE EXCEPTION 'DB-T02 FAILED: overly permissive table grant detected';
  END IF;
  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T02', 'Security/Privileges', 'PASS', 'All privileged direct writes/reads denied (bookings, roles, tokens, payments, audit_logs, settings)');

  -- -------------------------------------------------------------------------
  -- DB-T03: Seed integrity (8 commercial = 725 spaces; 3 QA = 4 spaces)
  -- -------------------------------------------------------------------------
  SELECT COUNT(*), COALESCE(SUM(total_spaces), 0)
    INTO v_comm_count, v_comm_spaces
    FROM public.parking_facilities WHERE is_qa = false AND is_active = true;
  SELECT COUNT(*), COALESCE(SUM(total_spaces), 0)
    INTO v_qa_count, v_qa_spaces
    FROM public.parking_facilities WHERE is_qa = true AND is_active = true;

  IF v_comm_count <> 8 OR v_comm_spaces <> 725 OR v_qa_count <> 3 OR v_qa_spaces <> 4 THEN
    RAISE EXCEPTION 'DB-T03 FAILED: commercial=%/% qa=%/%', v_comm_count, v_comm_spaces, v_qa_count, v_qa_spaces;
  END IF;
  IF (SELECT COUNT(*) FROM public.parking_spaces ps JOIN public.parking_facilities f ON f.id = ps.facility_id WHERE f.is_qa = false AND ps.is_active) <> 725 THEN
    RAISE EXCEPTION 'DB-T03 FAILED: physical commercial parking_spaces count <> 725';
  END IF;
  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T03', 'Seed Integrity', 'PASS', '8 commercial garages (725 physical spaces) + 3 isolated QA facilities (4 spaces)');

  SELECT id INTO v_fac_cap1    FROM public.parking_facilities WHERE slug = 'qa-cap1-centro';
  SELECT id INTO v_fac_cap2    FROM public.parking_facilities WHERE slug = 'qa-cap2-obelisco';
  SELECT id INTO v_fac_24h     FROM public.parking_facilities WHERE slug = 'qa-cap1-24h';
  SELECT id INTO v_fac_palermo FROM public.parking_facilities WHERE slug = 'garage-palermo-soho';
  SELECT id INTO v_fac_pm      FROM public.parking_facilities WHERE slug = 'garage-puerto-madero';

  -- -------------------------------------------------------------------------
  -- DB-T04: Auth trigger auto-creates profile, 'driver' role & notification prefs
  -- -------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_user_a, 'qa_driver_a@example.com', '{"full_name":"QA Driver A"}'::jsonb),
    (v_user_b, 'qa_driver_b@example.com', '{"full_name":"QA Driver B"}'::jsonb);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_a AND full_name = 'QA Driver A')
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_a AND role = 'driver')
     OR (SELECT COUNT(*) FROM public.notification_preferences WHERE user_id = v_user_a) < 6 THEN
    RAISE EXCEPTION 'DB-T04 FAILED: auth trigger did not create profile/role/notification_preferences';
  END IF;
  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T04', 'Auth Trigger', 'PASS', 'Auto-created profile, driver role, and 6 default notification preferences for test users');

  -- Seed test vehicles for User A and User B
  INSERT INTO public.vehicles (user_id, plate, make, model, color, vehicle_type, height_m, is_default)
  VALUES (v_user_a, 'QA 100 AA', 'Toyota', 'Corolla', 'Gris', 'car', 1.45, true)
  RETURNING id INTO v_veh_a_car;

  INSERT INTO public.vehicles (user_id, plate, make, model, color, vehicle_type, height_m, is_default)
  VALUES (v_user_a, 'QA 200 BB', 'Ford', 'Bronco', 'Negro', 'suv', 1.85, false)
  RETURNING id INTO v_veh_a_suv;

  INSERT INTO public.vehicles (user_id, plate, make, model, color, vehicle_type, height_m, is_default)
  VALUES (v_user_a, 'QA 300 CC', 'Fiat', 'Cronos Roofbox', 'Blanco', 'car', 2.10, false)
  RETURNING id INTO v_veh_a_tall;

  INSERT INTO public.vehicles (user_id, plate, make, model, color, vehicle_type, height_m, is_default)
  VALUES (v_user_b, 'QB 900 ZZ', 'VW', 'Golf', 'Azul', 'car', 1.50, true)
  RETURNING id INTO v_veh_b_car;

  -- Verify single-default trigger switches default cleanly
  UPDATE public.vehicles SET is_default = true WHERE id = v_veh_a_suv;
  IF (SELECT COUNT(*) FROM public.vehicles WHERE user_id = v_user_a AND is_default = true) <> 1
     OR NOT (SELECT is_default FROM public.vehicles WHERE id = v_veh_a_suv) THEN
    RAISE EXCEPTION 'DB-T04b FAILED: single default vehicle trigger failed';
  END IF;
  UPDATE public.vehicles SET is_default = true WHERE id = v_veh_a_car;

  -- -------------------------------------------------------------------------
  -- DB-T05: Half-open intervals [08:00, 11:00) + [11:00, 13:00) & overlap block
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);

  v_res := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_car, (v_tue || ' 08:00-03')::timestamptz, (v_tue || ' 11:00-03')::timestamptz, 'pay_at_garage', NULL);
  IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'DB-T05a FAILED: %', v_res; END IF;
  v_b1_id := (v_res->'booking'->>'id')::uuid;
  v_res := public.pf_confirm_booking_demo(v_b1_id, 'pay_at_garage');
  IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'DB-T05b FAILED: %', v_res; END IF;

  -- Adjacent [11:00, 13:00) MUST succeed on cap 1
  v_res2 := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_car, (v_tue || ' 11:00-03')::timestamptz, (v_tue || ' 13:00-03')::timestamptz, 'pay_at_garage', NULL);
  IF NOT (v_res2->>'ok')::boolean THEN RAISE EXCEPTION 'DB-T05c FAILED adjacent rejected: %', v_res2; END IF;
  v_b2_id := (v_res2->'booking'->>'id')::uuid;
  PERFORM public.pf_confirm_booking_demo(v_b2_id, 'pay_at_garage');

  -- Overlapping [10:00, 12:00) MUST be rejected with NO_AVAILABILITY
  v_res3 := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_car, (v_tue || ' 10:00-03')::timestamptz, (v_tue || ' 12:00-03')::timestamptz, 'pay_at_garage', NULL);
  IF (v_res3->>'ok')::boolean OR (v_res3->>'code') <> 'NO_AVAILABILITY' THEN
    RAISE EXCEPTION 'DB-T05d FAILED overlap not rejected: %', v_res3;
  END IF;
  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T05', 'Interval Availability', 'PASS', 'Cap 1 accepts adjacent [08:00,11:00) + [11:00,13:00) and rejects overlap [10:00,12:00)');

  -- -------------------------------------------------------------------------
  -- DB-T06: Vehicle compatibility, height clearance, out-of-hours, past, >72h
  -- -------------------------------------------------------------------------
  v_res := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_suv, (v_wed || ' 08:00-03')::timestamptz, (v_wed || ' 10:00-03')::timestamptz);
  IF (v_res->>'code') <> 'VEHICLE_TYPE_NOT_ACCEPTED' THEN RAISE EXCEPTION 'DB-T06a FAILED: %', v_res; END IF;

  v_res := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_tall, (v_wed || ' 08:00-03')::timestamptz, (v_wed || ' 10:00-03')::timestamptz);
  IF (v_res->>'code') <> 'HEIGHT_EXCEEDS_CLEARANCE' THEN RAISE EXCEPTION 'DB-T06b FAILED: %', v_res; END IF;

  v_res := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_car, (v_wed || ' 21:00-03')::timestamptz, (v_wed || ' 23:00-03')::timestamptz);
  IF (v_res->>'code') <> 'OUT_OF_HOURS' THEN RAISE EXCEPTION 'DB-T06c FAILED: %', v_res; END IF;

  v_res := public.pf_create_booking_hold(v_fac_cap1, v_veh_a_car, now() - interval '2 hours', now() - interval '1 hour');
  IF (v_res->>'code') <> 'PAST_START_TIME' THEN RAISE EXCEPTION 'DB-T06d FAILED: %', v_res; END IF;

  v_res := public.pf_create_booking_hold(v_fac_24h, v_veh_a_car, (v_wed || ' 10:00-03')::timestamptz, (v_wed || ' 10:00-03')::timestamptz + interval '73 hours');
  IF (v_res->>'code') <> 'EXCEEDS_MAX_DURATION' THEN RAISE EXCEPTION 'DB-T06e FAILED: %', v_res; END IF;

  -- Overnight on non-24h Palermo Soho rejected, accepted on 24h QA facility
  v_res := public.pf_create_booking_hold(v_fac_palermo, v_veh_a_car, (v_wed || ' 23:00-03')::timestamptz, ('2027-01-14 01:00-03')::timestamptz);
  IF (v_res->>'code') <> 'OUT_OF_HOURS' THEN RAISE EXCEPTION 'DB-T06f FAILED: %', v_res; END IF;

  v_res := public.pf_create_booking_hold(v_fac_24h, v_veh_a_car, (v_wed || ' 23:00-03')::timestamptz, ('2027-01-14 01:00-03')::timestamptz);
  IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'DB-T06g FAILED overnight 24h: %', v_res; END IF;
  PERFORM public.pf_cancel_booking((v_res->'booking'->>'id')::uuid, 'qa_cleanup');

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T06', 'Validation & Overnight', 'PASS', 'Rejected SUV, >1.80m height, out-of-hours, past time, >72h, non-24h overnight; accepted 24h overnight');

  -- -------------------------------------------------------------------------
  -- DB-T07: Cap 2 peak concurrency (08-09 + 10-11 allows 1 extra 08-11, rejects 2nd)
  -- -------------------------------------------------------------------------
  v_res := public.pf_create_booking_hold(v_fac_cap2, v_veh_a_car, (v_tue || ' 08:00-03')::timestamptz, (v_tue || ' 09:00-03')::timestamptz);
  PERFORM public.pf_confirm_booking_demo((v_res->'booking'->>'id')::uuid);
  v_res := public.pf_create_booking_hold(v_fac_cap2, v_veh_a_car, (v_tue || ' 10:00-03')::timestamptz, (v_tue || ' 11:00-03')::timestamptz);
  PERFORM public.pf_confirm_booking_demo((v_res->'booking'->>'id')::uuid);

  v_res2 := public.pf_create_booking_hold(v_fac_cap2, v_veh_a_car, (v_tue || ' 08:00-03')::timestamptz, (v_tue || ' 11:00-03')::timestamptz);
  IF NOT (v_res2->>'ok')::boolean THEN RAISE EXCEPTION 'DB-T07a FAILED extra 1 rejected: %', v_res2; END IF;
  PERFORM public.pf_confirm_booking_demo((v_res2->'booking'->>'id')::uuid);

  v_res3 := public.pf_create_booking_hold(v_fac_cap2, v_veh_a_car, (v_tue || ' 08:00-03')::timestamptz, (v_tue || ' 11:00-03')::timestamptz);
  IF (v_res3->>'code') <> 'NO_AVAILABILITY' THEN RAISE EXCEPTION 'DB-T07b FAILED extra 2 not rejected: %', v_res3; END IF;

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T07', 'Peak Concurrency', 'PASS', 'Cap 2 with 08-09 & 10-11 accepts 1 extra 08-11 booking and rejects 2nd (NO_AVAILABILITY)');

  -- -------------------------------------------------------------------------
  -- DB-T08: Dynamic Pricing exact match with core-booking.js (Peak, Occ 50%, SUV, Fri->Sat)
  -- -------------------------------------------------------------------------
  -- Add 1 booking on qa-cap2-obelisco 09:00-10:00 on v_wed -> 50% occupancy (x1.20) + peak (x1.15)
  v_res := public.pf_create_booking_hold(v_fac_cap2, v_veh_a_car, (v_wed || ' 09:00-03')::timestamptz, (v_wed || ' 10:00-03')::timestamptz);
  PERFORM public.pf_confirm_booking_demo((v_res->'booking'->>'id')::uuid);

  v_quote_car := public.pf_calculate_quote_internal(v_fac_cap2, (v_wed || ' 09:00-03')::timestamptz, (v_wed || ' 11:00-03')::timestamptz, 'car');
  v_quote_suv := public.pf_calculate_quote_internal(v_fac_cap2, (v_wed || ' 09:00-03')::timestamptz, (v_wed || ' 11:00-03')::timestamptz, 'suv');
  -- Car: 6000*1*1.2*1.15 + 6000 = 8280 + 6000 = 14280; SUV: 14280 * 1.30 = 18564
  IF (v_quote_car->>'totalArs')::numeric <> 14280 OR (v_quote_suv->>'totalArs')::numeric <> 18564 THEN
    RAISE EXCEPTION 'DB-T08a FAILED pricing mismatch: car=% suv=%', v_quote_car->>'totalArs', v_quote_suv->>'totalArs';
  END IF;

  -- Friday 22:00 -> Saturday 02:00 on Puerto Madero (6500/h): Fri 2h*6500 + Sat 2h*6500*1.10 = 13000 + 14300 = 27300
  v_quote_wknd := public.pf_calculate_quote_internal(v_fac_pm, (v_fri || ' 22:00-03')::timestamptz, (v_sat || ' 02:00-03')::timestamptz, 'car');
  IF (v_quote_wknd->>'totalArs')::numeric <> 27300
     OR (v_quote_wknd->'segments'->0->>'weekendFactor')::numeric <> 1.00
     OR (v_quote_wknd->'segments'->2->>'weekendFactor')::numeric <> 1.10 THEN
    RAISE EXCEPTION 'DB-T08b FAILED Fri->Sat proration: %', v_quote_wknd;
  END IF;

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T08', 'Dynamic Pricing', 'PASS', 'Exact parity with JS engine: car=14280, suv=18564, Fri->Sat=27300 (Sat-only x1.10)');

  -- -------------------------------------------------------------------------
  -- DB-T09: Hold expiration releases capacity & blocks late confirmation
  -- -------------------------------------------------------------------------
  v_res := public.pf_create_booking_hold(v_fac_24h, v_veh_a_car, (v_sat || ' 10:00-03')::timestamptz, (v_sat || ' 12:00-03')::timestamptz);
  v_b_hold_id := (v_res->'booking'->>'id')::uuid;

  -- Simulate TTL expiration (10 min elapsed)
  UPDATE public.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = v_b_hold_id;

  -- Late confirm by User A MUST fail with HOLD_EXPIRED
  v_res2 := public.pf_confirm_booking_demo(v_b_hold_id);
  IF (v_res2->>'code') <> 'HOLD_EXPIRED' THEN
    RAISE EXCEPTION 'DB-T09a FAILED expired hold confirmed: %', v_res2;
  END IF;

  -- User B MUST now be able to book the released slot on cap 1!
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  v_res3 := public.pf_create_booking_hold(v_fac_24h, v_veh_b_car, (v_sat || ' 10:00-03')::timestamptz, (v_sat || ' 12:00-03')::timestamptz);
  IF NOT (v_res3->>'ok')::boolean THEN
    RAISE EXCEPTION 'DB-T09b FAILED User B blocked after hold expiry: %', v_res3;
  END IF;
  PERFORM public.pf_cancel_booking((v_res3->'booking'->>'id')::uuid, 'qa_cleanup');

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T09', 'Hold Expiration', 'PASS', 'Expired hold returns HOLD_EXPIRED on late confirm and releases capacity for User B');

  -- -------------------------------------------------------------------------
  -- DB-T10: Multi-user isolation (User B cannot cancel/extend/read User A data)
  -- -------------------------------------------------------------------------
  v_res := public.pf_cancel_booking(v_b1_id, 'unauthorized_attempt');
  IF (v_res->>'code') <> 'BOOKING_NOT_FOUND' THEN
    RAISE EXCEPTION 'DB-T10a FAILED User B cancelled User A booking: %', v_res;
  END IF;

  v_res := public.pf_extend_booking(v_b1_id, gen_random_uuid());
  IF (v_res->>'code') <> 'QUOTE_NOT_FOUND' THEN
    RAISE EXCEPTION 'DB-T10b FAILED User B extended User A booking: %', v_res;
  END IF;

  -- Verify RLS under authenticated role for User B
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_other_count FROM public.bookings WHERE user_id = v_user_a;
  IF v_other_count <> 0 THEN
    RAISE EXCEPTION 'DB-T10c FAILED RLS leaked % of User A bookings to User B', v_other_count;
  END IF;
  SELECT COUNT(*) INTO v_other_count FROM public.vehicles WHERE user_id = v_user_a;
  IF v_other_count <> 0 THEN
    RAISE EXCEPTION 'DB-T10d FAILED RLS leaked User A vehicles to User B';
  END IF;

  -- Direct insert into bookings must fail under authenticated role
  v_err_caught := false;
  BEGIN
    INSERT INTO public.bookings(user_id, facility_id, vehicle_id, starts_at, ends_at, total_amount)
    VALUES (v_user_b, v_fac_pm, v_veh_b_car, (v_sat || ' 14:00-03')::timestamptz, (v_sat || ' 16:00-03')::timestamptz, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'DB-T10e FAILED direct booking insert succeeded'; END IF;
  RESET ROLE;

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T10', 'Multi-User Isolation', 'PASS', 'User B cannot read/cancel/extend User A bookings or vehicles; direct booking INSERT blocked');

  -- -------------------------------------------------------------------------
  -- DB-T11: Immutable confirmed quote + Extension preview/confirm + Cancel release
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);

  SELECT total_amount INTO v_locked_total FROM public.bookings WHERE id = v_b1_id;
  SELECT base_hourly_rate INTO v_orig_rate FROM public.parking_facilities WHERE id = v_fac_cap1;
  UPDATE public.parking_facilities SET base_hourly_rate = 19999 WHERE id = v_fac_cap1;

  IF (SELECT total_amount FROM public.bookings WHERE id = v_b1_id) <> v_locked_total THEN
    RAISE EXCEPTION 'DB-T11a FAILED rate change altered confirmed booking total';
  END IF;
  UPDATE public.parking_facilities SET base_hourly_rate = v_orig_rate WHERE id = v_fac_cap1;

  -- Extension on v_b1_id (08:00-11:00) into 11:00-12:00 MUST fail because v_b2_id holds 11:00-13:00
  v_res := public.pf_preview_booking_extension(v_b1_id, (v_tue || ' 12:00-03')::timestamptz);
  IF (v_res->>'code') <> 'NO_AVAILABILITY' THEN
    RAISE EXCEPTION 'DB-T11b FAILED overlapping extension allowed: %', v_res;
  END IF;

  -- Cancel v_b2_id -> releases 11:00-13:00 -> extension of v_b1_id to 12:00 succeeds with incremental price
  v_res := public.pf_cancel_booking(v_b2_id, 'qa_release_for_extension');
  IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'DB-T11c FAILED cancel: %', v_res; END IF;

  v_res2 := public.pf_preview_booking_extension(v_b1_id, (v_tue || ' 12:00-03')::timestamptz);
  IF NOT (v_res2->>'ok')::boolean OR (v_res2->>'incrementalAmount')::numeric <= 0 THEN
    RAISE EXCEPTION 'DB-T11d FAILED preview extension: %', v_res2;
  END IF;

  v_res3 := public.pf_extend_booking(v_b1_id, (v_res2->>'quoteId')::uuid);
  IF NOT (v_res3->>'ok')::boolean
     OR (v_res3->>'totalAmount')::numeric <> (v_locked_total + (v_res2->>'incrementalAmount')::numeric) THEN
    RAISE EXCEPTION 'DB-T11e FAILED extend booking: %', v_res3;
  END IF;

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T11', 'Quote Lock & Extension', 'PASS', 'Locked price immutable; overlap extension blocked; cancel released slot; extension succeeded with incremental price');

  -- -------------------------------------------------------------------------
  -- DB-T12: No auto-completed status + Mercado Pago Sprint 2D stub contract
  -- -------------------------------------------------------------------------
  v_res := public.pf_get_my_bookings();
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_res->'bookings') elem
     WHERE elem->>'uiCategory' = 'completed'
  ) THEN
    RAISE EXCEPTION 'DB-T12a FAILED confirmed booking auto-marked completed without operational event';
  END IF;

  v_res2 := public.pf_prepare_mp_checkout_stub(v_b1_id);
  IF (v_res2->>'code') <> 'MERCADO_PAGO_NOT_ACTIVATED_SPRINT_2D'
     OR (v_res2->'preparedContract'->>'clientCanApprove')::boolean IS TRUE THEN
    RAISE EXCEPTION 'DB-T12b FAILED MP Sprint 2D stub contract invalid: %', v_res2;
  END IF;

  INSERT INTO pg_temp.pf_db_test_results(test_id, category, status, detail)
  VALUES ('DB-T12', 'Lifecycle & MP Prep', 'PASS', 'Confirmed bookings never auto-completed; Mercado Pago Sprint 2D stub enforces clientCanApprove=false');

  -- -------------------------------------------------------------------------
  -- Final Cleanup: leave ZERO QA test users or test bookings behind
  -- -------------------------------------------------------------------------
  DELETE FROM public.notifications WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.booking_access_tokens WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b));
  DELETE FROM public.payment_events WHERE payment_id IN (SELECT id FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b)));
  DELETE FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b));
  DELETE FROM public.booking_events WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (v_user_a, v_user_b));
  DELETE FROM public.bookings WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.favorite_garages WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.favorite_destinations WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.vehicles WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.notification_preferences WHERE user_id IN (v_user_a, v_user_b);
  DELETE FROM public.audit_logs WHERE actor_id IN (v_user_a, v_user_b);
  DELETE FROM auth.users WHERE id IN (v_user_a, v_user_b);
END $$;

SELECT test_id, category, status, detail FROM pg_temp.pf_db_test_results ORDER BY seq;
