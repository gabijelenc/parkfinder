-- parkFinder Sprint 2C: keep QA facilities out of the client-facing table catalog.
-- RPC catalog calls already exclude QA unless explicitly requested; this policy
-- also prevents direct anon/authenticated table reads from surfacing QA facilities.
BEGIN;

DROP POLICY IF EXISTS facilities_select_active ON public.parking_facilities;
CREATE POLICY facilities_select_active
  ON public.parking_facilities
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_qa = false);

COMMIT;
