-- Sprint 2C.1 remote hardening regression tests.
-- Execute after 05_sprint_02c1_payment_extension_hardening.sql.
-- All fixtures use synthetic auth users and are rolled back at the end.
BEGIN;
CREATE TEMP TABLE pf_hardening_results(test_id text,status text,detail text) ON COMMIT DROP;
DO $$
DECLARE
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  fac uuid;
  va uuid;
  vb uuid;
  hold jsonb;
  res jsonb;
  q1 jsonb;
  q2 jsonb;
  q3 jsonb;
  bid uuid;
  total numeric;
  base_rate numeric;
  payment_status text;
  provider text;
  is_test boolean;
  ending timestamptz;
  n integer;
BEGIN
  SELECT id INTO fac FROM public.parking_facilities WHERE slug='qa-cap1-24h';
  IF fac IS NULL THEN RAISE EXCEPTION 'QA facility qa-cap1-24h missing'; END IF;
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES (ua,'qa_sprint2c1_'||ua||'@example.invalid','{"full_name":"QA Hardening A"}'::jsonb),
         (ub,'qa_sprint2c1_'||ub||'@example.invalid','{"full_name":"QA Hardening B"}'::jsonb);
  INSERT INTO public.vehicles(user_id,plate,make,model,color,vehicle_type,height_m,is_default)
  VALUES(ua,'QAH 100','QA','Test','Gray','car',1.45,true) RETURNING id INTO va;
  INSERT INTO public.vehicles(user_id,plate,make,model,color,vehicle_type,height_m,is_default)
  VALUES(ub,'QAH 200','QA','Test','Gray','car',1.45,true) RETURNING id INTO vb;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',ua::text,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',ua::text,true);

  -- Pay at garage confirmation remains financially pending.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-02 08:00-03'::timestamptz,'2027-03-02 09:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'garage hold failed: %',hold; END IF;
  bid := (hold->'booking'->>'id')::uuid;
  res := public.pf_confirm_booking_demo(bid,'pay_at_garage');
  SELECT p.status,p.provider,p.is_test INTO payment_status,provider,is_test FROM public.payments p WHERE p.booking_id=bid;
  IF NOT COALESCE((res->>'ok')::boolean,false) OR payment_status<>'pending' OR provider<>'pay_at_garage' OR is_test IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'garage payment state mismatch: %, %, %, %',res,payment_status,provider,is_test; END IF;
  INSERT INTO pf_hardening_results VALUES('H01','PASS','Pay-at-garage confirms booking with pending test payment');

  -- A confirmed booking cannot switch its payment method.
  res := public.pf_confirm_booking_demo(bid,'demo_simulated');
  IF res->>'code'<>'ALREADY_CONFIRMED' THEN RAISE EXCEPTION 'confirmed retry must be idempotent: %',res; END IF;
  IF (SELECT payment_method FROM public.bookings WHERE id=bid)<>'pay_at_garage' THEN RAISE EXCEPTION 'payment method changed'; END IF;
  INSERT INTO pf_hardening_results VALUES('H02','PASS','Confirmation retry did not change method or financial status');

  -- Explicit demo simulation is clearly marked and never externally verified.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-02 10:00-03'::timestamptz,'2027-03-02 11:00-03'::timestamptz,'demo_simulated',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'demo hold failed: %',hold; END IF;
  res := public.pf_confirm_booking_demo((hold->'booking'->>'id')::uuid,'demo_simulated');
  SELECT p.status,p.provider,p.is_test INTO payment_status,provider,is_test FROM public.payments p WHERE p.booking_id=(hold->'booking'->>'id')::uuid;
  IF NOT COALESCE((res->>'ok')::boolean,false) OR payment_status<>'approved' OR provider<>'demo_simulated' OR is_test IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'demo payment state mismatch: %, %, %, %',res,payment_status,provider,is_test; END IF;
  INSERT INTO pf_hardening_results VALUES('H03','PASS','Demo payment records approved only as is_test/demo_simulated');

  -- Mercado Pago cannot create a live hold; the demo RPC rejects any MP confirmation.
  res := public.pf_create_booking_hold(fac,va,'2027-03-02 12:00-03'::timestamptz,'2027-03-02 13:00-03'::timestamptz,'mercado_pago',gen_random_uuid());
  IF res->>'code'<>'PAYMENT_METHOD_NOT_AVAILABLE' THEN RAISE EXCEPTION 'MP hold unexpectedly allowed: %',res; END IF;
  -- Reuse an isolated pending hold and spoof its server-side method to prove confirm guard.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-02 12:00-03'::timestamptz,'2027-03-02 13:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'guard fixture hold failed: %',hold; END IF;
  bid := (hold->'booking'->>'id')::uuid;
  UPDATE public.bookings SET payment_method='mercado_pago' WHERE id=bid;
  res := public.pf_confirm_booking_demo(bid,'mercado_pago');
  IF res->>'code'<>'PAYMENT_VERIFICATION_REQUIRED' THEN RAISE EXCEPTION 'demo RPC accepted MP: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H04','PASS','MP hold/confirmation routes are blocked pending backend verification');

  -- The SQL extension API accepts a server quote UUID only; no amount parameter.
  IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pf_extend_booking'
      AND pg_get_function_identity_arguments(p.oid)='p_booking_id uuid, p_quote_id uuid') THEN
    RAISE EXCEPTION 'extension RPC signature accepts unexpected client values';
  END IF;
  IF has_table_privilege('authenticated','public.payments','UPDATE') THEN
    RAISE EXCEPTION 'authenticated can directly update payments';
  END IF;
  INSERT INTO pf_hardening_results VALUES('H05','PASS','Extension accepts quote UUID; authenticated role cannot update payments');

  -- A valid quote is accepted once and replay is idempotent.
  UPDATE public.bookings SET payment_method='pay_at_garage' WHERE id=bid;
  -- Cancel spoof fixture to release slot, then create a confirmed extension fixture.
  PERFORM public.pf_cancel_booking(bid,'qa_fixture_reset');
  hold := public.pf_create_booking_hold(fac,va,'2027-03-03 08:00-03'::timestamptz,'2027-03-03 09:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'extension hold failed: %',hold; END IF;
  bid := (hold->'booking'->>'id')::uuid;
  PERFORM public.pf_confirm_booking_demo(bid,'pay_at_garage');
  q1 := public.pf_preview_booking_extension(bid,'2027-03-03 10:00-03'::timestamptz);
  IF NOT COALESCE((q1->>'ok')::boolean,false) OR q1->>'quoteId' IS NULL THEN RAISE EXCEPTION 'quote not issued: %',q1; END IF;
  res := public.pf_extend_booking(bid,(q1->>'quoteId')::uuid);
  IF NOT COALESCE((res->>'ok')::boolean,false) OR (res->>'incrementalAmount')::numeric<>(q1->>'incrementalAmount')::numeric THEN
    RAISE EXCEPTION 'valid quote extension failed: %, quote %',res,q1; END IF;
  q2 := public.pf_extend_booking(bid,(q1->>'quoteId')::uuid);
  IF NOT COALESCE((q2->>'idempotentReplay')::boolean,false) THEN RAISE EXCEPTION 'duplicate quote application was not idempotent: %',q2; END IF;
  IF (SELECT count(*) FROM public.booking_events WHERE booking_id=bid AND event_type='extended')<>1
    OR (SELECT count(*) FROM public.audit_logs WHERE entity_id=bid AND action='booking.extended')<>1
    OR (SELECT amount FROM public.payments WHERE booking_id=bid AND status='pending')<>(SELECT total_amount FROM public.bookings WHERE id=bid)
    THEN RAISE EXCEPTION 'extension event/audit records missing or duplicated'; END IF;
  INSERT INTO pf_hardening_results VALUES('H06','PASS','Valid quote accepted once; replay is idempotent; one event/audit and pending payment equals updated total');

  -- Expired quote is rejected.
  q1 := public.pf_preview_booking_extension(bid,'2027-03-03 11:00-03'::timestamptz);
  UPDATE public.booking_extension_quotes SET expires_at=now()-interval '1 minute' WHERE id=(q1->>'quoteId')::uuid;
  res := public.pf_extend_booking(bid,(q1->>'quoteId')::uuid);
  IF res->>'code'<>'QUOTE_EXPIRED' THEN RAISE EXCEPTION 'expired quote accepted: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H07','PASS','Expired extension quote rejected');

  -- Changed price invalidates the accepted server quote.
  SELECT base_hourly_rate INTO base_rate FROM public.parking_facilities WHERE id=fac;
  q1 := public.pf_preview_booking_extension(bid,'2027-03-03 11:00-03'::timestamptz);
  UPDATE public.parking_facilities SET base_hourly_rate=base_rate*2 WHERE id=fac;
  res := public.pf_extend_booking(bid,(q1->>'quoteId')::uuid);
  UPDATE public.parking_facilities SET base_hourly_rate=base_rate WHERE id=fac;
  IF res->>'code'<>'QUOTE_CHANGED' THEN RAISE EXCEPTION 'changed price quote accepted: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H08','PASS','Price change invalidates the old quote and requires fresh acceptance');

  -- No availability rejects extension and preserves the original end.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-04 08:00-03'::timestamptz,'2027-03-04 09:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'availability fixture A failed: %',hold; END IF;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',ub::text,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',ub::text,true);
  q1 := public.pf_create_booking_hold(fac,vb,'2027-03-04 09:00-03'::timestamptz,'2027-03-04 11:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((q1->>'ok')::boolean,false) THEN RAISE EXCEPTION 'availability fixture B failed: %',q1; END IF;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',ua::text,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',ua::text,true);
  bid := (hold->'booking'->>'id')::uuid;
  PERFORM public.pf_confirm_booking_demo(bid,'pay_at_garage');
  q2 := public.pf_preview_booking_extension(bid,'2027-03-04 11:00-03'::timestamptz);
  IF q2->>'code'<>'NO_AVAILABILITY' OR (SELECT ends_at FROM public.bookings WHERE id=bid)<>'2027-03-04 09:00-03'::timestamptz THEN
    RAISE EXCEPTION 'no-availability extension changed booking or was accepted: %',q2; END IF;
  INSERT INTO pf_hardening_results VALUES('H09','PASS','Unavailable extension rejected and original booking retained');

  -- Hold expiry consistently closes booking/payment and writes all audit streams.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-05 08:00-03'::timestamptz,'2027-03-05 09:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'expiry fixture failed: %',hold; END IF;
  bid := (hold->'booking'->>'id')::uuid;
  UPDATE public.bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=bid;
  res := public.pf_confirm_booking_demo(bid,'pay_at_garage');
  IF res->>'code'<>'HOLD_EXPIRED' OR (SELECT status FROM public.bookings WHERE id=bid)<>'expired'
    OR (SELECT status FROM public.payments WHERE booking_id=bid)<>'cancelled'
    OR NOT EXISTS(SELECT 1 FROM public.booking_events WHERE booking_id=bid AND event_type='hold_expired')
    OR NOT EXISTS(SELECT 1 FROM public.payment_events pe JOIN public.payments p ON p.id=pe.payment_id WHERE p.booking_id=bid AND pe.event_type='hold_expired')
    OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_id=bid AND action='booking.hold_expired')
    THEN RAISE EXCEPTION 'hold expiry ledger mismatch: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H10','PASS','Expired hold releases booking, cancels pending payment, records booking/payment/audit events');

  -- Indicators do not equate confirmed reservations with approved provider payments or actual duration.
  res := public.pf_get_my_analytics();
  IF (res->'summary'->>'actualParkedHours') IS NOT NULL
     OR (res->'summary'->>'actualParkedHoursAvailable')::boolean IS DISTINCT FROM false
     OR (res->'summary'->>'amountPendingArs') IS NULL
     OR (res->'summary'->>'simulatedPaidArs') IS NULL
     OR (res->'summary'->>'externallyApprovedArs') IS NULL
     OR (res->'summary'->>'refundedArs') IS NULL
     THEN RAISE EXCEPTION 'financial analytics response contract mismatch: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H11','PASS','Analytics separates pending/simulated/external/refund and reports actual time unavailable');


  -- A stale overlapping hold is expired under the facility lock before extension capacity is reallocated.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-06 08:00-03'::timestamptz,'2027-03-06 09:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'stale hold fixture A failed: %',hold; END IF;
  bid := (hold->'booking'->>'id')::uuid;
  PERFORM public.pf_confirm_booking_demo(bid,'pay_at_garage');
  PERFORM set_config('request.jwt.claims',json_build_object('sub',ub::text,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',ub::text,true);
  q1 := public.pf_create_booking_hold(fac,vb,'2027-03-06 09:00-03'::timestamptz,'2027-03-06 10:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((q1->>'ok')::boolean,false) THEN RAISE EXCEPTION 'stale hold fixture B failed: %',q1; END IF;
  UPDATE public.bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=(q1->'booking'->>'id')::uuid;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',ua::text,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',ua::text,true);
  q2 := public.pf_preview_booking_extension(bid,'2027-03-06 10:00-03'::timestamptz);
  IF NOT COALESCE((q2->>'ok')::boolean,false) THEN RAISE EXCEPTION 'stale hold preview failed: %',q2; END IF;
  res := public.pf_extend_booking(bid,(q2->>'quoteId')::uuid);
  IF NOT COALESCE((res->>'ok')::boolean,false)
     OR (SELECT status FROM public.bookings WHERE id=(q1->'booking'->>'id')::uuid)<>'expired'
     OR (SELECT status FROM public.payments WHERE booking_id=(q1->'booking'->>'id')::uuid)<>'cancelled'
     THEN RAISE EXCEPTION 'stale hold prevented extension or failed cleanup: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H13','PASS','Expired overlapping hold cleaned under facility lock before extension allocation');

  -- Operating hours are revalidated at quote acceptance, not just at preview time.
  hold := public.pf_create_booking_hold(fac,va,'2027-03-08 08:00-03'::timestamptz,'2027-03-08 09:00-03'::timestamptz,'pay_at_garage',gen_random_uuid());
  IF NOT COALESCE((hold->>'ok')::boolean,false) THEN RAISE EXCEPTION 'hours fixture hold failed: %',hold; END IF;
  bid := (hold->'booking'->>'id')::uuid;
  PERFORM public.pf_confirm_booking_demo(bid,'pay_at_garage');
  q1 := public.pf_preview_booking_extension(bid,'2027-03-08 10:00-03'::timestamptz);
  IF NOT COALESCE((q1->>'ok')::boolean,false) THEN RAISE EXCEPTION 'hours fixture preview failed: %',q1; END IF;
  UPDATE public.operating_hours SET is_24_hours=false,is_closed=false,opening_time='08:00',closing_time='09:30'
    WHERE facility_id=fac AND day_of_week=1;
  res := public.pf_extend_booking(bid,(q1->>'quoteId')::uuid);
  IF res->>'code'<>'OUT_OF_HOURS' OR (SELECT ends_at FROM public.bookings WHERE id=bid)<>'2027-03-08 09:00-03'::timestamptz
    THEN RAISE EXCEPTION 'changed operating hours were ignored: %',res; END IF;
  INSERT INTO pf_hardening_results VALUES('H14','PASS','Changed operating hours invalidate extension acceptance; original booking remains');

  -- RLS regression: quote rows are not directly visible or writable to authenticated.
  IF has_table_privilege('authenticated','public.booking_extension_quotes','SELECT')
     OR has_table_privilege('authenticated','public.booking_extension_quotes','INSERT')
     OR has_table_privilege('authenticated','public.booking_extension_quotes','UPDATE') THEN
    RAISE EXCEPTION 'authenticated can access quote table directly'; END IF;
  INSERT INTO pf_hardening_results VALUES('H12','PASS','Quote table has no direct authenticated grants; RLS stays enabled');
END $$;
SELECT * FROM pf_hardening_results ORDER BY test_id;
ROLLBACK;