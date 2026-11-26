/* ==========================================================================
   ParkFinder Core Booking Engine (Sprint 01 + Sprint 02)
   PF-01 (incl. overnight/multi-day BA UTC-3), PF-02, PF-03, PF-04,
   PF-05 (amenities/filters), PF-06 (synthetic demo ratings), PF-14 (directions/map adapter).
   Pure, zero-dependency domain logic shared between browser UI (index.html)
   and automated acceptance tests.
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ParkFinderCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIMEZONE = 'America/Argentina/Buenos_Aires';
  var UTC_OFFSET = '-03:00';
  var UTC_OFFSET_MINUTES = -180; // Argentina does not observe DST (UTC-3 fixed)
  var MS_PER_MINUTE = 60000;
  var MS_PER_HOUR = 3600000;
  var MAX_DURATION_HOURS = 72; // Proposed Sprint 02 demo cap (pending team sign-off)
  var MAX_DURATION_MINUTES = MAX_DURATION_HOURS * 60;

  var INTERVAL_POLICY = Object.freeze({
    timezone: TIMEZONE,
    utcOffset: UTC_OFFSET,
    maxDurationHours: MAX_DURATION_HOURS,
    maxDurationMinutes: MAX_DURATION_MINUTES,
    proposalStatus: 'proposed_demo_default'
  });

  var AMENITY_KEYS = Object.freeze([
    'covered',
    'securityCctv',
    'evCharging',
    'accessible',
    'valet',
    'open24'
  ]);

  var MAP_PROVIDERS = Object.freeze({
    active: 'osm_leaflet',
    adapters: Object.freeze({
      osm_leaflet: Object.freeze({
        id: 'osm_leaflet',
        label: 'OpenStreetMap + Leaflet',
        requiresBilling: false,
        status: 'active',
        distanceMode: 'straight_line_haversine_estimate'
      }),
      google_maps: Object.freeze({
        id: 'google_maps',
        label: 'Google Maps Platform',
        requiresBilling: true,
        status: 'proposed_not_activated',
        distanceMode: 'routes_api_pending_approval'
      })
    })
  });

  /* Proposed demo defaults per 01_fuentes/reglas_negocio_v01.md (R04).
     Pending formal team sign-off before production use.
     Peak windows implemented: 08:00-10:00 and 17:00-20:00 BA local time. */
  var VEHICLE_TYPES = Object.freeze({
    motorcycle: Object.freeze({ id: 'motorcycle', factor: 0.65, defaultHeightM: 1.30 }),
    car: Object.freeze({ id: 'car', factor: 1.00, defaultHeightM: 1.55 }),
    suv: Object.freeze({ id: 'suv', factor: 1.30, defaultHeightM: 1.85 }),
    van: Object.freeze({ id: 'van', factor: 1.55, defaultHeightM: 2.20 })
  });

  var VEHICLE_TYPE_LIST = Object.freeze(['motorcycle', 'car', 'suv', 'van']);

  var PRICING_POLICY = Object.freeze({
    version: 'pf-v2-proposed-hourly-proration',
    currency: 'ARS',
    rounding: 'single_final_round',
    peakFactor: 1.15,
    peakHours: Object.freeze([
      Object.freeze([8, 10]),
      Object.freeze([17, 20])
    ]),
    peakWindowsNote: 'Implemented demo peak windows: 08:00-10:00 and 17:00-20:00 BA local time (proposed default; pending team approval).',
    weekendFactor: 1.10,
    weekendDays: Object.freeze([0, 6]), // Sunday (0), Saturday (6)
    occupancyTiers: Object.freeze([
      Object.freeze({ maxExclusive: 0.50, factor: 1.00, label: '<50%' }),
      Object.freeze({ maxExclusive: 0.75, factor: 1.20, label: '50–74%' }),
      Object.freeze({ maxExclusive: Infinity, factor: 1.40, label: '>=75%' })
    ]),
    vehicleFactors: Object.freeze({
      motorcycle: 0.65,
      car: 1.00,
      suv: 1.30,
      van: 1.55
    })
  });

  /* Synthetic garage catalog (Buenos Aires / CABA).
     Preserves all 8 V1/S1 garages while adding Sprint 02 tri-state amenities
     (true = yes, false = no, null = unknown/not reported) and explicitly
     demo-labelled synthetic ratings (PF-05, PF-06). */
  var DEFAULT_GARAGES = [
    {
      id: 'garage-puerto-madero',
      name: 'Garage Puerto Madero',
      address: 'Av. del Sol 1141, Puerto Madero, CABA',
      lat: -34.6074,
      lng: -58.3610,
      ratePerHour: 6500,
      totalSpaces: 120,
      techado: true,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 2.40,
      amenities: {
        covered: true,
        securityCctv: true,
        evCharging: true,
        accessible: true,
        valet: true,
        open24: true
      },
      rating: {
        score: 4.8,
        reviewCount: 142,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-palermo-soho',
      name: 'Garage Palermo Soho',
      address: 'Gurruchaga 1500, Palermo Soho, CABA',
      lat: -34.5885,
      lng: -58.4290,
      ratePerHour: 5600,
      totalSpaces: 80,
      techado: true,
      open24: false,
      operatingHours: { open: '07:00', close: '22:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv'],
      maxHeightM: 2.00,
      amenities: {
        covered: true,
        securityCctv: true,
        evCharging: true,
        accessible: null,
        valet: false,
        open24: false
      },
      rating: {
        score: 4.6,
        reviewCount: 98,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-obelisco',
      name: 'Garage Obelisco Centro',
      address: 'Av. Corrientes 1240, Microcentro, CABA',
      lat: -34.6049,
      lng: -58.3778,
      ratePerHour: 6000,
      totalSpaces: 150,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['car', 'suv', 'van'],
      maxHeightM: 2.60,
      amenities: {
        covered: false,
        securityCctv: true,
        evCharging: false,
        accessible: true,
        valet: false,
        open24: true
      },
      rating: {
        score: 4.4,
        reviewCount: 215,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-recoleta',
      name: 'Garage Recoleta Centro',
      address: 'Av. Santa Fe 1500, Recoleta, CABA',
      lat: -34.5975,
      lng: -58.3895,
      ratePerHour: 6200,
      totalSpaces: 90,
      techado: true,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['car', 'suv'],
      maxHeightM: 1.95,
      amenities: {
        covered: true,
        securityCctv: true,
        evCharging: false,
        accessible: true,
        valet: true,
        open24: true
      },
      rating: {
        score: 4.7,
        reviewCount: 118,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'parqueon-hospital-italiano',
      name: 'Parqueón Hospital Italiano',
      address: 'Tte. Gral. Perón 4190, Almagro, CABA',
      lat: -34.6076,
      lng: -58.4262,
      ratePerHour: 4800,
      totalSpaces: 100,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 3.00,
      amenities: {
        covered: false,
        securityCctv: true,
        evCharging: null,
        accessible: true,
        valet: false,
        open24: true
      },
      rating: {
        score: 4.3,
        reviewCount: 76,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'parqueon-san-telmo',
      name: 'Parqueón San Telmo',
      address: 'Av. Defensa 830, San Telmo, CABA',
      lat: -34.6146,
      lng: -58.3730,
      ratePerHour: 4500,
      totalSpaces: 60,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv'],
      maxHeightM: 2.10,
      amenities: {
        covered: false,
        securityCctv: null,
        evCharging: false,
        accessible: false,
        valet: false,
        open24: true
      },
      rating: {
        score: 4.1,
        reviewCount: 54,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-colegiales',
      name: 'Garage Colegiales',
      address: 'Av. Federico Lacroze 2200, Colegiales, CABA',
      lat: -34.5739,
      lng: -58.4552,
      ratePerHour: 3900,
      totalSpaces: 70,
      techado: true,
      open24: false,
      operatingHours: { open: '07:00', close: '21:00' },
      acceptedVehicleTypes: ['motorcycle', 'car'],
      maxHeightM: 1.80,
      amenities: {
        covered: true,
        securityCctv: true,
        evCharging: false,
        accessible: null,
        valet: false,
        open24: false
      },
      rating: {
        score: 4.5,
        reviewCount: 63,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-chacarita',
      name: 'Garage Chacarita',
      address: 'Av. Corrientes 6150, Chacarita, CABA',
      lat: -34.5919,
      lng: -58.4403,
      ratePerHour: 3500,
      totalSpaces: 55,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 2.80,
      amenities: {
        covered: false,
        securityCctv: false,
        evCharging: false,
        accessible: false,
        valet: null,
        open24: true
      },
      rating: {
        score: 3.9,
        reviewCount: 41,
        provenance: 'synthetic_demo'
      },
      dataProvenance: 'synthetic_demo'
    }
  ];

  /* Sprint 2B: Recommendation policy (explicit, deterministic & testable).
     Value score normalizes totalArs and distanceKm among eligible results with equal weights.
     Low availability threshold triggers strictly at <=2 actual synthetic free bays (no false urgency). */
  var RECOMMENDATION_POLICY = Object.freeze({
    valueWeights: Object.freeze({ price: 0.5, distance: 0.5 }),
    lowAvailabilityThreshold: 2,
    proposalStatus: 'proposed_demo_default',
    formulaNote: 'Value score = 0.5 * norm(totalArs) + 0.5 * norm(distanceKm) across eligible garages (min-max normalized to [0,1], lower is better). Low availability triggers only when eligible && 1 <= availableSpaces <= 2.'
  });

  var MAX_COMPARE_GARAGES = 3;

  /* Sprint 2B: Local illustrative SVG galleries & synthetic demo reviews (zero real partner photos or personal names). */
  var GARAGE_MEDIA_CATALOG = {
    'garage-puerto-madero': {
      mainImage: 'assets/garages/puerto-madero-main.svg',
      gallery: [
        { src: 'assets/garages/puerto-madero-main.svg', captionEs: 'Acceso cubierto y sector EV · Puerto Madero', captionEn: 'Covered entrance & EV bay · Puerto Madero', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-ev-zone.svg', captionEs: 'Sector ilustrativo de carga eléctrica EV', captionEn: 'Illustrative EV charging zone', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-interior-bays.svg', captionEs: 'Plazas señalizadas con sensores de cupo', captionEn: 'Marked bays with space sensors', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-security-access.svg', captionEs: 'Barrera de acceso y monitoreo CCTV 24 hs', captionEn: 'Access gate & 24/7 CCTV monitoring', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-pm-1', author: 'Conductor Demo #101', date: '2026-10-18', rating: 5, textEs: 'Acceso rápido y muy bien iluminado. Ideal para reuniones en Puerto Madero.', textEn: 'Fast entry and very well lit. Ideal for meetings in Puerto Madero.', provenance: 'synthetic_demo' },
        { id: 'rev-pm-2', author: 'Conductora Demo #104', date: '2026-10-05', rating: 5, textEs: 'Plazas amplias para SUV y cargador EV en el primer nivel.', textEn: 'Wide bays for SUVs and EV charger on the first level.', provenance: 'synthetic_demo' },
        { id: 'rev-pm-3', author: 'Usuario Demo #109', date: '2026-09-22', rating: 4, textEs: 'Tarifa algo más alta en hora pico, pero servicio impecable y valet ágil.', textEn: 'Slightly higher peak rate, but spotless facility and quick valet.', provenance: 'synthetic_demo' }
      ]
    },
    'garage-palermo-soho': {
      mainImage: 'assets/garages/palermo-soho-main.svg',
      gallery: [
        { src: 'assets/garages/palermo-soho-main.svg', captionEs: 'Fachada urbana cubierta · Palermo Soho', captionEn: 'Covered urban facade · Palermo Soho', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-interior-bays.svg', captionEs: 'Nivel cubierto y señalización interna', captionEn: 'Covered level & interior signage', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-ev-zone.svg', captionEs: 'Puesto ilustrativo de carga eléctrica', captionEn: 'Illustrative EV charging stall', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-ps-1', author: 'Conductora Demo #201', date: '2026-10-14', rating: 5, textEs: 'A pocas cuadras de Plaza Serrano, cómodo y techado.', textEn: 'A few blocks from Plaza Serrano, convenient and covered.', provenance: 'synthetic_demo' },
        { id: 'rev-ps-2', author: 'Usuario Demo #205', date: '2026-09-29', rating: 4, textEs: 'Buen cuidado del vehículo. Recordar que cierra a las 22:00 hs.', textEn: 'Well-kept space. Remember it closes at 22:00.', provenance: 'synthetic_demo' },
        { id: 'rev-ps-3', author: 'Conductor Demo #212', date: '2026-09-11', rating: 5, textEs: 'Ingreso ágil y excelente relación ubicación-seguridad.', textEn: 'Smooth entry and strong location-to-security balance.', provenance: 'synthetic_demo' }
      ]
    },
    'garage-obelisco': {
      mainImage: 'assets/garages/obelisco-main.svg',
      gallery: [
        { src: 'assets/garages/obelisco-main.svg', captionEs: 'Playa 24 hs en Microcentro · Av. Corrientes', captionEn: '24/7 Downtown deck · Av. Corrientes', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-security-access.svg', captionEs: 'Ingreso controlado con lectura de patente', captionEn: 'Controlled gate with entry monitoring', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-walkway-exit.svg', captionEs: 'Salida peatonal iluminada hacia Corrientes', captionEn: 'Illuminated pedestrian exit to Corrientes', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-ob-1', author: 'Conductor Demo #302', date: '2026-10-19', rating: 4, textEs: 'Excelente ubicación para ir al teatro o trámites en el centro.', textEn: 'Great spot for theater nights or downtown errands.', provenance: 'synthetic_demo' },
        { id: 'rev-ob-2', author: 'Usuario Demo #308', date: '2026-10-02', rating: 5, textEs: 'Abierto 24 hs y admite camionetas altas sin inconvenientes.', textEn: 'Open 24/7 and accommodates tall vans with ease.', provenance: 'synthetic_demo' },
        { id: 'rev-ob-3', author: 'Conductora Demo #315', date: '2026-09-17', rating: 4, textEs: 'Es a cielo abierto, pero muy amplio y bien iluminado de noche.', textEn: 'Open-air deck, yet spacious and well-lit at night.', provenance: 'synthetic_demo' }
      ]
    },
    'garage-recoleta': {
      mainImage: 'assets/garages/recoleta-main.svg',
      gallery: [
        { src: 'assets/garages/recoleta-main.svg', captionEs: 'Acceso techado con recepción valet · Recoleta', captionEn: 'Covered entrance with valet desk · Recoleta', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-interior-bays.svg', captionEs: 'Plazas cubiertas señalizadas', captionEn: 'Marked covered bays', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-walkway-exit.svg', captionEs: 'Ascensor y salida peatonal accesible', captionEn: 'Elevator & accessible pedestrian lobby', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-rc-1', author: 'Conductora Demo #401', date: '2026-10-20', rating: 5, textEs: 'Servicio valet súper ágil y cochera impecable sobre Santa Fe.', textEn: 'Super smooth valet service and spotless covered garage on Santa Fe.', provenance: 'synthetic_demo' },
        { id: 'rev-rc-2', author: 'Conductor Demo #406', date: '2026-10-01', rating: 5, textEs: 'Acceso 24 hs muy práctico. Atención cordial en cabina.', textEn: 'Very convenient 24/7 access and helpful booth staff.', provenance: 'synthetic_demo' },
        { id: 'rev-rc-3', author: 'Usuario Demo #410', date: '2026-09-14', rating: 4, textEs: 'Altura máxima 1,95 m; perfecto para autos y SUV medianas.', textEn: '1.95 m clearance; great for cars and mid-size SUVs.', provenance: 'synthetic_demo' }
      ]
    },
    'parqueon-hospital-italiano': {
      mainImage: 'assets/garages/hospital-italiano-main.svg',
      gallery: [
        { src: 'assets/garages/hospital-italiano-main.svg', captionEs: 'Playa accesible de gran altura libre · Almagro', captionEn: 'Accessible high-clearance lot · Almagro', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-walkway-exit.svg', captionEs: 'Sendero peatonal accesible a pasos del hospital', captionEn: 'Accessible walkway steps from the hospital', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-security-access.svg', captionEs: 'Monitoreo continuo y barrera 24 hs', captionEn: 'Continuous monitoring & 24/7 barrier', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-hi-1', author: 'Usuario Demo #501', date: '2026-10-16', rating: 5, textEs: 'Muy práctico para turnos médicos, con acceso plano y sin escalones.', textEn: 'Very practical for medical visits, with step-free access.', provenance: 'synthetic_demo' },
        { id: 'rev-hi-2', author: 'Conductora Demo #507', date: '2026-09-28', rating: 4, textEs: 'Tarifa razonable y lugar disponible incluso en horario pico.', textEn: 'Reasonable pricing and spots available even during rush hour.', provenance: 'synthetic_demo' },
        { id: 'rev-hi-3', author: 'Conductor Demo #514', date: '2026-09-09', rating: 4, textEs: 'Gran altura libre (3 m), pude estacionar mi utilitario sin problemas.', textEn: 'Generous 3 m clearance; parked my utility van effortlessly.', provenance: 'synthetic_demo' }
      ]
    },
    'parqueon-san-telmo': {
      mainImage: 'assets/garages/san-telmo-main.svg',
      gallery: [
        { src: 'assets/garages/san-telmo-main.svg', captionEs: 'Playa urbana 24 hs · San Telmo', captionEn: '24/7 urban lot · San Telmo', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-security-access.svg', captionEs: 'Acceso iluminado sobre Av. Defensa', captionEn: 'Lit entrance on Av. Defensa', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-interior-bays.svg', captionEs: 'Distribución ilustrativa de plazas', captionEn: 'Illustrative bay layout', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-st-1', author: 'Conductor Demo #602', date: '2026-10-11', rating: 4, textEs: 'Buen precio para pasear el domingo por el Mercado de San Telmo.', textEn: 'Good value for a Sunday visit to San Telmo Market.', provenance: 'synthetic_demo' },
        { id: 'rev-st-2', author: 'Usuaria Demo #608', date: '2026-09-24', rating: 4, textEs: 'Sencillo y funcional, entrada directa desde Defensa.', textEn: 'Simple and functional, direct entry from Defensa.', provenance: 'synthetic_demo' },
        { id: 'rev-st-3', author: 'Usuario Demo #611', date: '2026-09-03', rating: 4, textEs: 'Abierto toda la noche, ideal para cenar por la zona.', textEn: 'Open all night, convenient for dinner in the area.', provenance: 'synthetic_demo' }
      ]
    },
    'garage-colegiales': {
      mainImage: 'assets/garages/colegiales-main.svg',
      gallery: [
        { src: 'assets/garages/colegiales-main.svg', captionEs: 'Cochera cubierta compacta · Colegiales', captionEn: 'Compact covered garage · Colegiales', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-interior-bays.svg', captionEs: 'Plazas cubiertas para motos y autos', captionEn: 'Covered bays for motorcycles & cars', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-security-access.svg', captionEs: 'Portón controlado y CCTV', captionEn: 'Controlled gate & CCTV', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-co-1', author: 'Conductora Demo #701', date: '2026-10-12', rating: 5, textEs: 'Tarifa súper competitiva y el auto queda bajo techo.', textEn: 'Very competitive rate and the car stays under cover.', provenance: 'synthetic_demo' },
        { id: 'rev-co-2', author: 'Conductor Demo #704', date: '2026-09-20', rating: 4, textEs: 'Ideal para autos compactos y motos; chequear altura 1,80 m.', textEn: 'Great for compact cars and bikes; note 1.80 m max height.', provenance: 'synthetic_demo' },
        { id: 'rev-co-3', author: 'Usuario Demo #709', date: '2026-09-05', rating: 5, textEs: 'Tranquilo, limpio y con cámaras en todos los pasillos.', textEn: 'Quiet, clean, and cameras across every aisle.', provenance: 'synthetic_demo' }
      ]
    },
    'garage-chacarita': {
      mainImage: 'assets/garages/chacarita-main.svg',
      gallery: [
        { src: 'assets/garages/chacarita-main.svg', captionEs: 'Playa abierta económica 24 hs · Chacarita', captionEn: 'Budget 24/7 open lot · Chacarita', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-security-access.svg', captionEs: 'Ingreso amplio sobre Av. Corrientes', captionEn: 'Wide entry on Av. Corrientes', provenance: 'illustrative_svg_demo' },
        { src: 'assets/garages/gallery-walkway-exit.svg', captionEs: 'Salida directa a estación de subte B', captionEn: 'Direct walk to Subway Line B', provenance: 'illustrative_svg_demo' }
      ],
      demoReviews: [
        { id: 'rev-ch-1', author: 'Usuario Demo #801', date: '2026-10-08', rating: 4, textEs: 'La opción más económica para dejar el vehículo varias horas.', textEn: 'Most affordable option for multi-hour stays.', provenance: 'synthetic_demo' },
        { id: 'rev-ch-2', author: 'Conductor Demo #806', date: '2026-09-19', rating: 4, textEs: 'Muy amplio para maniobrar camionetas y vans.', textEn: 'Very roomy for maneuvering SUVs and vans.', provenance: 'synthetic_demo' },
        { id: 'rev-ch-3', author: 'Conductora Demo #810', date: '2026-09-01', rating: 4, textEs: 'Sin techo pero abierto 24 hs y cerca del polo gastronómico.', textEn: 'Uncovered but open 24/7 and near the dining district.', provenance: 'synthetic_demo' }
      ]
    }
  };

  DEFAULT_GARAGES.forEach(function (g) {
    var media = GARAGE_MEDIA_CATALOG[g.id];
    if (media) {
      g.mainImage = media.mainImage;
      g.gallery = media.gallery.slice();
      g.demoReviews = media.demoReviews.slice();
    }
  });

  /* Sprint 2B: Offline-safe Buenos Aires destination catalog (zones, POIs, businesses; zero paid geocoding). */
  var DEMO_DESTINATIONS = Object.freeze([
    { id: 'obeliso', type: 'zone', zoneId: 'obeliso', label: 'Obelisco / Microcentro', subtitleEs: 'Barrio · Centro porteño', subtitleEn: 'Area · Downtown BA', coords: [-34.6037, -58.3816], keywords: 'obelisco microcentro centro corrientes 9 de julio', provenance: 'synthetic_demo_catalog' },
    { id: 'puertomadero', type: 'zone', zoneId: 'puertomadero', label: 'Puerto Madero', subtitleEs: 'Barrio · Diques y oficinas', subtitleEn: 'Area · Waterfront & offices', coords: [-34.6074, -58.3610], keywords: 'puerto madero diques puente de la mujer', provenance: 'synthetic_demo_catalog' },
    { id: 'palermosoho', type: 'zone', zoneId: 'palermosoho', label: 'Palermo Soho', subtitleEs: 'Barrio · Gastronomía y diseño', subtitleEn: 'Area · Dining & design', coords: [-34.5885, -58.4290], keywords: 'palermo soho gurruchaga plaza serrano honduras', provenance: 'synthetic_demo_catalog' },
    { id: 'recoleta', type: 'zone', zoneId: 'recoleta', label: 'Recoleta', subtitleEs: 'Barrio · Av. Santa Fe y Alvear', subtitleEn: 'Area · Santa Fe & Alvear Ave', coords: [-34.5956, -58.3892], keywords: 'recoleta santa fe callao cementerio', provenance: 'synthetic_demo_catalog' },
    { id: 'hospitalitaliano', type: 'zone', zoneId: 'hospitalitaliano', label: 'Hospital Italiano', subtitleEs: 'Salud · Almagro', subtitleEn: 'Healthcare · Almagro', coords: [-34.6076, -58.4262], keywords: 'hospital italiano almagro peron gascon', provenance: 'synthetic_demo_catalog' },
    { id: 'santelmo', type: 'zone', zoneId: 'santelmo', label: 'San Telmo', subtitleEs: 'Barrio · Casco histórico', subtitleEn: 'Area · Historic quarter', coords: [-34.6148, -58.3736], keywords: 'san telmo defensa dorrego mercado', provenance: 'synthetic_demo_catalog' },
    { id: 'colegiales', type: 'zone', zoneId: 'colegiales', label: 'Colegiales', subtitleEs: 'Barrio · Av. Federico Lacroze', subtitleEn: 'Area · Federico Lacroze Ave', coords: [-34.5739, -58.4552], keywords: 'colegiales lacroze alvarez thomas', provenance: 'synthetic_demo_catalog' },
    { id: 'chacarita', type: 'zone', zoneId: 'chacarita', label: 'Chacarita', subtitleEs: 'Barrio · Corrientes y Dorrego', subtitleEn: 'Area · Corrientes & Dorrego', coords: [-34.5919, -58.4403], keywords: 'chacarita corrientes dorrego jorge newbery', provenance: 'synthetic_demo_catalog' },
    { id: 'poi-teatro-colon', type: 'poi', label: 'Teatro Colón', subtitleEs: 'Punto de interés · Cerrito 628', subtitleEn: 'POI · Cerrito 628', coords: [-34.6011, -58.3831], keywords: 'teatro colon opera cerrito libertad', provenance: 'synthetic_demo_catalog' },
    { id: 'poi-luna-park', type: 'poi', label: 'Estadio Luna Park', subtitleEs: 'Punto de interés · Av. Madero 470', subtitleEn: 'POI · Av. Madero 470', coords: [-34.6022, -58.3688], keywords: 'luna park conciertos recitales madero bouchard', provenance: 'synthetic_demo_catalog' },
    { id: 'poi-cck', type: 'poi', label: 'Centro Cultural Palacio Libertad (CCK)', subtitleEs: 'Punto de interés · Sarmiento 151', subtitleEn: 'POI · Sarmiento 151', coords: [-34.6034, -58.3694], keywords: 'cck palacio libertad centro cultural sarmiento', provenance: 'synthetic_demo_catalog' },
    { id: 'poi-plaza-serrano', type: 'poi', label: 'Plaza Serrano (Cortázar)', subtitleEs: 'Punto de interés · Palermo Soho', subtitleEn: 'POI · Palermo Soho', coords: [-34.5889, -58.4305], keywords: 'plaza serrano cortazar bares palermo', provenance: 'synthetic_demo_catalog' },
    { id: 'poi-malba', type: 'poi', label: 'Museo MALBA', subtitleEs: 'Punto de interés · Av. Figueroa Alcorta 3415', subtitleEn: 'POI · Figueroa Alcorta 3415', coords: [-34.5770, -58.4034], keywords: 'malba museo arte palermo chico', provenance: 'synthetic_demo_catalog' },
    { id: 'poi-uba-medicina', type: 'poi', label: 'Facultad de Medicina UBA', subtitleEs: 'Universidad · Paraguay 2155', subtitleEn: 'University · Paraguay 2155', coords: [-34.5980, -58.3983], keywords: 'uba facultad medicina paraguay cordoba', provenance: 'synthetic_demo_catalog' },
    { id: 'biz-galerias-pacifico', type: 'business', label: 'Galerías Pacífico', subtitleEs: 'Comercio · Florida y Córdoba', subtitleEn: 'Shopping · Florida & Córdoba', coords: [-34.5993, -58.3746], keywords: 'galerias pacifico shopping florida cordoba', provenance: 'synthetic_demo_catalog' },
    { id: 'biz-abasto', type: 'business', label: 'Abasto Shopping', subtitleEs: 'Comercio · Av. Corrientes 3247', subtitleEn: 'Shopping · Av. Corrientes 3247', coords: [-34.6031, -58.4108], keywords: 'abasto shopping corrientes balvanera', provenance: 'synthetic_demo_catalog' },
    { id: 'biz-alto-palermo', type: 'business', label: 'Alto Palermo Shopping', subtitleEs: 'Comercio · Av. Santa Fe 3253', subtitleEn: 'Shopping · Av. Santa Fe 3253', coords: [-34.5880, -58.4109], keywords: 'alto palermo shopping santa fe coronel diaz', provenance: 'synthetic_demo_catalog' },
    { id: 'biz-mercado-san-telmo', type: 'business', label: 'Mercado de San Telmo', subtitleEs: 'Comercio · Defensa 963', subtitleEn: 'Market · Defensa 963', coords: [-34.6194, -58.3731], keywords: 'mercado san telmo defensa bolivar gastronomia', provenance: 'synthetic_demo_catalog' },
    { id: 'biz-catalinas', type: 'business', label: 'Polo Corporativo Catalinas', subtitleEs: 'Oficinas · Av. Alem y Córdoba', subtitleEn: 'Offices · Alem & Córdoba', coords: [-34.5975, -58.3712], keywords: 'catalinas oficinas retiro alem torre', provenance: 'synthetic_demo_catalog' }
  ]);

  /* ------------------------- Date & Time (Buenos Aires UTC-3) ------------------------- */

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getBuenosAiresLocalParts(epochMs) {
    var shifted = new Date(epochMs + UTC_OFFSET_MINUTES * MS_PER_MINUTE);
    var year = shifted.getUTCFullYear();
    var month = shifted.getUTCMonth() + 1;
    var day = shifted.getUTCDate();
    var hour = shifted.getUTCHours();
    var minute = shifted.getUTCMinutes();
    var dayOfWeek = shifted.getUTCDay();
    return {
      year: year,
      month: month,
      day: day,
      hour: hour,
      minute: minute,
      dayOfWeek: dayOfWeek,
      dateStr: year + '-' + pad2(month) + '-' + pad2(day),
      timeStr: pad2(hour) + ':' + pad2(minute)
    };
  }

  function getTodayInBuenosAires(referenceNow) {
    var nowMs = referenceNow instanceof Date
      ? referenceNow.getTime()
      : (typeof referenceNow === 'number' ? referenceNow : Date.now());
    return getBuenosAiresLocalParts(nowMs).dateStr;
  }

  function parseDateParts(dateStr) {
    if (typeof dateStr !== 'string') return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return null;
    var year = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var day = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() + 1 !== month ||
      check.getUTCDate() !== day
    ) {
      return null;
    }
    return { year: year, month: month, day: day };
  }

  function parseTimeMinutes(timeStr, allow2400) {
    if (typeof timeStr !== 'string') return null;
    var match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
    if (!match) return null;
    var hh = parseInt(match[1], 10);
    var mm = parseInt(match[2], 10);
    var ss = match[3] !== undefined ? parseInt(match[3], 10) : 0;
    if (ss !== 0) return null;
    if (allow2400 && hh === 24 && mm === 0) return 1440;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function formatMinutesToHHMM(totalMinutes) {
    var m = Math.max(0, Math.round(totalMinutes));
    if (m === 1440) return '24:00';
    var wrapped = m % 1440;
    var hh = Math.floor(wrapped / 60);
    var mm = wrapped % 60;
    return pad2(hh) + ':' + pad2(mm);
  }

  function toBuenosAiresEpochMs(dateStr, timeMinutes) {
    var parts = parseDateParts(dateStr);
    if (!parts || !Number.isFinite(timeMinutes)) return NaN;
    var midnightUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
    // BA local time is UTC-3, so UTC epoch = local + 3 hours
    return midnightUtcMs + (timeMinutes - UTC_OFFSET_MINUTES) * MS_PER_MINUTE;
  }

  function toBuenosAiresIso(dateStr, timeMinutes) {
    var epochMs = toBuenosAiresEpochMs(dateStr, timeMinutes);
    if (!Number.isFinite(epochMs)) return null;
    var local = getBuenosAiresLocalParts(epochMs);
    return local.dateStr + 'T' + local.timeStr + ':00' + UTC_OFFSET;
  }

  function addDaysToDateStr(dateStr, deltaDays) {
    var parts = parseDateParts(dateStr);
    if (!parts) return null;
    var dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (deltaDays || 0)));
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }

  /* Enumerates every Buenos Aires local calendar day touched by half-open [startMs, endMs),
     returning clipped [startMinutes, endMinutes) within [0, 1440] for each day. */
  function enumerateLocalDatesBetween(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
    var days = [];
    var cursor = startMs;
    var safety = 0;
    while (cursor < endMs && safety < 32) {
      safety++;
      var local = getBuenosAiresLocalParts(cursor);
      var dayStartMin = local.hour * 60 + local.minute;
      var nextMidnightMs = toBuenosAiresEpochMs(local.dateStr, 1440);
      var sliceEnd = Math.min(endMs, nextMidnightMs);
      var dayEndMin = sliceEnd >= nextMidnightMs
        ? 1440
        : (getBuenosAiresLocalParts(sliceEnd).hour * 60 + getBuenosAiresLocalParts(sliceEnd).minute);
      if (dayEndMin > dayStartMin) {
        days.push({
          dateStr: local.dateStr,
          dayOfWeek: local.dayOfWeek,
          startMinutes: dayStartMin,
          endMinutes: dayEndMin
        });
      }
      cursor = sliceEnd;
    }
    return days;
  }

  /* ------------------------- Interval Validation (PF-01 + Sprint 02 Multi-Day) ------------------------- */

  function validateInterval(params) {
    var input = params || {};
    var arrivalDateRaw = typeof input.arrivalDate === 'string' && input.arrivalDate.trim() !== ''
      ? input.arrivalDate.trim()
      : (typeof input.date === 'string' ? input.date.trim() : '');
    var hasExplicitDepDate = typeof input.departureDate === 'string' && input.departureDate.trim() !== '';
    var departureDateRaw = hasExplicitDepDate ? input.departureDate.trim() : arrivalDateRaw;
    var arrival = typeof input.arrival === 'string' ? input.arrival.trim() : '';
    var departure = typeof input.departure === 'string' ? input.departure.trim() : '';
    var maxDurationMinutes = Number.isFinite(Number(input.maxDurationMinutes)) && Number(input.maxDurationMinutes) > 0
      ? Math.round(Number(input.maxDurationMinutes))
      : MAX_DURATION_MINUTES;

    var arrivalDateParts = parseDateParts(arrivalDateRaw);
    if (!arrivalDateParts) {
      return { valid: false, code: 'INVALID_DATE' };
    }

    var departureDateParts = parseDateParts(departureDateRaw);
    if (!departureDateParts) {
      return { valid: false, code: 'INVALID_DEPARTURE_DATE' };
    }

    var startMinutes = parseTimeMinutes(arrival, false);
    if (startMinutes === null) {
      return { valid: false, code: 'INVALID_ARRIVAL_TIME' };
    }

    var startMs = toBuenosAiresEpochMs(arrivalDateRaw, startMinutes);
    var endMs = NaN;
    var endMinutes = null;
    var isLegacy2400 = false;

    if (departure) {
      var allow2400 = departureDateRaw === arrivalDateRaw;
      endMinutes = parseTimeMinutes(departure, allow2400);
      if (endMinutes === null) {
        return { valid: false, code: 'INVALID_DEPARTURE_TIME' };
      }
      isLegacy2400 = allow2400 && endMinutes === 1440;
      endMs = toBuenosAiresEpochMs(departureDateRaw, endMinutes);
    } else if (input.hours !== undefined && input.hours !== null && input.hours !== '') {
      var hoursNum = Number(input.hours);
      if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
        return { valid: false, code: 'NON_POSITIVE_DURATION' };
      }
      var durMinsFromHours = Math.round(hoursNum * 60);
      if (durMinsFromHours > maxDurationMinutes) {
        return { valid: false, code: 'EXCEEDS_MAX_DURATION', maxDurationHours: maxDurationMinutes / 60 };
      }
      endMs = startMs + durMinsFromHours * MS_PER_MINUTE;
      var computedEndLocal = getBuenosAiresLocalParts(endMs);
      if (computedEndLocal.dateStr !== arrivalDateRaw && computedEndLocal.timeStr === '00:00' && durMinsFromHours <= 1440 && startMinutes + durMinsFromHours === 1440) {
        isLegacy2400 = true;
        departureDateRaw = arrivalDateRaw;
        endMinutes = 1440;
      } else {
        departureDateRaw = computedEndLocal.dateStr;
        endMinutes = computedEndLocal.hour * 60 + computedEndLocal.minute;
      }
    } else {
      return { valid: false, code: 'INVALID_DEPARTURE_TIME' };
    }

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return { valid: false, code: 'INVALID_INTERVAL' };
    }

    var durationMinutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
    if (durationMinutes <= 0) {
      return { valid: false, code: 'NON_POSITIVE_DURATION' };
    }

    if (durationMinutes > maxDurationMinutes) {
      return {
        valid: false,
        code: 'EXCEEDS_MAX_DURATION',
        maxDurationHours: maxDurationMinutes / 60,
        durationMinutes: durationMinutes
      };
    }

    if (input.allowPast === false) {
      var todayBa = getTodayInBuenosAires(input.referenceNow);
      if (arrivalDateRaw < todayBa) {
        return { valid: false, code: 'PAST_DATE' };
      }
    }

    var endLocal = getBuenosAiresLocalParts(endMs);
    var canonicalDepartureDate = isLegacy2400 ? arrivalDateRaw : endLocal.dateStr;
    var canonicalDeparture = isLegacy2400 ? '24:00' : endLocal.timeStr;
    var canonicalEndMinutes = isLegacy2400 ? 1440 : (endLocal.hour * 60 + endLocal.minute);
    var daySlices = enumerateLocalDatesBetween(startMs, endMs);

    return {
      valid: true,
      code: 'OK',
      date: arrivalDateRaw,
      arrivalDate: arrivalDateRaw,
      departureDate: canonicalDepartureDate,
      arrival: formatMinutesToHHMM(startMinutes),
      departure: canonicalDeparture,
      isOvernight: canonicalDepartureDate !== arrivalDateRaw,
      spansDays: daySlices.length,
      startMinutes: startMinutes,
      endMinutes: canonicalEndMinutes,
      durationMinutes: durationMinutes,
      durationHours: durationMinutes / 60,
      startMs: startMs,
      endMs: endMs,
      startAt: toBuenosAiresIso(arrivalDateRaw, startMinutes),
      endAt: endLocal.dateStr + 'T' + endLocal.timeStr + ':00' + UTC_OFFSET,
      timezone: TIMEZONE
    };
  }

  /* ------------------------- Operating Hours & Vehicle Compatibility (PF-01, PF-03) ------------------------- */

  function getGarageOperatingMinutes(garage) {
    if (!garage) return { openMinutes: 0, closeMinutes: 1440, open: '00:00', close: '24:00', open24: true };
    if (garage.open24) {
      return { openMinutes: 0, closeMinutes: 1440, open: '00:00', close: '24:00', open24: true };
    }
    var hours = garage.operatingHours || { open: '07:00', close: '22:00' };
    var openMinutes = parseTimeMinutes(hours.open, false);
    var closeMinutes = parseTimeMinutes(hours.close, true);
    if (openMinutes === null) openMinutes = 420;
    if (closeMinutes === null) closeMinutes = 1320;
    if (openMinutes === 0 && closeMinutes === 1440) {
      return { openMinutes: 0, closeMinutes: 1440, open: '00:00', close: '24:00', open24: true };
    }
    return {
      openMinutes: openMinutes,
      closeMinutes: closeMinutes,
      open: formatMinutesToHHMM(openMinutes),
      close: formatMinutesToHHMM(closeMinutes),
      open24: false
    };
  }

  /* Validates garage operating hours across EVERY local Buenos Aires day touched by
     [interval.startMs, interval.endMs), including overnight spans and closed periods. */
  function isWithinOperatingHours(garage, interval) {
    if (!garage || !interval || !interval.valid) {
      return { compatible: false, code: 'INVALID_INTERVAL', spansClosedPeriod: false };
    }
    var op = getGarageOperatingMinutes(garage);
    var closedDays = Array.isArray(garage.closedDays) ? garage.closedDays : [];
    if (op.open24 && closedDays.length === 0) {
      return { compatible: true, code: 'OK', spansClosedPeriod: false, open: op.open, close: op.close };
    }

    var slices = enumerateLocalDatesBetween(interval.startMs, interval.endMs);
    for (var i = 0; i < slices.length; i++) {
      var slice = slices[i];
      if (closedDays.indexOf(slice.dayOfWeek) !== -1) {
        return {
          compatible: false,
          code: 'OUT_OF_HOURS',
          spansClosedPeriod: true,
          closedDate: slice.dateStr,
          open: op.open,
          close: op.close
        };
      }
      if (!op.open24) {
        if (op.openMinutes < op.closeMinutes) {
          // Standard daytime window [openMinutes, closeMinutes)
          if (slice.startMinutes < op.openMinutes || slice.endMinutes > op.closeMinutes) {
            return {
              compatible: false,
              code: 'OUT_OF_HOURS',
              spansClosedPeriod: true,
              open: op.open,
              close: op.close
            };
          }
        } else if (op.openMinutes > op.closeMinutes) {
          // Overnight operating window: closed during [closeMinutes, openMinutes)
          if (slice.startMinutes < op.openMinutes && slice.endMinutes > op.closeMinutes) {
            return {
              compatible: false,
              code: 'OUT_OF_HOURS',
              spansClosedPeriod: true,
              open: op.open,
              close: op.close
            };
          }
        }
      }
    }

    return {
      compatible: true,
      code: 'OK',
      spansClosedPeriod: false,
      open: op.open,
      close: op.close
    };
  }

  function validateVehicleCompatibility(garage, vehicleType, vehicleHeightM) {
    var spec = VEHICLE_TYPES[vehicleType];
    if (!spec) {
      return {
        compatible: false,
        code: 'INVALID_VEHICLE_TYPE',
        vehicleType: vehicleType
      };
    }
    if (!garage) {
      return {
        compatible: false,
        code: 'INVALID_GARAGE',
        vehicleType: vehicleType
      };
    }
    var accepted = Array.isArray(garage.acceptedVehicleTypes)
      ? garage.acceptedVehicleTypes
      : VEHICLE_TYPE_LIST;
    if (accepted.indexOf(vehicleType) === -1) {
      return {
        compatible: false,
        code: 'VEHICLE_TYPE_NOT_ACCEPTED',
        vehicleType: vehicleType,
        acceptedVehicleTypes: accepted.slice(),
        maxHeightM: garage.maxHeightM
      };
    }

    var effectiveHeight = Number.isFinite(Number(vehicleHeightM)) && Number(vehicleHeightM) > 0
      ? Number(vehicleHeightM)
      : spec.defaultHeightM;

    if (Number.isFinite(garage.maxHeightM) && effectiveHeight > garage.maxHeightM + 1e-9) {
      return {
        compatible: false,
        code: 'HEIGHT_EXCEEDS_CLEARANCE',
        vehicleType: vehicleType,
        vehicleHeightM: effectiveHeight,
        maxHeightM: garage.maxHeightM,
        acceptedVehicleTypes: accepted.slice()
      };
    }

    return {
      compatible: true,
      code: 'OK',
      vehicleType: vehicleType,
      vehicleHeightM: effectiveHeight,
      maxHeightM: garage.maxHeightM,
      acceptedVehicleTypes: accepted.slice()
    };
  }

  /* ------------------------- Booking Normalization & Peak Concurrency (PF-01, PF-02) ------------------------- */

  function normalizeBooking(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var startMs = NaN;
    var endMs = NaN;

    if (typeof raw.startAt === 'string' && typeof raw.endAt === 'string') {
      startMs = Date.parse(raw.startAt);
      endMs = Date.parse(raw.endAt);
    }

    var date = raw.arrivalDate || raw.date;
    var departureDate = raw.departureDate;
    var arrival = raw.arrival;
    var departure = raw.departure;
    var durationMinutes = Number(raw.durationMinutes);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      // Backwards compatibility with V1/Sprint 1 bookings: { date, arrival, hours }
      var derived = validateInterval({
        date: date,
        departureDate: departureDate,
        arrival: arrival,
        departure: departure,
        hours: raw.hours,
        allowPast: true
      });
      if (derived.valid) {
        startMs = derived.startMs;
        endMs = derived.endMs;
        date = derived.date;
        departureDate = derived.departureDate;
        arrival = derived.arrival;
        departure = derived.departure;
        durationMinutes = derived.durationMinutes;
      }
    } else {
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        durationMinutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
      }
      var sp = getBuenosAiresLocalParts(startMs);
      var ep = getBuenosAiresLocalParts(endMs);
      if (!date || !arrival) {
        date = date || sp.dateStr;
        arrival = arrival || sp.timeStr;
      }
      if (!departureDate) {
        departureDate = ep.dateStr !== date && ep.timeStr === '00:00' && departure === '24:00'
          ? date
          : ep.dateStr;
      }
      if (!departure) {
        departure = ep.dateStr !== date && ep.timeStr === '00:00' && durationMinutes <= 1440
          ? '24:00'
          : ep.timeStr;
      }
    }

    var normalizedStatus = raw.status === 'cancelled' || raw.status === 'canceled'
      ? 'cancelled'
      : 'confirmed';

    var hours = Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes / 60
      : (Number(raw.hours) || 1);

    var lockedCost = raw.quote && Number.isFinite(Number(raw.quote.totalArs))
      ? Number(raw.quote.totalArs)
      : (Number(raw.cost) || 0);

    var finalDate = date || '';
    var finalDepDate = departureDate || finalDate;

    return Object.assign({}, raw, {
      status: normalizedStatus,
      vehicleType: VEHICLE_TYPES[raw.vehicleType] ? raw.vehicleType : 'car',
      date: finalDate,
      arrivalDate: finalDate,
      departureDate: finalDepDate,
      isOvernight: !!(finalDate && finalDepDate && finalDepDate !== finalDate),
      arrival: arrival || '10:00',
      departure: departure || formatMinutesToHHMM((parseTimeMinutes(arrival || '10:00', false) || 600) + Math.round(hours * 60)),
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : Math.round(hours * 60),
      hours: hours,
      startMs: startMs,
      endMs: endMs,
      startAt: raw.startAt || (Number.isFinite(startMs) ? getBuenosAiresLocalParts(startMs).dateStr + 'T' + getBuenosAiresLocalParts(startMs).timeStr + ':00' + UTC_OFFSET : null),
      endAt: raw.endAt || (Number.isFinite(endMs) ? getBuenosAiresLocalParts(endMs).dateStr + 'T' + getBuenosAiresLocalParts(endMs).timeStr + ':00' + UTC_OFFSET : null),
      timezone: raw.timezone || TIMEZONE,
      cost: lockedCost
    });
  }

  /* Half-open interval sweep-line: computes maximum simultaneous active bookings
     for garageId within [startMs, endMs).
     On timestamp ties, departures (-1) are processed before arrivals (+1) so
     adjacent half-open bookings [08:00, 11:00) and [11:00, 13:00) never overlap. */
  function getPeakConcurrentBookings(garageId, startMs, endMs, bookings) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return 0;
    }
    var list = Array.isArray(bookings) ? bookings : [];
    var events = [];

    for (var i = 0; i < list.length; i++) {
      var b = normalizeBooking(list[i]);
      if (!b) continue;
      if (b.status !== 'confirmed') continue;
      if (b.garageId !== garageId) continue;
      if (!Number.isFinite(b.startMs) || !Number.isFinite(b.endMs)) continue;
      // Half-open intersection test: [b.startMs, b.endMs) ∩ [startMs, endMs) != ∅
      if (b.startMs < endMs && startMs < b.endMs) {
        var clippedStart = Math.max(b.startMs, startMs);
        var clippedEnd = Math.min(b.endMs, endMs);
        if (clippedStart < clippedEnd) {
          events.push({ time: clippedStart, delta: 1 });
          events.push({ time: clippedEnd, delta: -1 });
        }
      }
    }

    if (events.length === 0) return 0;

    events.sort(function (a, b) {
      if (a.time !== b.time) return a.time - b.time;
      // End (-1) before Start (+1) for half-open [start, end)
      return a.delta - b.delta;
    });

    var current = 0;
    var peak = 0;
    for (var j = 0; j < events.length; j++) {
      current += events[j].delta;
      if (current > peak) peak = current;
    }
    return peak;
  }

  function getIntervalAvailability(garage, interval, bookings) {
    var totalSpaces = garage && Number.isFinite(Number(garage.totalSpaces))
      ? Math.max(0, Math.floor(Number(garage.totalSpaces)))
      : 0;
    if (!garage || !interval || !interval.valid) {
      return {
        totalSpaces: totalSpaces,
        peakConcurrent: 0,
        availableSpaces: 0,
        occupancyRatio: totalSpaces > 0 ? 0 : 1
      };
    }
    var peakConcurrent = getPeakConcurrentBookings(garage.id, interval.startMs, interval.endMs, bookings);
    var availableSpaces = Math.max(0, totalSpaces - peakConcurrent);
    var occupancyRatio = totalSpaces > 0 ? Math.min(1, peakConcurrent / totalSpaces) : 1;
    return {
      totalSpaces: totalSpaces,
      peakConcurrent: peakConcurrent,
      availableSpaces: availableSpaces,
      occupancyRatio: occupancyRatio
    };
  }

  /* ------------------------- Dynamic Pricing Engine (PF-04, R04) ------------------------- */

  function getOccupancyFactor(occupancyRatio) {
    var r = Number.isFinite(occupancyRatio) ? occupancyRatio : 0;
    if (r < 0.50) return 1.00;
    if (r < 0.75) return 1.20;
    return 1.40;
  }

  function isPeakHour(localHour) {
    for (var i = 0; i < PRICING_POLICY.peakHours.length; i++) {
      var range = PRICING_POLICY.peakHours[i];
      if (localHour >= range[0] && localHour < range[1]) return true;
    }
    return false;
  }

  function isWeekendDay(dayOfWeek) {
    return PRICING_POLICY.weekendDays.indexOf(dayOfWeek) !== -1;
  }

  /* Splits [startMs, endMs) along Buenos Aires local clock-hour boundaries. */
  function segmentIntervalByHour(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return [];
    }
    var segments = [];
    var cursor = startMs;
    while (cursor < endMs) {
      var local = getBuenosAiresLocalParts(cursor);
      var minsIntoHour = local.minute;
      var nextHourBoundary = cursor + (60 - minsIntoHour) * MS_PER_MINUTE;
      var segEnd = Math.min(endMs, nextHourBoundary);
      var endLocal = getBuenosAiresLocalParts(segEnd);
      var endTimeLabel = endLocal.dateStr !== local.dateStr && endLocal.timeStr === '00:00'
        ? '24:00'
        : endLocal.timeStr;
      var durationMinutes = Math.round((segEnd - cursor) / MS_PER_MINUTE);

      segments.push({
        startMs: cursor,
        endMs: segEnd,
        date: local.dateStr,
        start: local.timeStr,
        end: endTimeLabel,
        localHour: local.hour,
        dayOfWeek: local.dayOfWeek,
        durationMinutes: durationMinutes,
        durationHours: durationMinutes / 60
      });
      cursor = segEnd;
    }
    return segments;
  }

  /* Computes transparent dynamic quote per hourly segment and rounds the final
     ARS amount exactly once (R04, T06). */
  function calculateDynamicQuote(garage, interval, vehicleType, bookings, quotedAtIso) {
    if (!garage || !interval || !interval.valid) return null;
    var vehicleSpec = VEHICLE_TYPES[vehicleType] || VEHICLE_TYPES.car;
    var baseRatePerHour = Number(garage.ratePerHour) || 0;
    var totalSpaces = Math.max(0, Math.floor(Number(garage.totalSpaces) || 0));
    var rawSegments = segmentIntervalByHour(interval.startMs, interval.endMs);

    var totalExact = 0;
    var baseSubtotal = baseRatePerHour * interval.durationHours;
    var peakSegmentsCount = 0;
    var weekendSegmentsCount = 0;
    var maxOccupancyFactor = 1.00;
    var maxOccupancyRatio = 0;

    var detailedSegments = rawSegments.map(function (seg) {
      var peakInSeg = getPeakConcurrentBookings(garage.id, seg.startMs, seg.endMs, bookings);
      var occRatio = totalSpaces > 0 ? Math.min(1, peakInSeg / totalSpaces) : 1;
      var occupancyFactor = getOccupancyFactor(occRatio);
      var peakFactor = isPeakHour(seg.localHour) ? PRICING_POLICY.peakFactor : 1.00;
      var weekendFactor = isWeekendDay(seg.dayOfWeek) ? PRICING_POLICY.weekendFactor : 1.00;
      var vehicleFactor = vehicleSpec.factor;

      if (peakFactor > 1) peakSegmentsCount++;
      if (weekendFactor > 1) weekendSegmentsCount++;
      if (occupancyFactor > maxOccupancyFactor) maxOccupancyFactor = occupancyFactor;
      if (occRatio > maxOccupancyRatio) maxOccupancyRatio = occRatio;

      var combinedMultiplier = vehicleFactor * occupancyFactor * peakFactor * weekendFactor;
      var subtotalExact = baseRatePerHour * seg.durationHours * combinedMultiplier;
      totalExact += subtotalExact;

      return {
        date: seg.date,
        dayOfWeek: seg.dayOfWeek,
        start: seg.start,
        end: seg.end,
        durationMinutes: seg.durationMinutes,
        durationHours: seg.durationHours,
        peakConcurrent: peakInSeg,
        occupancyRatio: occRatio,
        occupancyFactor: occupancyFactor,
        peakFactor: peakFactor,
        weekendFactor: weekendFactor,
        vehicleFactor: vehicleFactor,
        combinedMultiplier: combinedMultiplier,
        subtotalExact: subtotalExact
      };
    });

    var totalArs = Math.round(totalExact);
    var effectiveMultiplier = baseSubtotal > 0 ? totalExact / baseSubtotal : 1;

    return {
      currency: PRICING_POLICY.currency,
      policyVersion: PRICING_POLICY.version,
      rounding: PRICING_POLICY.rounding,
      quotedAt: quotedAtIso || new Date().toISOString(),
      baseRatePerHour: baseRatePerHour,
      durationMinutes: interval.durationMinutes,
      durationHours: interval.durationHours,
      baseSubtotal: baseSubtotal,
      vehicleType: vehicleSpec.id,
      vehicleFactor: vehicleSpec.factor,
      hasPeak: peakSegmentsCount > 0,
      peakSegmentsCount: peakSegmentsCount,
      hasWeekend: weekendSegmentsCount > 0,
      weekendSegmentsCount: weekendSegmentsCount,
      maxOccupancyRatio: maxOccupancyRatio,
      maxOccupancyFactor: maxOccupancyFactor,
      effectiveMultiplier: effectiveMultiplier,
      totalExact: totalExact,
      totalArs: totalArs,
      segments: detailedSegments
    };
  }

  function cloneQuoteSnapshot(quote) {
    if (!quote) return null;
    return JSON.parse(JSON.stringify(quote));
  }

  /* ------------------------- Full Garage Eligibility ------------------------- */

  function evaluateGarageEligibility(garage, interval, vehicleType, bookings, vehicleHeightM) {
    if (!interval || !interval.valid) {
      return {
        eligible: false,
        reasonCode: interval ? interval.code : 'INVALID_INTERVAL',
        hoursCheck: { compatible: false, code: 'INVALID_INTERVAL' },
        vehicleCheck: validateVehicleCompatibility(garage, vehicleType, vehicleHeightM),
        availability: { totalSpaces: garage.totalSpaces, peakConcurrent: 0, availableSpaces: 0, occupancyRatio: 0 },
        quote: null
      };
    }

    var hoursCheck = isWithinOperatingHours(garage, interval);
    var vehicleCheck = validateVehicleCompatibility(garage, vehicleType, vehicleHeightM);
    var availability = getIntervalAvailability(garage, interval, bookings);
    var quote = calculateDynamicQuote(garage, interval, vehicleType, bookings);

    var eligible = true;
    var reasonCode = 'OK';
    if (!hoursCheck.compatible) {
      eligible = false;
      reasonCode = hoursCheck.code;
    } else if (!vehicleCheck.compatible) {
      eligible = false;
      reasonCode = vehicleCheck.code;
    } else if (availability.availableSpaces <= 0) {
      eligible = false;
      reasonCode = 'NO_AVAILABILITY';
    }

    return {
      eligible: eligible,
      reasonCode: reasonCode,
      hoursCheck: hoursCheck,
      vehicleCheck: vehicleCheck,
      availability: availability,
      quote: quote
    };
  }

  /* ------------------------- Amenities, Filters & Ratings (PF-05, PF-06) ------------------------- */

  /* Strictly separates true ('yes'), false ('no'), and null/undefined ('unknown'). */
  function getAmenityState(garage, amenityKey) {
    if (!garage) return 'unknown';
    var amenities = garage.amenities;
    if (amenities && Object.prototype.hasOwnProperty.call(amenities, amenityKey)) {
      if (amenities[amenityKey] === true) return 'yes';
      if (amenities[amenityKey] === false) return 'no';
      return 'unknown';
    }
    // Fallback to legacy boolean properties only for covered/open24 when amenities map omitted
    if (amenityKey === 'covered' && typeof garage.techado === 'boolean') {
      return garage.techado ? 'yes' : 'no';
    }
    if (amenityKey === 'open24' && typeof garage.open24 === 'boolean') {
      return garage.open24 ? 'yes' : 'no';
    }
    return 'unknown';
  }

  function getGarageRating(garage) {
    if (!garage || !garage.rating || !Number.isFinite(Number(garage.rating.score))) {
      return {
        score: null,
        reviewCount: 0,
        provenance: 'synthetic_demo',
        isDemo: true
      };
    }
    var score = Math.max(1, Math.min(5, Number(garage.rating.score)));
    var count = Math.max(0, Math.floor(Number(garage.rating.reviewCount) || 0));
    return {
      score: Math.round(score * 10) / 10,
      reviewCount: count,
      provenance: garage.rating.provenance || 'synthetic_demo',
      isDemo: true
    };
  }

  /* Evaluates combined display filters without EVER altering garage eligibility (S2-T01, S2-T02).
     Filtering by an amenity requires state === 'yes' (both 'no' and 'unknown' are excluded). */
  function matchesFilters(garage, evalRes, filters, distanceKm) {
    var f = filters || {};
    if (f.onlyEligible && (!evalRes || !evalRes.eligible)) {
      return false;
    }

    var reqAmenities = [];
    if (Array.isArray(f.amenities)) {
      reqAmenities = f.amenities;
    } else if (f.amenities && typeof f.amenities === 'object') {
      reqAmenities = Object.keys(f.amenities).filter(function (k) { return !!f.amenities[k]; });
    }

    for (var i = 0; i < reqAmenities.length; i++) {
      if (getAmenityState(garage, reqAmenities[i]) !== 'yes') {
        return false;
      }
    }

    if (f.maxPriceArs !== null && f.maxPriceArs !== undefined && f.maxPriceArs !== '') {
      var maxPrice = Number(f.maxPriceArs);
      if (Number.isFinite(maxPrice) && maxPrice > 0) {
        var total = evalRes && evalRes.quote ? evalRes.quote.totalArs : Number(garage.ratePerHour);
        if (!Number.isFinite(total) || total > maxPrice) return false;
      }
    }

    if (f.minRating !== null && f.minRating !== undefined && f.minRating !== '') {
      var minRating = Number(f.minRating);
      if (Number.isFinite(minRating) && minRating > 0) {
        var rating = getGarageRating(garage);
        if (rating.score === null || rating.score < minRating - 1e-9) return false;
      }
    }

    if (f.maxDistanceKm !== null && f.maxDistanceKm !== undefined && f.maxDistanceKm !== '') {
      var maxDist = Number(f.maxDistanceKm);
      if (Number.isFinite(maxDist) && maxDist > 0 && Number.isFinite(distanceKm)) {
        if (distanceKm > maxDist + 1e-9) return false;
      }
    }

    return true;
  }

  function filterGarages(garages, evaluations, filters, distanceFn) {
    var list = Array.isArray(garages) ? garages : [];
    var evalMap = evaluations || {};
    return list.filter(function (g) {
      var km = typeof distanceFn === 'function' ? distanceFn(g) : null;
      return matchesFilters(g, evalMap[g.id], filters, km);
    });
  }

  function sortGarages(garages, evaluations, sortMode, distanceFn) {
    var list = Array.isArray(garages) ? garages.slice() : [];
    var evalMap = evaluations || {};
    var distOf = typeof distanceFn === 'function' ? distanceFn : function () { return 0; };

    return list.sort(function (a, b) {
      var ea = evalMap[a.id];
      var eb = evalMap[b.id];
      var qa = ea && ea.quote ? ea.quote.totalArs : Number(a.ratePerHour) || 0;
      var qb = eb && eb.quote ? eb.quote.totalArs : Number(b.ratePerHour) || 0;

      if (sortMode === 'precio_asc') {
        var diffAsc = qa - qb;
        return diffAsc !== 0 ? diffAsc : distOf(a) - distOf(b);
      }
      if (sortMode === 'precio_desc') {
        var diffDesc = qb - qa;
        return diffDesc !== 0 ? diffDesc : distOf(a) - distOf(b);
      }
      if (sortMode === 'rating_desc') {
        var ra = getGarageRating(a);
        var rb = getGarageRating(b);
        var sa = ra.score !== null ? ra.score : -1;
        var sb = rb.score !== null ? rb.score : -1;
        if (Math.abs(sb - sa) > 1e-9) return sb - sa;
        if (rb.reviewCount !== ra.reviewCount) return rb.reviewCount - ra.reviewCount;
        return distOf(a) - distOf(b);
      }

      var dist = distOf(a) - distOf(b);
      if (Math.abs(dist) > 1e-9) return dist;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  /* ------------------------- Validated External Directions (PF-14) ------------------------- */

  function isValidCoordinates(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (lat === 0 && lng === 0) return false;
    return true;
  }

  /* Builds keyless Google Maps external directions URL only for validated coordinates.
     UI MUST label this explicitly as navigation to a synthetic/demo location. */
  function buildExternalDirectionsUrl(garage) {
    if (!garage || !isValidCoordinates(garage.lat, garage.lng)) {
      return null;
    }
    var dest = garage.lat.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') +
      ',' +
      garage.lng.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return 'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(dest) +
      '&travelmode=driving';
  }

  /* ------------------------- Durable Local Storage Adapter (PF-02, T08) ------------------------- */

  function createStorageAdapter(storageImpl, storageKey) {
    return {
      key: storageKey,
      read: function () {
        try {
          if (!storageImpl || typeof storageImpl.getItem !== 'function') {
            return { ok: false, error: 'Storage backend unavailable', data: [] };
          }
          var raw = storageImpl.getItem(storageKey);
          if (!raw) return { ok: true, data: [] };
          var parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            return { ok: true, data: [] };
          }
          return {
            ok: true,
            data: parsed.map(normalizeBooking).filter(Boolean)
          };
        } catch (err) {
          return {
            ok: false,
            error: err && err.message ? err.message : String(err),
            data: []
          };
        }
      },
      write: function (list) {
        try {
          if (!storageImpl || typeof storageImpl.setItem !== 'function') {
            return { ok: false, error: 'Storage backend unavailable' };
          }
          var serialized = JSON.stringify(list);
          storageImpl.setItem(storageKey, serialized);
          // Read-back durability verification
          if (typeof storageImpl.getItem === 'function') {
            var verify = storageImpl.getItem(storageKey);
            if (verify !== serialized) {
              return { ok: false, error: 'Storage verification mismatch' };
            }
          }
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err && err.message ? err.message : String(err)
          };
        }
      }
    };
  }

  function createMemoryStorage() {
    var map = {};
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
      },
      setItem: function (k, v) {
        map[k] = String(v);
      },
      removeItem: function (k) {
        delete map[k];
      }
    };
  }

  /* ------------------------- Submission Guard & Booking Lifecycle (PF-02, T04, T07, T08, T10) ------------------------- */

  function createSubmissionGuard() {
    var inFlight = false;
    var consumedTokens = {};
    return {
      isInFlight: function () { return inFlight; },
      hasConsumed: function (token) { return !!(token && consumedTokens[token]); },
      acquire: function (token) {
        if (inFlight) return { ok: false, code: 'SUBMISSION_IN_PROGRESS' };
        if (token && consumedTokens[token]) return { ok: false, code: 'DUPLICATE_SUBMISSION' };
        inFlight = true;
        return { ok: true };
      },
      complete: function (token, succeeded) {
        if (succeeded && token) consumedTokens[token] = true;
        inFlight = false;
      },
      reset: function () {
        inFlight = false;
        consumedTokens = {};
      }
    };
  }

  function defaultGenerateBookingId(existing) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var taken = {};
    (existing || []).forEach(function (b) { if (b && b.id) taken[b.id] = true; });
    var id = '';
    do {
      id = 'PF-2026-';
      for (var i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (taken[id]);
    return id;
  }

  function createBooking(options) {
    var opts = options || {};
    var guard = opts.submissionGuard || null;
    var token = opts.submissionToken || null;

    if (guard) {
      var lock = guard.acquire(token);
      if (!lock.ok) {
        return { ok: false, code: lock.code };
      }
    }

    var succeeded = false;
    try {
      var garage = opts.garage;
      if (!garage) {
        return { ok: false, code: 'NO_GARAGE_SELECTED' };
      }

      var interval = opts.interval && opts.interval.valid !== undefined
        ? opts.interval
        : validateInterval({
            date: opts.date,
            arrivalDate: opts.arrivalDate,
            departureDate: opts.departureDate,
            arrival: opts.arrival,
            departure: opts.departure,
            hours: opts.hours,
            maxDurationMinutes: opts.maxDurationMinutes,
            allowPast: opts.allowPast,
            referenceNow: opts.referenceNow
          });

      if (!interval || !interval.valid) {
        return { ok: false, code: interval ? interval.code : 'INVALID_INTERVAL' };
      }

      var hoursCheck = isWithinOperatingHours(garage, interval);
      if (!hoursCheck.compatible) {
        return { ok: false, code: hoursCheck.code, details: hoursCheck };
      }

      var vehicleCheck = validateVehicleCompatibility(garage, opts.vehicleType || 'car', opts.vehicleHeightM);
      if (!vehicleCheck.compatible) {
        return { ok: false, code: vehicleCheck.code, details: vehicleCheck };
      }

      var storage = opts.storageAdapter;
      if (!storage) {
        return { ok: false, code: 'STORAGE_UNAVAILABLE' };
      }

      // Fresh read at confirmation time (PF-02 revalidation)
      var readRes = storage.read();
      if (!readRes.ok) {
        return { ok: false, code: 'STORAGE_READ_FAILED', error: readRes.error };
      }
      var existing = readRes.data;

      var availability = getIntervalAvailability(garage, interval, existing);
      if (availability.availableSpaces <= 0) {
        return { ok: false, code: 'NO_AVAILABILITY', availability: availability };
      }

      var quote = calculateDynamicQuote(garage, interval, vehicleCheck.vehicleType, existing);
      var frozenQuote = cloneQuoteSnapshot(quote);
      var idGen = typeof opts.generateId === 'function' ? opts.generateId : defaultGenerateBookingId;
      var plate = String(opts.plate || '').trim().toUpperCase() || 'AA 000 AA';

      var booking = {
        id: idGen(existing),
        status: 'confirmed',
        garageId: garage.id,
        garage: garage.name,
        address: garage.address,
        lat: garage.lat,
        lng: garage.lng,
        plate: plate,
        vehicleType: vehicleCheck.vehicleType,
        vehicleHeightM: vehicleCheck.vehicleHeightM,
        date: interval.date,
        arrivalDate: interval.arrivalDate || interval.date,
        departureDate: interval.departureDate || interval.date,
        isOvernight: !!interval.isOvernight,
        arrival: interval.arrival,
        departure: interval.departure,
        durationMinutes: interval.durationMinutes,
        hours: interval.durationHours,
        startAt: interval.startAt,
        endAt: interval.endAt,
        timezone: TIMEZONE,
        cost: frozenQuote.totalArs,
        quote: frozenQuote,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
        payment: 'simulado',
        source: opts.source || 'user',
        persistenceScope: 'browser_local_storage'
      };

      var nextBookings = [booking].concat(existing);
      var writeRes = storage.write(nextBookings);
      if (!writeRes.ok) {
        return {
          ok: false,
          code: 'STORAGE_WRITE_FAILED',
          error: writeRes.error
        };
      }

      succeeded = true;
      return {
        ok: true,
        code: 'OK',
        booking: booking,
        bookings: nextBookings,
        availabilityAfter: getIntervalAvailability(garage, interval, nextBookings)
      };
    } finally {
      if (guard) {
        guard.complete(token, succeeded);
      }
    }
  }

  function cancelBookingById(bookingId, storageAdapter, reason) {
    if (!storageAdapter) {
      return { ok: false, code: 'STORAGE_UNAVAILABLE' };
    }
    var readRes = storageAdapter.read();
    if (!readRes.ok) {
      return { ok: false, code: 'STORAGE_READ_FAILED', error: readRes.error };
    }
    var list = readRes.data.slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === bookingId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return { ok: false, code: 'BOOKING_NOT_FOUND' };
    }
    if (list[idx].status === 'cancelled') {
      return { ok: false, code: 'ALREADY_CANCELLED', booking: list[idx] };
    }

    var updated = Object.assign({}, list[idx], {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason || 'user_cancelled'
    });
    list[idx] = updated;

    var writeRes = storageAdapter.write(list);
    if (!writeRes.ok) {
      return { ok: false, code: 'STORAGE_WRITE_FAILED', error: writeRes.error };
    }

    return {
      ok: true,
      code: 'OK',
      booking: updated,
      bookings: list
    };
  }

  /* ------------------------- Built-in Isolated QA Scenario Runner (T01–T10) ------------------------- */

  function runCoreAcceptanceScenarios() {
    var results = [];
    var futureWeekday = '2026-12-15'; // Tuesday in BA
    var futureSaturday = '2026-12-19'; // Saturday in BA

    var testGarageCap1 = {
      id: 'qa-garage-cap-1',
      name: 'QA Garage Cap 1',
      address: 'Test 100, CABA',
      ratePerHour: 6000,
      totalSpaces: 1,
      techado: true,
      open24: false,
      operatingHours: { open: '07:00', close: '22:00' },
      acceptedVehicleTypes: ['motorcycle', 'car'],
      maxHeightM: 1.80,
      dataProvenance: 'synthetic_qa'
    };

    var testGarageCap2 = {
      id: 'qa-garage-cap-2',
      name: 'QA Garage Cap 2',
      address: 'Test 200, CABA',
      ratePerHour: 6000,
      totalSpaces: 2,
      techado: true,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 2.50,
      dataProvenance: 'synthetic_qa'
    };

    // T01: capacity 1, reserve 08:00–11:00 and 11:00–13:00; both accepted
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t01');
      var r1 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 101 AA', storageAdapter: store, allowPast: true });
      var r2 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '11:00', departure: '13:00', vehicleType: 'car', plate: 'AA 102 AA', storageAdapter: store, allowPast: true });
      var pass = r1.ok && r2.ok && store.read().data.length === 2;
      results.push({
        id: 'T01',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'b1=' + r1.code + ', b2=' + r2.code + ', stored=' + store.read().data.length
      });
    })();

    // T02: capacity 1, reserve 08:00–11:00 then 10:00–12:00; reject second
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t02');
      var r1 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 201 AA', storageAdapter: store, allowPast: true });
      var r2 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', plate: 'AA 202 AA', storageAdapter: store, allowPast: true });
      var pass = r1.ok && !r2.ok && r2.code === 'NO_AVAILABILITY' && store.read().data.length === 1;
      results.push({
        id: 'T02',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'b1=' + r1.code + ', b2=' + r2.code + ', stored=' + store.read().data.length
      });
    })();

    // T03: capacity 2, existing 08:00–09:00 and 10:00–11:00; request 08:00–11:00 -> accept exactly 1 extra
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t03');
      var e1 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '08:00', departure: '09:00', vehicleType: 'car', plate: 'AA 301 AA', storageAdapter: store, allowPast: true });
      var e2 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '11:00', vehicleType: 'car', plate: 'AA 302 AA', storageAdapter: store, allowPast: true });
      var interval = validateInterval({ date: futureWeekday, arrival: '08:00', departure: '11:00', allowPast: true });
      var availBefore = getIntervalAvailability(testGarageCap2, interval, store.read().data);
      var extra1 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 303 AA', storageAdapter: store, allowPast: true });
      var extra2 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 304 AA', storageAdapter: store, allowPast: true });
      var pass = e1.ok && e2.ok && availBefore.peakConcurrent === 1 && availBefore.availableSpaces === 1 && extra1.ok && !extra2.ok && extra2.code === 'NO_AVAILABILITY';
      results.push({
        id: 'T03',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'peakBefore=' + availBefore.peakConcurrent + ', availBefore=' + availBefore.availableSpaces + ', extra1=' + extra1.code + ', extra2=' + extra2.code
      });
    })();

    // T04: cancel active booking and release interval; retain audit status
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t04');
      var r1 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 401 AA', storageAdapter: store, allowPast: true });
      var blocked = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '09:00', departure: '10:00', vehicleType: 'car', plate: 'AA 402 AA', storageAdapter: store, allowPast: true });
      var cancelRes = cancelBookingById(r1.booking.id, store, 'qa_test');
      var r2 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '09:00', departure: '10:00', vehicleType: 'car', plate: 'AA 403 AA', storageAdapter: store, allowPast: true });
      var ledger = store.read().data;
      var cancelledRecord = ledger.find(function (b) { return b.id === r1.booking.id; });
      var pass = r1.ok && !blocked.ok && cancelRes.ok && r2.ok && cancelledRecord && cancelledRecord.status === 'cancelled' && !!cancelledRecord.cancelledAt;
      results.push({
        id: 'T04',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'blocked=' + blocked.code + ', cancel=' + cancelRes.code + ', rebook=' + r2.code + ', retainedStatus=' + (cancelledRecord ? cancelledRecord.status : 'missing')
      });
    })();

    // T05: reject invalid date/time, negative duration, incompatible vehicle and out-of-hours
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t05');
      var badDate = createBooking({ garage: testGarageCap1, date: '2026-02-30', arrival: '08:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var badTime = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '25:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var negDur = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '12:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var badVeh = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '10:00', vehicleType: 'suv', storageAdapter: store, allowPast: true });
      var badHeight = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '10:00', vehicleType: 'car', vehicleHeightM: 2.10, storageAdapter: store, allowPast: true });
      var outHours = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '21:00', departure: '23:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var pass = !badDate.ok && badDate.code === 'INVALID_DATE' &&
        !badTime.ok && badTime.code === 'INVALID_ARRIVAL_TIME' &&
        !negDur.ok && negDur.code === 'NON_POSITIVE_DURATION' &&
        !badVeh.ok && badVeh.code === 'VEHICLE_TYPE_NOT_ACCEPTED' &&
        !badHeight.ok && badHeight.code === 'HEIGHT_EXCEEDS_CLEARANCE' &&
        !outHours.ok && outHours.code === 'OUT_OF_HOURS' &&
        store.read().data.length === 0;
      results.push({
        id: 'T05',
        status: pass ? 'PASS' : 'FAIL',
        actual: [badDate.code, badTime.code, negDur.code, badVeh.code, badHeight.code, outHours.code].join(', ')
      });
    })();

    // T06: hourly segment quote with peak/weekend/occupancy + car vs SUV + single final rounding
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t06');
      // Add 1 existing booking on 09:00-10:00 -> 50% occupancy on cap 2 (factor 1.20)
      createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '09:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var interval = validateInterval({ date: futureWeekday, arrival: '09:00', departure: '11:00', allowPast: true });
      var qCar = calculateDynamicQuote(testGarageCap2, interval, 'car', store.read().data);
      var qSuv = calculateDynamicQuote(testGarageCap2, interval, 'suv', store.read().data);
      // Seg1 (09-10): 6000 * 1.00 * 1.20 * 1.15 * 1.00 = 8280; Seg2 (10-11): 6000 * 1.00 * 1.00 * 1.00 * 1.00 = 6000 -> 14280
      // SUV: Seg1 10764 + Seg2 7800 = 18564
      // Single rounding check on fractional rate:
      var fracGarage = Object.assign({}, testGarageCap2, { ratePerHour: 1001 });
      var wkndInterval = validateInterval({ date: futureSaturday, arrival: '10:00', departure: '12:00', allowPast: true });
      // Each hour: 1001 * 0.65 * 1.00 * 1.00 * 1.10 = 715.715 -> 2h exact = 1431.43 -> single round = 1431 (per-seg round would be 716+716=1432)
      var qFrac = calculateDynamicQuote(fracGarage, wkndInterval, 'motorcycle', []);
      var pass = qCar.totalArs === 14280 && qSuv.totalArs === 18564 && qSuv.totalArs > qCar.totalArs &&
        qCar.segments.length === 2 && qCar.segments[0].peakFactor === 1.15 && qCar.segments[0].occupancyFactor === 1.20 &&
        qFrac.totalArs === 1431 && qFrac.segments[0].weekendFactor === 1.10;
      results.push({
        id: 'T06',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'car=' + qCar.totalArs + ', suv=' + qSuv.totalArs + ', singleRound=' + qFrac.totalArs + ' (exact=' + qFrac.totalExact.toFixed(2) + ')'
      });
    })();

    // T07: changing rate after confirmation cannot change stored price
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t07');
      var mutableGarage = Object.assign({}, testGarageCap2, { ratePerHour: 6000 });
      var r1 = createBooking({ garage: mutableGarage, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var originalPrice = r1.booking.cost;
      mutableGarage.ratePerHour = 12000;
      var reloaded = store.read().data.find(function (b) { return b.id === r1.booking.id; });
      var newQuote = calculateDynamicQuote(mutableGarage, validateInterval({ date: futureWeekday, arrival: '10:00', departure: '12:00', allowPast: true }), 'car', []);
      var pass = r1.ok && originalPrice === 12000 && reloaded.cost === 12000 && reloaded.quote.baseRatePerHour === 6000 && newQuote.totalArs === 24000;
      results.push({
        id: 'T07',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'locked=' + reloaded.cost + ', lockedBase=' + reloaded.quote.baseRatePerHour + ', newRateQuote=' + newQuote.totalArs
      });
    })();

    // T08: storage failure prevents durable confirmation
    (function () {
      var failingStorage = {
        getItem: function () { return '[]'; },
        setItem: function () { throw new Error('QuotaExceededError (simulated)'); }
      };
      var store = createStorageAdapter(failingStorage, 'qa.t08');
      var res = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var pass = !res.ok && res.code === 'STORAGE_WRITE_FAILED';
      results.push({
        id: 'T08',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'ok=' + res.ok + ', code=' + res.code + ', err=' + res.error
      });
    })();

    // T10: rapid repeated confirm with same submission token creates at most 1 booking
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t10');
      var guard = createSubmissionGuard();
      var token = 'modal-session-1';
      var r1 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, submissionGuard: guard, submissionToken: token, allowPast: true });
      var r2 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, submissionGuard: guard, submissionToken: token, allowPast: true });
      var pass = r1.ok && !r2.ok && r2.code === 'DUPLICATE_SUBMISSION' && store.read().data.length === 1;
      results.push({
        id: 'T10',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'first=' + r1.code + ', second=' + r2.code + ', stored=' + store.read().data.length
      });
    })();

    return results;
  }

  /* ------------------------- Sprint 02 Isolated QA Scenarios (S2-T01..S2-T08) ------------------------- */

  function runSprint02AcceptanceScenarios() {
    var results = [];
    var tue = '2026-12-15';
    var wed = '2026-12-16';
    var fri = '2026-12-18'; // Friday in BA
    var sat = '2026-12-19'; // Saturday in BA

    // S2-T01: combined amenity/price/rating/distance filters + unknown excluded
    (function () {
      var interval = validateInterval({ date: tue, arrival: '10:00', departure: '12:00', allowPast: true });
      var evals = {};
      DEFAULT_GARAGES.forEach(function (g) { evals[g.id] = evaluateGarageEligibility(g, interval, 'car', []); });
      var filtered = filterGarages(DEFAULT_GARAGES, evals, {
        amenities: ['covered', 'evCharging'],
        minRating: 4.5,
        maxPriceArs: 15000
      }, function () { return 0.5; });
      var unknownExcluded = getAmenityState(DEFAULT_GARAGES[1], 'accessible') === 'unknown' &&
        filterGarages([DEFAULT_GARAGES[1]], evals, { amenities: ['accessible'] }).length === 0;
      var pass = filtered.length === 2 && unknownExcluded;
      results.push({
        id: 'S2-T01',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'matched=' + filtered.map(function (g) { return g.id; }).join(',') + ', unknownExcluded=' + unknownExcluded
      });
    })();

    // S2-T05: cap 1 overnight 23:00-01:00 blocks 00:00-00:30, allows 01:00-02:00, cancel releases
    (function () {
      var g24 = {
        id: 'qa-s2-cap1-24h', name: 'QA 24h Cap1', address: 'Test 24h',
        ratePerHour: 6000, totalSpaces: 1, open24: true,
        operatingHours: { open: '00:00', close: '24:00' },
        acceptedVehicleTypes: ['car'], maxHeightM: 2.2
      };
      var store = createStorageAdapter(createMemoryStorage(), 'qa.s2t05');
      var r1 = createBooking({ garage: g24, arrivalDate: tue, departureDate: wed, arrival: '23:00', departure: '01:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var rBlocked = createBooking({ garage: g24, arrivalDate: wed, departureDate: wed, arrival: '00:00', departure: '00:30', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var rAdj = createBooking({ garage: g24, arrivalDate: wed, departureDate: wed, arrival: '01:00', departure: '02:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var c1 = cancelBookingById(r1.booking.id, store, 'qa_s2');
      var rAfter = createBooking({ garage: g24, arrivalDate: wed, departureDate: wed, arrival: '00:00', departure: '00:30', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var pass = r1.ok && !rBlocked.ok && rBlocked.code === 'NO_AVAILABILITY' && rAdj.ok && c1.ok && rAfter.ok;
      results.push({
        id: 'S2-T05',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'overnight=' + r1.code + ', overlap=' + rBlocked.code + ', adjacent=' + rAdj.code + ', afterCancel=' + rAfter.code
      });
    })();

    // S2-T06: non-24h rejects overnight closed span; 24h accepts
    (function () {
      var non24 = DEFAULT_GARAGES[1]; // Palermo Soho 07:00-22:00
      var g24 = DEFAULT_GARAGES[0];   // Puerto Madero 24h
      var ov = validateInterval({ arrivalDate: tue, departureDate: wed, arrival: '21:00', departure: '08:00', allowPast: true });
      var hNon24 = isWithinOperatingHours(non24, ov);
      var h24 = isWithinOperatingHours(g24, ov);
      var pass = !hNon24.compatible && hNon24.code === 'OUT_OF_HOURS' && h24.compatible;
      results.push({
        id: 'S2-T06',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'non24=' + hNon24.code + ', open24=' + h24.code
      });
    })();

    // S2-T07: Friday-to-Saturday applies weekend multiplier only to Saturday segments
    (function () {
      var g24 = Object.assign({}, DEFAULT_GARAGES[0], { ratePerHour: 1000 });
      var friSat = validateInterval({ arrivalDate: fri, departureDate: sat, arrival: '22:00', departure: '02:00', allowPast: true });
      var q = calculateDynamicQuote(g24, friSat, 'car', []);
      // Fri 22-23 (1.0), Fri 23-24 (1.0), Sat 00-01 (1.1), Sat 01-02 (1.1) -> 1000+1000+1100+1100 = 4200
      var pass = q.segments.length === 4 &&
        q.segments[0].weekendFactor === 1.00 && q.segments[1].weekendFactor === 1.00 &&
        q.segments[2].weekendFactor === 1.10 && q.segments[3].weekendFactor === 1.10 &&
        q.totalArs === 4200;
      results.push({
        id: 'S2-T07',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'segs=' + q.segments.length + ', friWknd=' + q.segments[0].weekendFactor + ', satWknd=' + q.segments[2].weekendFactor + ', total=' + q.totalArs
      });
    })();

    // S2-T08: invalid dates, equal/reversed, >72h rejected
    (function () {
      var badDep = validateInterval({ arrivalDate: tue, departureDate: '2026-02-30', arrival: '10:00', departure: '12:00', allowPast: true });
      var rev = validateInterval({ arrivalDate: wed, departureDate: tue, arrival: '10:00', departure: '12:00', allowPast: true });
      var eq = validateInterval({ arrivalDate: tue, departureDate: tue, arrival: '10:00', departure: '10:00', allowPast: true });
      var tooLong = validateInterval({ arrivalDate: tue, departureDate: '2026-12-19', arrival: '10:00', departure: '11:00', allowPast: true });
      var pass = !badDep.valid && !rev.valid && !eq.valid && !tooLong.valid && tooLong.code === 'EXCEEDS_MAX_DURATION';
      results.push({
        id: 'S2-T08',
        status: pass ? 'PASS' : 'FAIL',
        actual: [badDep.code, rev.code, eq.code, tooLong.code].join(', ')
      });
    })();

    return results;
  }

  /* ------------------------- Sprint 2B: Smart Recommendations, Comparator & Destination Search ------------------------- */

  function getAverageHourlyRate(quote, fallbackRate) {
    if (quote && Number.isFinite(Number(quote.totalArs)) && Number(quote.durationHours) > 0) {
      return Math.round(Number(quote.totalArs) / Number(quote.durationHours));
    }
    return Math.round(Number(fallbackRate) || 0);
  }

  /* Explicit, deterministic smart recommendations across eligible garages.
     - lowestTotal: minimum quote.totalArs among eligible garages (tie-break: distance, id)
     - closest: minimum distanceKm among eligible garages (tie-break: totalArs, id)
     - highestRating: maximum demo rating.score among eligible garages (tie-break: reviewCount, distance, id)
     - bestValue: min-max normalized totalArs & distanceKm among eligible garages with equal 0.5/0.5 weights (lower is better)
     - lowAvailabilityIds: factual badge strictly when eligible && 1 <= availableSpaces <= 2 (no false urgency) */
  function computeRecommendations(garages, evaluations, distanceFn) {
    var list = Array.isArray(garages) ? garages : [];
    var evalMap = evaluations || {};
    var distOf = typeof distanceFn === 'function' ? distanceFn : function () { return 0; };

    var eligibleEntries = [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      var ev = evalMap[g.id];
      if (!ev || !ev.eligible || !ev.quote) continue;
      var totalArs = Number(ev.quote.totalArs);
      var distKm = Number(distOf(g));
      if (!Number.isFinite(distKm)) distKm = 0;
      var rating = getGarageRating(g);
      var avail = ev.availability ? Number(ev.availability.availableSpaces) : 0;
      eligibleEntries.push({
        garage: g,
        id: g.id,
        totalArs: totalArs,
        distanceKm: distKm,
        ratingScore: rating.score !== null ? rating.score : -1,
        reviewCount: rating.reviewCount || 0,
        availableSpaces: avail
      });
    }

    var byGarageId = {};
    var scoresByGarageId = {};
    var lowAvailabilityIds = [];

    if (eligibleEntries.length === 0) {
      return {
        lowestTotal: null,
        closest: null,
        highestRating: null,
        bestValue: null,
        lowAvailabilityIds: [],
        byGarageId: {},
        scoresByGarageId: {},
        eligibleCount: 0,
        policy: RECOMMENDATION_POLICY
      };
    }

    var minPrice = Infinity;
    var maxPrice = -Infinity;
    var minDist = Infinity;
    var maxDist = -Infinity;

    for (var j = 0; j < eligibleEntries.length; j++) {
      var e = eligibleEntries[j];
      if (e.totalArs < minPrice) minPrice = e.totalArs;
      if (e.totalArs > maxPrice) maxPrice = e.totalArs;
      if (e.distanceKm < minDist) minDist = e.distanceKm;
      if (e.distanceKm > maxDist) maxDist = e.distanceKm;
      byGarageId[e.id] = [];
      if (e.availableSpaces > 0 && e.availableSpaces <= RECOMMENDATION_POLICY.lowAvailabilityThreshold) {
        lowAvailabilityIds.push(e.id);
      }
    }

    var priceSpan = maxPrice - minPrice;
    var distSpan = maxDist - minDist;
    var wPrice = RECOMMENDATION_POLICY.valueWeights.price;
    var wDist = RECOMMENDATION_POLICY.valueWeights.distance;

    for (var k = 0; k < eligibleEntries.length; k++) {
      var item = eligibleEntries[k];
      var normPrice = priceSpan > 1e-9 ? (item.totalArs - minPrice) / priceSpan : 0;
      var normDist = distSpan > 1e-9 ? (item.distanceKm - minDist) / distSpan : 0;
      var valueScore = wPrice * normPrice + wDist * normDist;
      item.normPrice = normPrice;
      item.normDistance = normDist;
      item.valueScore = valueScore;
      scoresByGarageId[item.id] = {
        normPrice: Math.round(normPrice * 10000) / 10000,
        normDistance: Math.round(normDist * 10000) / 10000,
        valueScore: Math.round(valueScore * 10000) / 10000
      };
    }

    var lowestTotal = eligibleEntries.slice().sort(function (a, b) {
      if (a.totalArs !== b.totalArs) return a.totalArs - b.totalArs;
      if (Math.abs(a.distanceKm - b.distanceKm) > 1e-9) return a.distanceKm - b.distanceKm;
      return String(a.id).localeCompare(String(b.id));
    })[0];

    var closest = eligibleEntries.slice().sort(function (a, b) {
      if (Math.abs(a.distanceKm - b.distanceKm) > 1e-9) return a.distanceKm - b.distanceKm;
      if (a.totalArs !== b.totalArs) return a.totalArs - b.totalArs;
      return String(a.id).localeCompare(String(b.id));
    })[0];

    var highestRating = eligibleEntries.slice().sort(function (a, b) {
      if (Math.abs(b.ratingScore - a.ratingScore) > 1e-9) return b.ratingScore - a.ratingScore;
      if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
      if (Math.abs(a.distanceKm - b.distanceKm) > 1e-9) return a.distanceKm - b.distanceKm;
      return String(a.id).localeCompare(String(b.id));
    })[0];

    var bestValue = eligibleEntries.slice().sort(function (a, b) {
      if (Math.abs(a.valueScore - b.valueScore) > 1e-9) return a.valueScore - b.valueScore;
      if (a.totalArs !== b.totalArs) return a.totalArs - b.totalArs;
      if (Math.abs(a.distanceKm - b.distanceKm) > 1e-9) return a.distanceKm - b.distanceKm;
      return String(a.id).localeCompare(String(b.id));
    })[0];

    if (bestValue) byGarageId[bestValue.id].push('best_value');
    if (lowestTotal) byGarageId[lowestTotal.id].push('lowest_total');
    if (closest) byGarageId[closest.id].push('closest');
    if (highestRating && highestRating.ratingScore >= 0) byGarageId[highestRating.id].push('highest_rating');
    lowAvailabilityIds.forEach(function (id) {
      if (byGarageId[id]) byGarageId[id].push('low_availability');
    });

    return {
      lowestTotal: lowestTotal ? lowestTotal.id : null,
      closest: closest ? closest.id : null,
      highestRating: highestRating && highestRating.ratingScore >= 0 ? highestRating.id : null,
      bestValue: bestValue ? bestValue.id : null,
      lowAvailabilityIds: lowAvailabilityIds,
      byGarageId: byGarageId,
      scoresByGarageId: scoresByGarageId,
      eligibleCount: eligibleEntries.length,
      policy: RECOMMENDATION_POLICY
    };
  }

  /* Builds a side-by-side comparison matrix for up to 3 garages under the exact same interval & vehicle. */
  function buildComparisonMatrix(selectedGarages, evaluations, interval, vehicleType, distanceFn, bookings) {
    var list = Array.isArray(selectedGarages) ? selectedGarages : [];
    var seen = {};
    var unique = [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g || !g.id || seen[g.id]) continue;
      seen[g.id] = true;
      unique.push(g);
    }

    if (unique.length === 0) {
      return { ok: false, code: 'COMPARE_EMPTY', max: MAX_COMPARE_GARAGES, items: [] };
    }
    if (unique.length > MAX_COMPARE_GARAGES) {
      return { ok: false, code: 'COMPARE_LIMIT_EXCEEDED', max: MAX_COMPARE_GARAGES, count: unique.length };
    }

    var evalMap = evaluations || {};
    var distOf = typeof distanceFn === 'function' ? distanceFn : function () { return null; };

    var items = unique.map(function (garage) {
      var ev = evalMap[garage.id] || evaluateGarageEligibility(garage, interval, vehicleType, bookings || []);
      var km = distOf(garage);
      var op = getGarageOperatingMinutes(garage);
      var rating = getGarageRating(garage);
      var amenities = {};
      AMENITY_KEYS.forEach(function (k) { amenities[k] = getAmenityState(garage, k); });

      return {
        id: garage.id,
        garage: garage,
        evaluation: ev,
        eligible: !!(ev && ev.eligible),
        reasonCode: ev ? ev.reasonCode : 'INVALID_INTERVAL',
        totalArs: ev && ev.quote ? ev.quote.totalArs : Number(garage.ratePerHour) || 0,
        avgHourlyArs: getAverageHourlyRate(ev ? ev.quote : null, garage.ratePerHour),
        distanceKm: Number.isFinite(km) ? km : null,
        rating: rating,
        availableSpaces: ev && ev.availability ? ev.availability.availableSpaces : 0,
        totalSpaces: garage.totalSpaces,
        operatingHours: op,
        maxHeightM: garage.maxHeightM,
        acceptedVehicleTypes: (garage.acceptedVehicleTypes || []).slice(),
        amenities: amenities
      };
    });

    var eligibleItems = items.filter(function (x) { return x.eligible; });
    var pool = eligibleItems.length > 0 ? eligibleItems : items;

    var lowestPrice = pool.slice().sort(function (a, b) { return a.totalArs - b.totalArs; })[0];
    var closest = pool.filter(function (x) { return x.distanceKm !== null; })
      .sort(function (a, b) { return a.distanceKm - b.distanceKm; })[0];
    var highestRating = pool.slice().sort(function (a, b) {
      return (b.rating.score || -1) - (a.rating.score || -1);
    })[0];
    var mostCapacity = pool.slice().sort(function (a, b) {
      return b.availableSpaces - a.availableSpaces;
    })[0];

    return {
      ok: true,
      code: 'OK',
      max: MAX_COMPARE_GARAGES,
      interval: interval || null,
      vehicleType: vehicleType || 'car',
      items: items,
      highlights: {
        lowestPriceId: lowestPrice ? lowestPrice.id : null,
        closestId: closest ? closest.id : null,
        highestRatingId: highestRating ? highestRating.id : null,
        mostCapacityId: mostCapacity ? mostCapacity.id : null
      }
    };
  }

  function normalizeSearchText(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /* Offline-safe destination search combining favorites, recents and demo catalog (zones, POIs, businesses). */
  function searchDestinations(query, options) {
    var opts = options || {};
    var qNorm = normalizeSearchText(query);
    var favorites = Array.isArray(opts.favorites) ? opts.favorites : [];
    var recents = Array.isArray(opts.recents) ? opts.recents : [];
    var catalog = Array.isArray(opts.catalog) ? opts.catalog : DEMO_DESTINATIONS;
    var limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Number(opts.limit)) : 12;

    var results = [];
    var seenKeys = {};

    function addEntry(entry, group) {
      if (!entry || !entry.label || !Array.isArray(entry.coords) || entry.coords.length !== 2) return;
      var dedupeKey = normalizeSearchText(entry.label);
      if (seenKeys[dedupeKey]) return;
      if (qNorm) {
        var haystack = normalizeSearchText(
          entry.label + ' ' +
          (entry.subtitleEs || '') + ' ' +
          (entry.subtitleEn || '') + ' ' +
          (entry.keywords || '')
        );
        if (haystack.indexOf(qNorm) === -1) return;
      }
      seenKeys[dedupeKey] = true;
      results.push(Object.assign({}, entry, { group: group }));
    }

    favorites.forEach(function (f) { addEntry(f, 'favorite'); });
    recents.forEach(function (r) { addEntry(r, 'recent'); });
    catalog.forEach(function (c) { addEntry(c, c.type || 'zone'); });

    return results.slice(0, limit);
  }

  /* Isolated Sprint 2B in-memory QA verification scenarios (S2B-T01..S2B-T04) */
  function runSprint02bAcceptanceScenarios() {
    var results = [];
    var tue = '2026-12-15';
    var interval = validateInterval({ arrivalDate: tue, departureDate: tue, arrival: '10:00', departure: '12:00', allowPast: true });

    // S2B-T01: Deterministic recommendations & equal-weight value score normalization
    (function () {
      var evals = {};
      DEFAULT_GARAGES.forEach(function (g) { evals[g.id] = evaluateGarageEligibility(g, interval, 'car', []); });
      var distMap = {
        'garage-puerto-madero': 1.93,
        'garage-palermo-soho': 4.66,
        'garage-obelisco': 0.37,
        'garage-recoleta': 1.00,
        'parqueon-hospital-italiano': 4.10,
        'parqueon-san-telmo': 1.44,
        'garage-colegiales': 7.52,
        'garage-chacarita': 5.54
      };
      var rec1 = computeRecommendations(DEFAULT_GARAGES, evals, function (g) { return distMap[g.id] || 5; });
      var rec2 = computeRecommendations(DEFAULT_GARAGES, evals, function (g) { return distMap[g.id] || 5; });
      var deterministic = JSON.stringify(rec1) === JSON.stringify(rec2);
      var pass = deterministic &&
        rec1.lowestTotal === 'garage-chacarita' &&
        rec1.closest === 'garage-obelisco' &&
        rec1.highestRating === 'garage-puerto-madero' &&
        rec1.bestValue === 'parqueon-san-telmo' &&
        rec1.lowAvailabilityIds.length === 0;
      results.push({
        id: 'S2B-T01',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'lowest=' + rec1.lowestTotal + ', closest=' + rec1.closest + ', rating=' + rec1.highestRating + ', value=' + rec1.bestValue + ', lowAvail=' + rec1.lowAvailabilityIds.length
      });
    })();

    // S2B-T02: Low availability triggers strictly at <=2 free bays (no false urgency)
    (function () {
      var g2 = { id: 'g-2free', name: 'G2', ratePerHour: 5000, totalSpaces: 2, open24: true, acceptedVehicleTypes: ['car'], maxHeightM: 2.2, rating: { score: 4.5, reviewCount: 10 } };
      var g3 = { id: 'g-3free', name: 'G3', ratePerHour: 5000, totalSpaces: 3, open24: true, acceptedVehicleTypes: ['car'], maxHeightM: 2.2, rating: { score: 4.5, reviewCount: 10 } };
      var evals = {
        'g-2free': evaluateGarageEligibility(g2, interval, 'car', []),
        'g-3free': evaluateGarageEligibility(g3, interval, 'car', [])
      };
      var rec = computeRecommendations([g2, g3], evals, function () { return 0.5; });
      var pass = rec.lowAvailabilityIds.indexOf('g-2free') !== -1 && rec.lowAvailabilityIds.indexOf('g-3free') === -1;
      results.push({
        id: 'S2B-T02',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'lowAvail=' + rec.lowAvailabilityIds.join(',')
      });
    })();

    // S2B-T03: Comparator supports up to 3 garages with same interval/vehicle and rejects 4th
    (function () {
      var evals = {};
      DEFAULT_GARAGES.forEach(function (g) { evals[g.id] = evaluateGarageEligibility(g, interval, 'car', []); });
      var ok3 = buildComparisonMatrix(DEFAULT_GARAGES.slice(0, 3), evals, interval, 'car', function () { return 1; });
      var err4 = buildComparisonMatrix(DEFAULT_GARAGES.slice(0, 4), evals, interval, 'car', function () { return 1; });
      var pass = ok3.ok && ok3.items.length === 3 && !err4.ok && err4.code === 'COMPARE_LIMIT_EXCEEDED';
      results.push({
        id: 'S2B-T03',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'three=' + ok3.code + ', four=' + err4.code
      });
    })();

    // S2B-T04: Offline destination search matches POIs, businesses, favorites and recents accent-insensitively
    (function () {
      var colon = searchDestinations('teatro colon');
      var abasto = searchDestinations('abasto');
      var pass = colon.some(function (x) { return x.id === 'poi-teatro-colon'; }) &&
        abasto.some(function (x) { return x.id === 'biz-abasto'; });
      results.push({
        id: 'S2B-T04',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'colonMatches=' + colon.length + ', abastoMatches=' + abasto.length
      });
    })();

    return results;
  }

  return {
    TIMEZONE: TIMEZONE,
    UTC_OFFSET: UTC_OFFSET,
    MAX_DURATION_HOURS: MAX_DURATION_HOURS,
    MAX_DURATION_MINUTES: MAX_DURATION_MINUTES,
    INTERVAL_POLICY: INTERVAL_POLICY,
    AMENITY_KEYS: AMENITY_KEYS,
    MAP_PROVIDERS: MAP_PROVIDERS,
    VEHICLE_TYPES: VEHICLE_TYPES,
    VEHICLE_TYPE_LIST: VEHICLE_TYPE_LIST,
    PRICING_POLICY: PRICING_POLICY,
    RECOMMENDATION_POLICY: RECOMMENDATION_POLICY,
    MAX_COMPARE_GARAGES: MAX_COMPARE_GARAGES,
    DEMO_DESTINATIONS: DEMO_DESTINATIONS,
    DEFAULT_GARAGES: DEFAULT_GARAGES,
    getBuenosAiresLocalParts: getBuenosAiresLocalParts,
    getTodayInBuenosAires: getTodayInBuenosAires,
    addDaysToDateStr: addDaysToDateStr,
    enumerateLocalDatesBetween: enumerateLocalDatesBetween,
    parseDateParts: parseDateParts,
    parseTimeMinutes: parseTimeMinutes,
    formatMinutesToHHMM: formatMinutesToHHMM,
    toBuenosAiresEpochMs: toBuenosAiresEpochMs,
    toBuenosAiresIso: toBuenosAiresIso,
    validateInterval: validateInterval,
    getGarageOperatingMinutes: getGarageOperatingMinutes,
    isWithinOperatingHours: isWithinOperatingHours,
    validateVehicleCompatibility: validateVehicleCompatibility,
    normalizeBooking: normalizeBooking,
    getPeakConcurrentBookings: getPeakConcurrentBookings,
    getIntervalAvailability: getIntervalAvailability,
    getOccupancyFactor: getOccupancyFactor,
    isPeakHour: isPeakHour,
    isWeekendDay: isWeekendDay,
    segmentIntervalByHour: segmentIntervalByHour,
    calculateDynamicQuote: calculateDynamicQuote,
    getAverageHourlyRate: getAverageHourlyRate,
    cloneQuoteSnapshot: cloneQuoteSnapshot,
    evaluateGarageEligibility: evaluateGarageEligibility,
    getAmenityState: getAmenityState,
    getGarageRating: getGarageRating,
    matchesFilters: matchesFilters,
    filterGarages: filterGarages,
    sortGarages: sortGarages,
    computeRecommendations: computeRecommendations,
    buildComparisonMatrix: buildComparisonMatrix,
    normalizeSearchText: normalizeSearchText,
    searchDestinations: searchDestinations,
    isValidCoordinates: isValidCoordinates,
    buildExternalDirectionsUrl: buildExternalDirectionsUrl,
    createStorageAdapter: createStorageAdapter,
    createMemoryStorage: createMemoryStorage,
    createSubmissionGuard: createSubmissionGuard,
    defaultGenerateBookingId: defaultGenerateBookingId,
    createBooking: createBooking,
    cancelBookingById: cancelBookingById,
    runCoreAcceptanceScenarios: runCoreAcceptanceScenarios,
    runSprint02AcceptanceScenarios: runSprint02AcceptanceScenarios,
    runSprint02bAcceptanceScenarios: runSprint02bAcceptanceScenarios
  };
}));
