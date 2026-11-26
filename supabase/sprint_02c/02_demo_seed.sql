-- =============================================================================
-- parkFinder — Sprint 2C · 02_demo_seed.sql
-- Consolidated, Reproducible & Idempotent Synthetic Data Seed
-- Target: Supabase PostgreSQL 17.12 (Project: parkfinder-dev / qerrmfdpxbjwmeprwrbc)
--
-- Execution Order:
--   Run AFTER 01_backend_migration.sql.
--   Safe to re-run multiple times without duplicating any rows.
--
-- Contents (ALL DATA IS EXPLICITLY MARKED AS SYNTHETIC / DEMO):
--   - 8 synthetic commercial Buenos Aires garages matching core-booking.js (725 spaces total)
--   - 3 isolated synthetic QA scenario facilities (capacity 1 & 2, is_qa = true, 4 spaces)
--   - Physical parking_spaces (725 commercial + 4 QA)
--   - Tri-state parking_amenities (true / false / NULL)
--   - 7-day operating_hours per facility
--   - Accepted facility_vehicle_types
--   - 24 synthetic demo reviews (3 per commercial garage, is_demo = true, no Google attribution)
--   - Active global pricing_rules matching reglas_negocio_v01.md R04 & core-booking.js
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Upsert 8 Synthetic Commercial Garages (Total: 725 spaces) + 3 QA Scenarios
-- -----------------------------------------------------------------------------
INSERT INTO public.parking_facilities (
  slug, name, address, city, latitude, longitude,
  base_hourly_rate, currency, max_height_m, total_spaces,
  is_active, is_demo, is_qa, data_provenance,
  rating_score, review_count, main_image, gallery_json
)
VALUES
  -- 8 Commercial Synthetic Demo Garages (is_qa = false)
  (
    'garage-puerto-madero',
    'Garage Puerto Madero',
    'Av. del Sol 1141, Puerto Madero, CABA',
    'Buenos Aires',
    -34.6074, -58.3610,
    6500.00, 'ARS', 2.40, 120,
    true, true, false, 'synthetic_demo',
    4.80, 142, 'assets/garages/puerto-madero-main.svg',
    '[
      {"src":"assets/garages/puerto-madero-main.svg","captionEs":"Acceso cubierto y sector EV · Puerto Madero","captionEn":"Covered entrance & EV bay · Puerto Madero","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-ev-zone.svg","captionEs":"Sector ilustrativo de carga eléctrica EV","captionEn":"Illustrative EV charging zone","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-interior-bays.svg","captionEs":"Plazas señalizadas con sensores de cupo","captionEn":"Marked bays with space sensors","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-security-access.svg","captionEs":"Barrera de acceso y monitoreo CCTV 24 hs","captionEn":"Access gate & 24/7 CCTV monitoring","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'garage-palermo-soho',
    'Garage Palermo Soho',
    'Gurruchaga 1500, Palermo Soho, CABA',
    'Buenos Aires',
    -34.5885, -58.4290,
    5600.00, 'ARS', 2.00, 80,
    true, true, false, 'synthetic_demo',
    4.60, 98, 'assets/garages/palermo-soho-main.svg',
    '[
      {"src":"assets/garages/palermo-soho-main.svg","captionEs":"Fachada urbana cubierta · Palermo Soho","captionEn":"Covered urban facade · Palermo Soho","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-interior-bays.svg","captionEs":"Nivel cubierto y señalización interna","captionEn":"Covered level & interior signage","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-ev-zone.svg","captionEs":"Puesto ilustrativo de carga eléctrica","captionEn":"Illustrative EV charging stall","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'garage-obelisco',
    'Garage Obelisco Centro',
    'Av. Corrientes 1240, Microcentro, CABA',
    'Buenos Aires',
    -34.6049, -58.3778,
    6000.00, 'ARS', 2.60, 150,
    true, true, false, 'synthetic_demo',
    4.40, 215, 'assets/garages/obelisco-main.svg',
    '[
      {"src":"assets/garages/obelisco-main.svg","captionEs":"Playa 24 hs en Microcentro · Av. Corrientes","captionEn":"24/7 Downtown deck · Av. Corrientes","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-security-access.svg","captionEs":"Ingreso controlado con lectura de patente","captionEn":"Controlled gate with entry monitoring","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-walkway-exit.svg","captionEs":"Salida peatonal iluminada hacia Corrientes","captionEn":"Illuminated pedestrian exit to Corrientes","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'garage-recoleta',
    'Garage Recoleta Centro',
    'Av. Santa Fe 1500, Recoleta, CABA',
    'Buenos Aires',
    -34.5975, -58.3895,
    6200.00, 'ARS', 1.95, 90,
    true, true, false, 'synthetic_demo',
    4.70, 118, 'assets/garages/recoleta-main.svg',
    '[
      {"src":"assets/garages/recoleta-main.svg","captionEs":"Acceso techado con recepción valet · Recoleta","captionEn":"Covered entrance with valet desk · Recoleta","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-interior-bays.svg","captionEs":"Plazas cubiertas señalizadas","captionEn":"Marked covered bays","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-walkway-exit.svg","captionEs":"Ascensor y salida peatonal accesible","captionEn":"Elevator & accessible pedestrian lobby","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'parqueon-hospital-italiano',
    'Parqueón Hospital Italiano',
    'Tte. Gral. Perón 4190, Almagro, CABA',
    'Buenos Aires',
    -34.6076, -58.4262,
    4800.00, 'ARS', 3.00, 100,
    true, true, false, 'synthetic_demo',
    4.30, 76, 'assets/garages/hospital-italiano-main.svg',
    '[
      {"src":"assets/garages/hospital-italiano-main.svg","captionEs":"Playa accesible de gran altura libre · Almagro","captionEn":"Accessible high-clearance lot · Almagro","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-walkway-exit.svg","captionEs":"Sendero peatonal accesible a pasos del hospital","captionEn":"Accessible walkway steps from the hospital","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-security-access.svg","captionEs":"Monitoreo continuo y barrera 24 hs","captionEn":"Continuous monitoring & 24/7 barrier","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'parqueon-san-telmo',
    'Parqueón San Telmo',
    'Av. Defensa 830, San Telmo, CABA',
    'Buenos Aires',
    -34.6146, -58.3730,
    4500.00, 'ARS', 2.10, 60,
    true, true, false, 'synthetic_demo',
    4.10, 54, 'assets/garages/san-telmo-main.svg',
    '[
      {"src":"assets/garages/san-telmo-main.svg","captionEs":"Playa urbana 24 hs · San Telmo","captionEn":"24/7 urban lot · San Telmo","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-security-access.svg","captionEs":"Acceso iluminado sobre Av. Defensa","captionEn":"Lit entrance on Av. Defensa","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-interior-bays.svg","captionEs":"Distribución ilustrativa de plazas","captionEn":"Illustrative bay layout","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'garage-colegiales',
    'Garage Colegiales',
    'Av. Federico Lacroze 2200, Colegiales, CABA',
    'Buenos Aires',
    -34.5739, -58.4552,
    3900.00, 'ARS', 1.80, 70,
    true, true, false, 'synthetic_demo',
    4.50, 63, 'assets/garages/colegiales-main.svg',
    '[
      {"src":"assets/garages/colegiales-main.svg","captionEs":"Cochera cubierta compacta · Colegiales","captionEn":"Compact covered garage · Colegiales","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-interior-bays.svg","captionEs":"Plazas cubiertas para motos y autos","captionEn":"Covered bays for motorcycles & cars","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-security-access.svg","captionEs":"Portón controlado y CCTV","captionEn":"Controlled gate & CCTV","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  (
    'garage-chacarita',
    'Garage Chacarita',
    'Av. Corrientes 6150, Chacarita, CABA',
    'Buenos Aires',
    -34.5919, -58.4403,
    3500.00, 'ARS', 2.80, 55,
    true, true, false, 'synthetic_demo',
    3.90, 41, 'assets/garages/chacarita-main.svg',
    '[
      {"src":"assets/garages/chacarita-main.svg","captionEs":"Playa abierta económica 24 hs · Chacarita","captionEn":"Budget 24/7 open lot · Chacarita","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-security-access.svg","captionEs":"Ingreso amplio sobre Av. Corrientes","captionEn":"Wide entry on Av. Corrientes","provenance":"illustrative_svg_demo"},
      {"src":"assets/garages/gallery-walkway-exit.svg","captionEs":"Salida directa a estación de subte B","captionEn":"Direct walk to Subway Line B","provenance":"illustrative_svg_demo"}
    ]'::jsonb
  ),
  -- 3 Isolated Synthetic QA Scenario Facilities (is_qa = true; hidden from commercial catalog by default)
  (
    'qa-cap1-centro',
    'QA Garage Capacidad 1 (Compacto)',
    'Lavalle 900, Microcentro, CABA (Sintético QA)',
    'Buenos Aires',
    -34.6022, -58.3792,
    6000.00, 'ARS', 1.80, 1,
    true, true, true, 'synthetic_qa',
    4.50, 24, 'assets/garages/colegiales-main.svg',
    '[{"src":"assets/garages/colegiales-main.svg","captionEs":"Ilustración QA Capacidad 1","captionEn":"QA Capacity 1 Illustration","provenance":"illustrative_svg_demo"}]'::jsonb
  ),
  (
    'qa-cap2-obelisco',
    'QA Garage Capacidad 2 (24 hs)',
    'Av. 9 de Julio 1050, Microcentro, CABA (Sintético QA)',
    'Buenos Aires',
    -34.6056, -58.3815,
    6000.00, 'ARS', 2.50, 2,
    true, true, true, 'synthetic_qa',
    4.80, 40, 'assets/garages/puerto-madero-main.svg',
    '[{"src":"assets/garages/puerto-madero-main.svg","captionEs":"Ilustración QA Capacidad 2","captionEn":"QA Capacity 2 Illustration","provenance":"illustrative_svg_demo"}]'::jsonb
  ),
  (
    'qa-cap1-24h',
    'QA Garage Capacidad 1 (24 hs Nocturno)',
    'Av. de Mayo 780, Microcentro, CABA (Sintético QA)',
    'Buenos Aires',
    -34.6088, -58.3775,
    5000.00, 'ARS', 2.20, 1,
    true, true, true, 'synthetic_qa',
    4.60, 19, 'assets/garages/obelisco-main.svg',
    '[{"src":"assets/garages/obelisco-main.svg","captionEs":"Ilustración QA 24 hs Nocturno","captionEn":"QA 24/7 Overnight Illustration","provenance":"illustrative_svg_demo"}]'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  base_hourly_rate = EXCLUDED.base_hourly_rate,
  currency = EXCLUDED.currency,
  max_height_m = EXCLUDED.max_height_m,
  total_spaces = EXCLUDED.total_spaces,
  is_active = EXCLUDED.is_active,
  is_demo = EXCLUDED.is_demo,
  is_qa = EXCLUDED.is_qa,
  data_provenance = EXCLUDED.data_provenance,
  rating_score = EXCLUDED.rating_score,
  review_count = EXCLUDED.review_count,
  main_image = EXCLUDED.main_image,
  gallery_json = EXCLUDED.gallery_json,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. Seed Tri-State Amenities (true = yes, false = no, NULL = unknown/not reported)
-- -----------------------------------------------------------------------------
INSERT INTO public.parking_amenities (facility_id, amenity, available)
SELECT f.id, v.amenity, v.available
FROM (
  VALUES
    -- Puerto Madero
    ('garage-puerto-madero', 'covered', true),
    ('garage-puerto-madero', 'security_cctv', true),
    ('garage-puerto-madero', 'ev_charging', true),
    ('garage-puerto-madero', 'accessible', true),
    ('garage-puerto-madero', 'valet', true),
    ('garage-puerto-madero', 'open_24h', true),
    -- Palermo Soho (accessible = NULL / unknown)
    ('garage-palermo-soho', 'covered', true),
    ('garage-palermo-soho', 'security_cctv', true),
    ('garage-palermo-soho', 'ev_charging', true),
    ('garage-palermo-soho', 'accessible', NULL::boolean),
    ('garage-palermo-soho', 'valet', false),
    ('garage-palermo-soho', 'open_24h', false),
    -- Obelisco Centro
    ('garage-obelisco', 'covered', false),
    ('garage-obelisco', 'security_cctv', true),
    ('garage-obelisco', 'ev_charging', false),
    ('garage-obelisco', 'accessible', true),
    ('garage-obelisco', 'valet', false),
    ('garage-obelisco', 'open_24h', true),
    -- Recoleta Centro
    ('garage-recoleta', 'covered', true),
    ('garage-recoleta', 'security_cctv', true),
    ('garage-recoleta', 'ev_charging', false),
    ('garage-recoleta', 'accessible', true),
    ('garage-recoleta', 'valet', true),
    ('garage-recoleta', 'open_24h', true),
    -- Hospital Italiano (ev_charging = NULL)
    ('parqueon-hospital-italiano', 'covered', false),
    ('parqueon-hospital-italiano', 'security_cctv', true),
    ('parqueon-hospital-italiano', 'ev_charging', NULL::boolean),
    ('parqueon-hospital-italiano', 'accessible', true),
    ('parqueon-hospital-italiano', 'valet', false),
    ('parqueon-hospital-italiano', 'open_24h', true),
    -- San Telmo (security_cctv = NULL)
    ('parqueon-san-telmo', 'covered', false),
    ('parqueon-san-telmo', 'security_cctv', NULL::boolean),
    ('parqueon-san-telmo', 'ev_charging', false),
    ('parqueon-san-telmo', 'accessible', false),
    ('parqueon-san-telmo', 'valet', false),
    ('parqueon-san-telmo', 'open_24h', true),
    -- Colegiales (accessible = NULL)
    ('garage-colegiales', 'covered', true),
    ('garage-colegiales', 'security_cctv', true),
    ('garage-colegiales', 'ev_charging', false),
    ('garage-colegiales', 'accessible', NULL::boolean),
    ('garage-colegiales', 'valet', false),
    ('garage-colegiales', 'open_24h', false),
    -- Chacarita (valet = NULL)
    ('garage-chacarita', 'covered', false),
    ('garage-chacarita', 'security_cctv', false),
    ('garage-chacarita', 'ev_charging', false),
    ('garage-chacarita', 'accessible', false),
    ('garage-chacarita', 'valet', NULL::boolean),
    ('garage-chacarita', 'open_24h', true),
    -- QA Scenarios
    ('qa-cap1-centro', 'covered', true),
    ('qa-cap1-centro', 'security_cctv', true),
    ('qa-cap1-centro', 'ev_charging', false),
    ('qa-cap1-centro', 'accessible', NULL::boolean),
    ('qa-cap1-centro', 'valet', false),
    ('qa-cap1-centro', 'open_24h', false),
    ('qa-cap2-obelisco', 'covered', true),
    ('qa-cap2-obelisco', 'security_cctv', true),
    ('qa-cap2-obelisco', 'ev_charging', true),
    ('qa-cap2-obelisco', 'accessible', true),
    ('qa-cap2-obelisco', 'valet', false),
    ('qa-cap2-obelisco', 'open_24h', true),
    ('qa-cap1-24h', 'covered', true),
    ('qa-cap1-24h', 'security_cctv', true),
    ('qa-cap1-24h', 'ev_charging', NULL::boolean),
    ('qa-cap1-24h', 'accessible', true),
    ('qa-cap1-24h', 'valet', false),
    ('qa-cap1-24h', 'open_24h', true)
) AS v(slug, amenity, available)
JOIN public.parking_facilities f ON f.slug = v.slug
ON CONFLICT (facility_id, amenity) DO UPDATE SET available = EXCLUDED.available;

-- -----------------------------------------------------------------------------
-- 3. Seed 7-Day Operating Hours (0=Sunday .. 6=Saturday)
-- -----------------------------------------------------------------------------
INSERT INTO public.operating_hours (facility_id, day_of_week, opening_time, closing_time, is_closed, is_24_hours)
SELECT
  f.id,
  d.dow::smallint,
  s.open_t,
  s.close_t,
  false,
  s.is_24h
FROM (
  VALUES
    ('garage-puerto-madero',       NULL::time,     NULL::time,     true),
    ('garage-palermo-soho',        '07:00'::time,  '22:00'::time,  false),
    ('garage-obelisco',            NULL::time,     NULL::time,     true),
    ('garage-recoleta',            NULL::time,     NULL::time,     true),
    ('parqueon-hospital-italiano', NULL::time,     NULL::time,     true),
    ('parqueon-san-telmo',         NULL::time,     NULL::time,     true),
    ('garage-colegiales',          '07:00'::time,  '21:00'::time,  false),
    ('garage-chacarita',           NULL::time,     NULL::time,     true),
    ('qa-cap1-centro',             '07:00'::time,  '22:00'::time,  false),
    ('qa-cap2-obelisco',           NULL::time,     NULL::time,     true),
    ('qa-cap1-24h',                NULL::time,     NULL::time,     true)
) AS s(slug, open_t, close_t, is_24h)
JOIN public.parking_facilities f ON f.slug = s.slug
CROSS JOIN generate_series(0, 6) AS d(dow)
ON CONFLICT (facility_id, day_of_week) DO UPDATE SET
  opening_time = EXCLUDED.opening_time,
  closing_time = EXCLUDED.closing_time,
  is_closed = EXCLUDED.is_closed,
  is_24_hours = EXCLUDED.is_24_hours;

-- -----------------------------------------------------------------------------
-- 4. Seed Accepted Vehicle Types per Facility
-- -----------------------------------------------------------------------------
INSERT INTO public.facility_vehicle_types (facility_id, vehicle_type)
SELECT f.id, v.vtype
FROM (
  VALUES
    ('garage-puerto-madero', 'motorcycle'), ('garage-puerto-madero', 'car'), ('garage-puerto-madero', 'suv'), ('garage-puerto-madero', 'van'),
    ('garage-palermo-soho', 'motorcycle'),  ('garage-palermo-soho', 'car'),  ('garage-palermo-soho', 'suv'),
    ('garage-obelisco', 'car'),             ('garage-obelisco', 'suv'),      ('garage-obelisco', 'van'),
    ('garage-recoleta', 'car'),             ('garage-recoleta', 'suv'),
    ('parqueon-hospital-italiano', 'motorcycle'), ('parqueon-hospital-italiano', 'car'), ('parqueon-hospital-italiano', 'suv'), ('parqueon-hospital-italiano', 'van'),
    ('parqueon-san-telmo', 'motorcycle'),   ('parqueon-san-telmo', 'car'),   ('parqueon-san-telmo', 'suv'),
    ('garage-colegiales', 'motorcycle'),    ('garage-colegiales', 'car'),
    ('garage-chacarita', 'motorcycle'),     ('garage-chacarita', 'car'),     ('garage-chacarita', 'suv'),     ('garage-chacarita', 'van'),
    ('qa-cap1-centro', 'motorcycle'),       ('qa-cap1-centro', 'car'),
    ('qa-cap2-obelisco', 'motorcycle'),     ('qa-cap2-obelisco', 'car'),     ('qa-cap2-obelisco', 'suv'),     ('qa-cap2-obelisco', 'van'),
    ('qa-cap1-24h', 'motorcycle'),          ('qa-cap1-24h', 'car'),          ('qa-cap1-24h', 'suv')
) AS v(slug, vtype)
JOIN public.parking_facilities f ON f.slug = v.slug
ON CONFLICT (facility_id, vehicle_type) DO NOTHING;

-- Remove any stale vehicle types if facility config changed
DELETE FROM public.facility_vehicle_types fvt
USING public.parking_facilities f
WHERE fvt.facility_id = f.id
  AND (
    (f.slug = 'garage-palermo-soho' AND fvt.vehicle_type = 'van') OR
    (f.slug = 'garage-obelisco' AND fvt.vehicle_type = 'motorcycle') OR
    (f.slug = 'garage-recoleta' AND fvt.vehicle_type IN ('motorcycle', 'van')) OR
    (f.slug = 'parqueon-san-telmo' AND fvt.vehicle_type = 'van') OR
    (f.slug = 'garage-colegiales' AND fvt.vehicle_type IN ('suv', 'van')) OR
    (f.slug = 'qa-cap1-centro' AND fvt.vehicle_type IN ('suv', 'van')) OR
    (f.slug = 'qa-cap1-24h' AND fvt.vehicle_type = 'van')
  );

-- -----------------------------------------------------------------------------
-- 5. Seed Physical Parking Spaces (725 Commercial + 4 QA = 729 Spaces Total)
--    Deterministic labels P-001..P-NNN so re-running is 100% idempotent.
-- -----------------------------------------------------------------------------
INSERT INTO public.parking_spaces (facility_id, label, max_height_m, accessible, ev_charging, is_active)
SELECT
  f.id,
  'P-' || lpad(gs.n::text, 3, '0'),
  f.max_height_m,
  (COALESCE((SELECT pa.available FROM public.parking_amenities pa WHERE pa.facility_id = f.id AND pa.amenity = 'accessible'), false) AND gs.n <= GREATEST(1, f.total_spaces / 20)),
  (COALESCE((SELECT pa.available FROM public.parking_amenities pa WHERE pa.facility_id = f.id AND pa.amenity = 'ev_charging'), false) AND gs.n <= GREATEST(1, f.total_spaces / 10)),
  true
FROM public.parking_facilities f
CROSS JOIN LATERAL generate_series(1, f.total_spaces) AS gs(n)
WHERE f.slug IN (
  'garage-puerto-madero', 'garage-palermo-soho', 'garage-obelisco', 'garage-recoleta',
  'parqueon-hospital-italiano', 'parqueon-san-telmo', 'garage-colegiales', 'garage-chacarita',
  'qa-cap1-centro', 'qa-cap2-obelisco', 'qa-cap1-24h'
)
ON CONFLICT (facility_id, label) DO UPDATE SET
  max_height_m = EXCLUDED.max_height_m,
  accessible = EXCLUDED.accessible,
  ev_charging = EXCLUDED.ev_charging,
  is_active = true;

-- -----------------------------------------------------------------------------
-- 6. Seed 24 Synthetic Demo Reviews (3 per commercial garage, deterministic UUIDs)
-- -----------------------------------------------------------------------------
INSERT INTO public.reviews (
  id, facility_id, booking_id, user_id, rating, comment, comment_en, author_label, review_date, is_demo, is_published
)
SELECT
  r.review_uuid::uuid,
  f.id,
  NULL,
  NULL,
  r.rating,
  r.text_es,
  r.text_en,
  r.author_label,
  r.review_date::date,
  true,
  true
FROM (
  VALUES
    -- Puerto Madero
    ('10000000-0000-4000-8000-000000000101', 'garage-puerto-madero', 5, 'Conductor Demo #101', '2026-10-18',
      'Acceso rápido y muy bien iluminado. Ideal para reuniones en Puerto Madero.',
      'Fast entry and very well lit. Ideal for meetings in Puerto Madero.'),
    ('10000000-0000-4000-8000-000000000102', 'garage-puerto-madero', 5, 'Conductora Demo #104', '2026-10-05',
      'Plazas amplias para SUV y cargador EV en el primer nivel.',
      'Wide bays for SUVs and EV charger on the first level.'),
    ('10000000-0000-4000-8000-000000000103', 'garage-puerto-madero', 4, 'Usuario Demo #109', '2026-09-22',
      'Tarifa algo más alta en hora pico, pero servicio impecable y valet ágil.',
      'Slightly higher peak rate, but spotless facility and quick valet.'),
    -- Palermo Soho
    ('10000000-0000-4000-8000-000000000201', 'garage-palermo-soho', 5, 'Conductora Demo #201', '2026-10-14',
      'A pocas cuadras de Plaza Serrano, cómodo y techado.',
      'A few blocks from Plaza Serrano, convenient and covered.'),
    ('10000000-0000-4000-8000-000000000202', 'garage-palermo-soho', 4, 'Usuario Demo #205', '2026-09-29',
      'Buen cuidado del vehículo. Recordar que cierra a las 22:00 hs.',
      'Well-kept space. Remember it closes at 22:00.'),
    ('10000000-0000-4000-8000-000000000203', 'garage-palermo-soho', 5, 'Conductor Demo #212', '2026-09-11',
      'Ingreso ágil y excelente relación ubicación-seguridad.',
      'Smooth entry and strong location-to-security balance.'),
    -- Obelisco Centro
    ('10000000-0000-4000-8000-000000000301', 'garage-obelisco', 4, 'Conductor Demo #302', '2026-10-19',
      'Excelente ubicación para ir al teatro o trámites en el centro.',
      'Great spot for theater nights or downtown errands.'),
    ('10000000-0000-4000-8000-000000000302', 'garage-obelisco', 5, 'Usuario Demo #308', '2026-10-02',
      'Abierto 24 hs y admite camionetas altas sin inconvenientes.',
      'Open 24/7 and accommodates tall vans with ease.'),
    ('10000000-0000-4000-8000-000000000303', 'garage-obelisco', 4, 'Conductora Demo #315', '2026-09-17',
      'Es a cielo abierto, pero muy amplio y bien iluminado de noche.',
      'Open-air deck, yet spacious and well-lit at night.'),
    -- Recoleta Centro
    ('10000000-0000-4000-8000-000000000401', 'garage-recoleta', 5, 'Conductora Demo #401', '2026-10-20',
      'Servicio valet súper ágil y cochera impecable sobre Santa Fe.',
      'Super smooth valet service and spotless covered garage on Santa Fe.'),
    ('10000000-0000-4000-8000-000000000402', 'garage-recoleta', 5, 'Conductor Demo #406', '2026-10-01',
      'Acceso 24 hs muy práctico. Atención cordial en cabina.',
      'Very convenient 24/7 access and helpful booth staff.'),
    ('10000000-0000-4000-8000-000000000403', 'garage-recoleta', 4, 'Usuario Demo #410', '2026-09-14',
      'Altura máxima 1,95 m; perfecto para autos y SUV medianas.',
      '1.95 m clearance; great for cars and mid-size SUVs.'),
    -- Hospital Italiano
    ('10000000-0000-4000-8000-000000000501', 'parqueon-hospital-italiano', 5, 'Usuario Demo #501', '2026-10-16',
      'Muy práctico para turnos médicos, con acceso plano y sin escalones.',
      'Very practical for medical visits, with step-free access.'),
    ('10000000-0000-4000-8000-000000000502', 'parqueon-hospital-italiano', 4, 'Conductora Demo #507', '2026-09-28',
      'Tarifa razonable y lugar disponible incluso en horario pico.',
      'Reasonable pricing and spots available even during rush hour.'),
    ('10000000-0000-4000-8000-000000000503', 'parqueon-hospital-italiano', 4, 'Conductor Demo #514', '2026-09-09',
      'Gran altura libre (3 m), pude estacionar mi utilitario sin problemas.',
      'Generous 3 m clearance; parked my utility van effortlessly.'),
    -- San Telmo
    ('10000000-0000-4000-8000-000000000601', 'parqueon-san-telmo', 4, 'Conductor Demo #602', '2026-10-11',
      'Buen precio para pasear el domingo por el Mercado de San Telmo.',
      'Good value for a Sunday visit to San Telmo Market.'),
    ('10000000-0000-4000-8000-000000000602', 'parqueon-san-telmo', 4, 'Usuaria Demo #608', '2026-09-24',
      'Sencillo y funcional, entrada directa desde Defensa.',
      'Simple and functional, direct entry from Defensa.'),
    ('10000000-0000-4000-8000-000000000603', 'parqueon-san-telmo', 4, 'Usuario Demo #611', '2026-09-03',
      'Abierto toda la noche, ideal para cenar por la zona.',
      'Open all night, convenient for dinner in the area.'),
    -- Colegiales
    ('10000000-0000-4000-8000-000000000701', 'garage-colegiales', 5, 'Conductora Demo #701', '2026-10-12',
      'Tarifa súper competitiva y el auto queda bajo techo.',
      'Very competitive rate and the car stays under cover.'),
    ('10000000-0000-4000-8000-000000000702', 'garage-colegiales', 4, 'Conductor Demo #704', '2026-09-20',
      'Ideal para autos compactos y motos; chequear altura 1,80 m.',
      'Great for compact cars and bikes; note 1.80 m max height.'),
    ('10000000-0000-4000-8000-000000000703', 'garage-colegiales', 5, 'Usuario Demo #709', '2026-09-05',
      'Tranquilo, limpio y con cámaras en todos los pasillos.',
      'Quiet, clean, and cameras across every aisle.'),
    -- Chacarita
    ('10000000-0000-4000-8000-000000000801', 'garage-chacarita', 4, 'Usuario Demo #801', '2026-10-08',
      'La opción más económica para dejar el vehículo varias horas.',
      'Most affordable option for multi-hour stays.'),
    ('10000000-0000-4000-8000-000000000802', 'garage-chacarita', 4, 'Conductor Demo #806', '2026-09-19',
      'Muy amplio para maniobrar camionetas y vans.',
      'Very roomy for maneuvering SUVs and vans.'),
    ('10000000-0000-4000-8000-000000000803', 'garage-chacarita', 4, 'Conductora Demo #810', '2026-09-01',
      'Sin techo pero abierto 24 hs y cerca del polo gastronómico.',
      'Uncovered but open 24/7 and near the dining district.')
) AS r(review_uuid, slug, rating, author_label, review_date, text_es, text_en)
JOIN public.parking_facilities f ON f.slug = r.slug
ON CONFLICT (id) DO UPDATE SET
  rating = EXCLUDED.rating,
  comment = EXCLUDED.comment,
  comment_en = EXCLUDED.comment_en,
  author_label = EXCLUDED.author_label,
  review_date = EXCLUDED.review_date,
  is_demo = true,
  is_published = true;

-- -----------------------------------------------------------------------------
-- 7. Seed Global Dynamic Pricing Rules (Synchronized with core-booking.js R04)
--    Pending formal team sign-off before production use.
-- -----------------------------------------------------------------------------
INSERT INTO public.pricing_rules (facility_id, rule_type, parameters, multiplier, is_active)
VALUES
  (NULL, 'vehicle',   '{"key":"motorcycle","vehicle_type":"motorcycle","status":"proposed_demo_default"}'::jsonb, 0.6500, true),
  (NULL, 'vehicle',   '{"key":"car","vehicle_type":"car","status":"proposed_demo_default"}'::jsonb,               1.0000, true),
  (NULL, 'vehicle',   '{"key":"suv","vehicle_type":"suv","status":"proposed_demo_default"}'::jsonb,               1.3000, true),
  (NULL, 'vehicle',   '{"key":"van","vehicle_type":"van","status":"proposed_demo_default"}'::jsonb,               1.5500, true),
  (NULL, 'occupancy', '{"key":"occ_lt_50","min_inclusive":0.00,"max_exclusive":0.50,"status":"proposed_demo_default"}'::jsonb, 1.0000, true),
  (NULL, 'occupancy', '{"key":"occ_50_75","min_inclusive":0.50,"max_exclusive":0.75,"status":"proposed_demo_default"}'::jsonb, 1.2000, true),
  (NULL, 'occupancy', '{"key":"occ_gte_75","min_inclusive":0.75,"max_exclusive":1.01,"status":"proposed_demo_default"}'::jsonb, 1.4000, true),
  (NULL, 'peak',      '{"key":"peak_am","start_hour":8,"end_hour":10,"timezone":"America/Argentina/Buenos_Aires","status":"proposed_demo_default"}'::jsonb, 1.1500, true),
  (NULL, 'peak',      '{"key":"peak_pm","start_hour":17,"end_hour":20,"timezone":"America/Argentina/Buenos_Aires","status":"proposed_demo_default"}'::jsonb, 1.1500, true),
  (NULL, 'weekend',   '{"key":"weekend_sat_sun","days":[0,6],"timezone":"America/Argentina/Buenos_Aires","status":"proposed_demo_default"}'::jsonb, 1.1000, true)
ON CONFLICT ((COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid)), rule_type, ((parameters->>'key')))
DO UPDATE SET
  parameters = EXCLUDED.parameters,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active;

COMMIT;

-- -----------------------------------------------------------------------------
-- 8. Seed Verification Summary (Expected: 8 commercial = 725 spaces, 3 QA = 4 spaces)
-- -----------------------------------------------------------------------------
SELECT
  is_qa,
  data_provenance,
  COUNT(*) AS facilities_count,
  SUM(total_spaces) AS declared_spaces,
  (SELECT COUNT(*) FROM public.parking_spaces ps JOIN public.parking_facilities pf2 ON pf2.id = ps.facility_id WHERE pf2.is_qa = f.is_qa AND ps.is_active) AS physical_spaces_seeded
FROM public.parking_facilities f
GROUP BY is_qa, data_provenance
ORDER BY is_qa ASC;
