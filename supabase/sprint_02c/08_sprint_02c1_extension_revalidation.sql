-- Sprint 2C.1 follow-up: revalidate extension hours/expired holds and outstanding payment totals.
-- Incremental hardening. Reuses existing locks, events, grants, and RLS policies.
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
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id=v_b.id AND p.status='approved') THEN
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


CREATE OR REPLACE FUNCTION public.pf_extend_booking(p_booking_id uuid,p_quote_id uuid)
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
  v_hours jsonb;
  v_payment_id uuid;
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
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id=v_b.id AND p.status='approved') THEN
    RETURN jsonb_build_object('ok',false,'code','PAYMENT_INCREMENT_REQUIRED');
  END IF;
  IF v_b.ends_at <> v_q.current_ends_at OR v_b.total_amount <> v_q.current_total_amount THEN
    UPDATE public.booking_extension_quotes SET state='stale' WHERE id=v_q.id;
    RETURN jsonb_build_object('ok',false,'code','QUOTE_STALE');
  END IF;
  SELECT * INTO v_fac FROM public.parking_facilities WHERE id=v_b.facility_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','FACILITY_NOT_FOUND'); END IF;

  -- Expire stale overlapping holds while the facility lock is held, before allocating extension capacity.
  PERFORM public.pf_expire_stale_holds_for_facility(v_b.facility_id);
  v_hours := public.pf_check_operating_hours(v_b.facility_id,v_b.ends_at,v_q.proposed_ends_at);
  IF NOT COALESCE((v_hours->>'compatible')::boolean,false) THEN
    RETURN jsonb_build_object('ok',false,'code','OUT_OF_HOURS','details',v_hours);
  END IF;

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
  -- Pay-at-garage booking is still pending. Extend its outstanding ledger amount atomically.
  UPDATE public.payments SET amount=amount+v_increment,
    metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
      'last_extension_quote_id',v_q.id,'last_extension_increment',v_increment,
      'outstanding_total',v_new_total
    ), updated_at=now()
   WHERE booking_id=v_b.id AND status='pending' AND provider='pay_at_garage'
   RETURNING id INTO v_payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'code','PAYMENT_INCREMENT_REQUIRED');
  END IF;
  INSERT INTO public.payment_events(payment_id,event_type,raw_status,processed_at)
  VALUES(v_payment_id,'booking_extension_amount_added','pending',now());

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
