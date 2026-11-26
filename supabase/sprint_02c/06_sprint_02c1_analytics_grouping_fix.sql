-- Sprint 2C.1 follow-up: fix month aggregation in driver analytics.
-- The former GROUP BY 1 grouped by the JSON aggregate expression.
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
    GROUP BY to_char(starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM')
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