-- Sprint 2C.1: server-verified extension quotes and payment-state hardening.
-- Incremental against the live Sprint 2C schema; no table drops and no RLS relaxation.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('pay_at_garage', 'demo_simulated', 'mercado_pago'));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('pay_at_garage', 'demo_simulated', 'mercado_pago'));

CREATE TABLE IF NOT EXISTS public.booking_extension_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.parking_facilities(id),
  current_ends_at timestamptz NOT NULL,
  proposed_ends_at timestamptz NOT NULL,
  current_total_amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  incremental_amount numeric(12,2) NOT NULL CHECK (incremental_amount >= 0),
  new_total_amount numeric(12,2) NOT NULL CHECK (new_total_amount >= 0),
  quote_snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'offered' CHECK (state IN ('offered','expired','stale','applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  applied_at timestamptz,
  applied_booking_id uuid,
  applied_incremental_amount numeric(12,2),
  applied_total_amount numeric(12,2)
);
CREATE INDEX IF NOT EXISTS booking_extension_quotes_user_booking_idx
  ON public.booking_extension_quotes (user_id, booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_extension_quotes_expiry_idx
  ON public.booking_extension_quotes (expires_at) WHERE state = 'offered';
ALTER TABLE public.booking_extension_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_extension_quotes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pf_expire_stale_holds_for_facility(p_facility_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_rec record;
  v_payment_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_rec IN
    UPDATE public.bookings
       SET status = 'expired', updated_at = now()
     WHERE status = 'pending_payment'
       AND hold_expires_at IS NOT NULL
       AND hold_expires_at <= now()
       AND (p_facility_id IS NULL OR facility_id = p_facility_id)
    RETURNING id, user_id, facility_id, booking_code, hold_expires_at
  LOOP
    v_count := v_count + 1;
    v_payment_id := NULL;

    UPDATE public.payments
       SET status = 'cancelled', updated_at = now()
     WHERE booking_id = v_rec.id AND status = 'pending'
     RETURNING id INTO v_payment_id;

    IF v_payment_id IS NOT NULL THEN
      INSERT INTO public.payment_events (payment_id, event_type, raw_status, processed_at)
      VALUES (v_payment_id, 'hold_expired', 'cancelled', now());
    END IF;

    INSERT INTO public.booking_events (booking_id, actor_id, event_type, details)
    VALUES (v_rec.id, NULL, 'hold_expired',
      jsonb_build_object('booking_code',v_rec.booking_code,'hold_expires_at',v_rec.hold_expires_at,'expired_at',now()));

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (NULL, 'booking.hold_expired', 'booking', v_rec.id,
      jsonb_build_object('booking_code',v_rec.booking_code,'facility_id',v_rec.facility_id,'payment_id',v_payment_id));
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pf_preview_booking_extension(p_booking_id uuid, p_new_ends_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_b public.bookings%ROWTYPE;
  v_fac public.parking_facilities%ROWTYPE;
  v_max_hours integer := public.pf_get_setting_int('max_booking_hours',72);
  v_eff_height numeric;
  v_hours jsonb;
  v_space_id uuid;
  v_quote jsonb;
  v_increment numeric(12,2);
  v_quote_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
  SELECT * INTO v_b FROM public.bookings WHERE id=p_booking_id AND user_id=v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','BOOKING_NOT_FOUND'); END IF;
  IF v_b.status NOT IN ('confirmed','checked_in') THEN
    RETURN jsonb_build_object('ok',false,'code','INVALID_EXTENSION_STATUS','currentStatus',v_b.status);
  END IF;
  IF v_b.payment_method='mercado_pago' OR v_b.payment_method='demo_simulated'
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id=v_b.id AND p.status='approved' AND p.provider <> 'pay_at_garage') THEN
    RETURN jsonb_build_object('ok',false,'code','PAYMENT_INCREMENT_REQUIRED');
  END IF;
  IF p_new_ends_at IS NULL OR p_new_ends_at <= v_b.ends_at THEN
    RETURN jsonb_build_object('ok',false,'code','EXTENSION_MUST_BE_LATER');
  END IF;
  IF EXTRACT(EPOCH FROM (p_new_ends_at-v_b.starts_at))/60 > v_max_hours*60 THEN
    RETURN jsonb_build_object('ok',false,'code','EXCEEDS_MAX_DURATION','maxDurationHours',v_max_hours);
  END IF;
  SELECT * INTO v_fac FROM public.parking_facilities WHERE id=v_b.facility_id AND is_active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','FACILITY_NOT_FOUND'); END IF;

  v_hours := public.pf_check_operating_hours(v_b.facility_id,v_b.ends_at,p_new_ends_at);
  IF NOT COALESCE((v_hours->>'compatible')::boolean,false) THEN
    RETURN jsonb_build_object('ok',false,'code','OUT_OF_HOURS','details',v_hours);
  END IF;
  v_eff_height := COALESCE((v_b.vehicle_snapshot->>'height_m')::numeric,
    public.pf_default_vehicle_height(COALESCE(v_b.vehicle_snapshot->>'vehicle_type','car')));
  v_space_id := public.pf_find_available_space(v_b.facility_id,v_b.starts_at,p_new_ends_at,v_eff_height,v_b.id);
  IF v_space_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NO_AVAILABILITY'); END IF;

  v_quote := public.pf_calculate_quote_internal(v_b.facility_id,v_b.ends_at,p_new_ends_at,
    COALESCE(v_b.vehicle_snapshot->>'vehicle_type','car'),v_b.id);
  v_increment := (v_quote->>'totalArs')::numeric(12,2);
  INSERT INTO public.booking_extension_quotes(
    booking_id,user_id,facility_id,current_ends_at,proposed_ends_at,current_total_amount,
    currency,incremental_amount,new_total_amount,quote_snapshot,expires_at
  ) VALUES (
    v_b.id,v_uid,v_b.facility_id,v_b.ends_at,p_new_ends_at,v_b.total_amount,
    v_fac.currency,v_increment,v_b.total_amount+v_increment,v_quote,now()+interval '5 minutes'
  ) RETURNING id INTO v_quote_id;

  RETURN jsonb_build_object('ok',true,'code','OK','quoteId',v_quote_id,
    'quoteExpiresAt',now()+interval '5 minutes','currency',v_fac.currency,
    'bookingId',v_b.id,'currentEndsAt',v_b.ends_at,'proposedEndsAt',p_new_ends_at,
    'currentTotalAmount',v_b.total_amount,'incrementalAmount',v_increment,
    'newTotalAmount',v_b.total_amount+v_increment,'incrementalQuote',v_quote);
END;
$function$;

DROP FUNCTION IF EXISTS public.pf_extend_booking(uuid,timestamptz);
CREATE FUNCTION public.pf_extend_booking(p_booking_id uuid,p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.booking_extension_quotes%ROWTYPE;
  v_b public.bookings%ROWTYPE;
  v_fac public.parking_facilities%ROWTYPE;
  v_eff_height numeric;
  v_space_id uuid;
  v_quote jsonb;
  v_increment numeric(12,2);
  v_new_total numeric(12,2);
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
  SELECT * INTO v_q FROM public.booking_extension_quotes
   WHERE id=p_quote_id AND booking_id=p_booking_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','QUOTE_NOT_FOUND'); END IF;
  IF v_q.state='applied' THEN
    RETURN jsonb_build_object('ok',true,'code','OK','idempotentReplay',true,
      'bookingId',v_q.applied_booking_id,'endsAt',v_q.proposed_ends_at,
      'incrementalAmount',v_q.applied_incremental_amount,'totalAmount',v_q.applied_total_amount);
  END IF;
  IF v_q.state <> 'offered' THEN RETURN jsonb_build_object('ok',false,'code','QUOTE_NOT_VALID'); END IF;
  IF v_q.expires_at <= now() THEN
    UPDATE public.booking_extension_quotes SET state='expired' WHERE id=v_q.id;
    RETURN jsonb_build_object('ok',false,'code','QUOTE_EXPIRED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_q.facility_id::text,0));
  SELECT * INTO v_b FROM public.bookings WHERE id=p_booking_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','BOOKING_NOT_FOUND'); END IF;
  IF v_b.status NOT IN ('confirmed','checked_in') THEN
    RETURN jsonb_build_object('ok',false,'code','INVALID_EXTENSION_STATUS','currentStatus',v_b.status);
  END IF;
  IF v_b.payment_method IN ('mercado_pago','demo_simulated')
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id=v_b.id AND p.status='approved' AND p.provider <> 'pay_at_garage') THEN
    RETURN jsonb_build_object('ok',false,'code','PAYMENT_INCREMENT_REQUIRED');
  END IF;
  IF v_b.ends_at <> v_q.current_ends_at OR v_b.total_amount <> v_q.current_total_amount THEN
    UPDATE public.booking_extension_quotes SET state='stale' WHERE id=v_q.id;
    RETURN jsonb_build_object('ok',false,'code','QUOTE_STALE');
  END IF;
  SELECT * INTO v_fac FROM public.parking_facilities WHERE id=v_b.facility_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','FACILITY_NOT_FOUND'); END IF;

  v_eff_height := COALESCE((v_b.vehicle_snapshot->>'height_m')::numeric,
    public.pf_default_vehicle_height(COALESCE(v_b.vehicle_snapshot->>'vehicle_type','car')));
  v_space_id := public.pf_find_available_space(v_b.facility_id,v_b.starts_at,v_q.proposed_ends_at,v_eff_height,v_b.id);
  IF v_space_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NO_AVAILABILITY'); END IF;

  v_quote := public.pf_calculate_quote_internal(v_b.facility_id,v_b.ends_at,v_q.proposed_ends_at,
    COALESCE(v_b.vehicle_snapshot->>'vehicle_type','car'),v_b.id);
  v_increment := (v_quote->>'totalArs')::numeric(12,2);
  IF v_fac.currency <> v_q.currency OR v_increment <> v_q.incremental_amount
     OR v_b.total_amount+v_increment <> v_q.new_total_amount THEN
    UPDATE public.booking_extension_quotes SET state='stale' WHERE id=v_q.id;
    RETURN jsonb_build_object('ok',false,'code','QUOTE_CHANGED',
      'currentIncrementalAmount',v_increment,'currentTotalAmount',v_b.total_amount+v_increment);
  END IF;

  v_new_total := v_b.total_amount+v_increment;
  UPDATE public.bookings SET ends_at=v_q.proposed_ends_at,space_id=v_space_id,
    total_amount=v_new_total,
    quote_snapshot=COALESCE(v_b.quote_snapshot,'{}'::jsonb) ||
      jsonb_build_object(
        'extensions',COALESCE(v_b.quote_snapshot->'extensions','[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('quoteId',v_q.id,'acceptedAt',now(),
            'previousEndsAt',v_b.ends_at,'newEndsAt',v_q.proposed_ends_at,
            'incrementalAmount',v_increment,'currency',v_fac.currency,'quote',v_quote)),
        'originalTotalArs',COALESCE((v_b.quote_snapshot->>'originalTotalArs')::numeric,
          (v_b.quote_snapshot->>'totalArs')::numeric,v_b.total_amount),
        'totalArs',v_new_total
      ),
    updated_at=now()
  WHERE id=v_b.id;

  UPDATE public.booking_access_tokens SET expires_at=v_q.proposed_ends_at+interval '2 hours'
   WHERE booking_id=v_b.id AND revoked_at IS NULL;
  INSERT INTO public.booking_events(booking_id,actor_id,event_type,details)
  VALUES(v_b.id,v_uid,'extended',jsonb_build_object('quote_id',v_q.id,'previous_ends_at',v_b.ends_at,
    'new_ends_at',v_q.proposed_ends_at,'incremental_amount',v_increment,'new_total_amount',v_new_total));
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,details)
  VALUES(v_uid,'booking.extended','booking',v_b.id,jsonb_build_object('quote_id',v_q.id,
    'incremental_amount',v_increment,'new_total_amount',v_new_total));
  UPDATE public.booking_extension_quotes SET state='applied',accepted_at=now(),applied_at=now(),
    applied_booking_id=v_b.id,applied_incremental_amount=v_increment,applied_total_amount=v_new_total
   WHERE id=v_q.id;
  RETURN jsonb_build_object('ok',true,'code','OK','quoteId',v_q.id,'bookingId',v_b.id,
    'previousEndsAt',v_b.ends_at,'endsAt',v_q.proposed_ends_at,'incrementalAmount',v_increment,
    'totalAmount',v_new_total,'currency',v_fac.currency,'quote',v_quote);
END;
$function$;
REVOKE ALL ON FUNCTION public.pf_extend_booking(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pf_extend_booking(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pf_get_my_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_summary jsonb;
  v_monthly jsonb;
  v_frequent jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;

  SELECT jsonb_build_object(
    'totalBookings',COUNT(*),
    'activeOrConfirmedCount',COUNT(*) FILTER (WHERE b.status IN ('confirmed','checked_in')),
    'completedOperationalCount',COUNT(*) FILTER (WHERE b.status='completed'),
    'cancelledCount',COUNT(*) FILTER (WHERE b.status IN ('cancelled','expired','no_show')),
    'bookedEstimatedArs',COALESCE(SUM(b.total_amount) FILTER (WHERE b.status IN ('pending_payment','confirmed','checked_in','completed')),0),
    'amountPendingArs',COALESCE((SELECT SUM(p.amount) FROM public.payments p JOIN public.bookings bp ON bp.id=p.booking_id
      WHERE bp.user_id=v_uid AND p.status='pending'),0),
    'simulatedPaidArs',COALESCE((SELECT SUM(p.amount) FROM public.payments p JOIN public.bookings bp ON bp.id=p.booking_id
      WHERE bp.user_id=v_uid AND p.provider='demo_simulated' AND p.is_test AND p.status='approved'),0),
    'externallyApprovedArs',COALESCE((SELECT SUM(p.amount) FROM public.payments p JOIN public.bookings bp ON bp.id=p.booking_id
      WHERE bp.user_id=v_uid AND p.provider='mercado_pago' AND NOT p.is_test AND p.status='approved'),0),
    'refundedArs',COALESCE((SELECT SUM(p.amount) FROM public.payments p JOIN public.bookings bp ON bp.id=p.booking_id
      WHERE bp.user_id=v_uid AND p.status='refunded'),0),
    'actualParkedHours',NULL,
    'actualParkedHoursAvailable',false,
    'bookedEstimatedHours',COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (b.ends_at-b.starts_at))/3600.0)
      FILTER (WHERE b.status IN ('confirmed','checked_in','completed'))::numeric,2),0)
  ) INTO v_summary FROM public.bookings b WHERE b.user_id=v_uid;

  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'month' DESC),'[]'::jsonb) INTO v_monthly
  FROM (
    SELECT jsonb_build_object('month',to_char(starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM'),
      'bookingCount',COUNT(*),'bookedEstimatedArs',COALESCE(SUM(total_amount),0),
      'bookedHours',COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (ends_at-starts_at))/3600.0)::numeric,2),0)) AS m
    FROM public.bookings WHERE user_id=v_uid AND status IN ('confirmed','checked_in','completed')
    GROUP BY 1
  ) sub;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'visits')::int DESC),'[]'::jsonb) INTO v_frequent
  FROM (
    SELECT jsonb_build_object('facilitySlug',f.slug,'facilityName',f.name,'visits',COUNT(*),
      'totalArs',COALESCE(SUM(b.total_amount),0)) AS x
    FROM public.bookings b JOIN public.parking_facilities f ON f.id=b.facility_id
    WHERE b.user_id=v_uid AND b.status IN ('confirmed','checked_in','completed')
    GROUP BY f.slug,f.name ORDER BY COUNT(*) DESC LIMIT 5
  ) sub;

  RETURN jsonb_build_object('ok',true,'code','OK',
    'provenanceNote','Booked and pending amounts are estimates; simulated amounts are internal demo only; external approvals require verified provider events. Effective parking duration is unavailable until Sprint 3 check-in/check-out events exist.',
    'summary',v_summary,'monthly',v_monthly,'frequentGarages',v_frequent);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pf_create_booking_hold(p_facility_id uuid, p_vehicle_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_payment_method text DEFAULT 'pay_at_garage'::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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

  IF p_payment_method = 'mercado_pago' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_METHOD_NOT_AVAILABLE', 'paymentMethod', 'mercado_pago');
  END IF;
  IF p_payment_method NOT IN ('pay_at_garage', 'demo_simulated') THEN
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
$function$


CREATE OR REPLACE FUNCTION public.pf_confirm_booking_demo(p_booking_id uuid, p_payment_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_fac record;
  v_method text;
  v_raw_token text;
  v_token_hash text;
  v_payment_id uuid;
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
    PERFORM public.pf_expire_stale_holds_for_facility(v_b.facility_id);
    RETURN jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED');
  END IF;

  IF p_payment_method IS NOT NULL AND p_payment_method <> v_b.payment_method THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_METHOD_MISMATCH');
  END IF;
  v_method := v_b.payment_method;
  IF v_method = 'mercado_pago' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_VERIFICATION_REQUIRED');
  END IF;
  IF v_method NOT IN ('pay_at_garage', 'demo_simulated') THEN
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
     SET provider = CASE WHEN v_method = 'demo_simulated' THEN 'demo_simulated' ELSE 'pay_at_garage' END,
         status = CASE WHEN v_method = 'demo_simulated' THEN 'approved' ELSE 'pending' END,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'confirmed_mode', CASE WHEN v_method = 'demo_simulated' THEN 'explicit_demo_simulation' ELSE 'pay_at_garage' END,
           'real_payment', false, 'externally_verified', false, 'client_cannot_approve', true
         ),
         updated_at = now()
   WHERE booking_id = v_b.id AND status = 'pending'
   RETURNING id INTO v_payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_RECORD_NOT_FOUND');
  END IF;
  INSERT INTO public.payment_events (payment_id, event_type, raw_status, processed_at)
  VALUES (v_payment_id,
    CASE WHEN v_method = 'demo_simulated' THEN 'demo_simulated_confirmation' ELSE 'pay_at_garage_confirmation' END,
    CASE WHEN v_method = 'demo_simulated' THEN 'approved_simulated' ELSE 'pending' END, now());

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
$function$

