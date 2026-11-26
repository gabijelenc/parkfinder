# Sprint 02 — Driver Experience & Consumer UX Redesign · Implementation & Acceptance Evidence

- **Branch:** `feature/sprint-02-driver-experience`
- **Base branch & commit:** `improvements` (`aeb87704a4ffba9ef9f6b75e704adafc26c62074`, inheriting Sprint 01 `6194d0bf2871c19d14fb0b08b53ed1bff34b8fb8`)
- **Date:** 2026-11-25
- **Scope Implemented:** Comprehensive consumer UX/UI redesign + PF-05 (amenities/restrictions/filters), PF-06 (synthetic demo ratings & rating sort), PF-14 (validated keyless Google Maps external directions + map provider adapter + offline fallback), and PF-01 extension (independent arrival/departure dates, overnight & multi-day intervals in Buenos Aires UTC-3, max 72h cap).
- **Automated Verification:**
  - Sprint 1 Core Domain Regression (`node tests/core_booking_tests.js`): **10/10 PASS**
  - Sprint 2 Core Domain (`node tests/sprint02_domain_tests.js`): **9/9 PASS**
  - Sprint 1 Browser E2E Regression (`python3 tests/e2e_browser_acceptance.py`): **11/11 PASS**
  - Sprint 2 Browser E2E Acceptance (`python3 tests/e2e_sprint02_acceptance.py`): **10/10 PASS**
- **Human / Visual Review:** `PENDING_HUMAN_ACCEPTANCE` (pushed to feature branch only; NOT merged to `improvements` or `main`, NOT deployed, NO paid APIs or credentials activated).

---

## 1. Consumer UX/UI Redesign Summary (Before vs. After)

The Sprint 01 technical/administrative interface was transformed into a clean, mobile-first consumer parking marketplace inspired by modern travel & mobility workflows (Airbnb, SpotHero, Booking, Uber, Google Maps) without copying any brand:

- **Visual System (`styles.css`):** Light neutral canvas (`#F6F7F9`), crisp elevated white surfaces (`#FFFFFF`), restrained dark navy ink (`#0F172A` / `#334155` / `#52627A`), single deep teal accent (`#0F766E` with white text = 5.45:1 WCAG AA contrast), strict 8px spacing grid, generous tap targets, minimal hairline borders, and subtle microinteractions (`prefers-reduced-motion` respected).
- **Compact Header:** Light sticky navigation bar with brand emblem, ES/EN toggle, `Mis reservas (n)`, and a dedicated `Info · QA` menu button. Technical badges (`v2-dev`, pulsing status dot, total spot counter, `Restablecer`, and `Modo sin conexión`) were removed from the primary driver journey and moved into the separated Info/QA menu without hiding synthetic status.
- **Consumer Search Experience:** Prominent destination/area + optional address + vehicle + independent Check-in / Check-out date & time bar with live duration badge and quick presets (`+2 h`, `+4 h`, `Nocturna`). On mobile (`<= 768px`), collapses into a tappable summary pill so filter chips and results appear immediately above the fold.
- **Sticky Filter Bar & Split Workspace:** Horizontal amenity toggle chips (`Techado`, `24 hs`, `Seguridad / CCTV`, `Carga EV`, `Accesible`, `Valet`), `Solo disponibles`, max price, min demo rating, max distance, and one-click `Limpiar filtros`. Desktop displays scannable cards on the left with a sticky interactive Leaflet/OSM map on the right (hovering a card highlights its price pin); mobile provides a floating `Ver mapa / Ver lista` segmented toggle.
- **Commercial Garage Cards & Expandable Detail View:** Cards highlight name, address, explicitly demo-labelled rating (`★ 4.8 (142 reseñas · demo)`), total ARS price as primary, clearly labelled straight-line walking estimate, interval availability, essential amenities, `Cómo llegar (ubicación demo)`, and prominent `Reservar` CTA. Secondary details live in an expandable drawer displaying all 6 amenities with explicit **Sí / No / Sin informar** states, operating hours, clearance height, accepted vehicles, and synthetic provenance notice.
- **Streamlined Reservation Flow:** Review modal emphasizes stay summary, visible locked total (`ARS`), a **collapsed-by-default** `<details>` hourly breakdown table, license plate field, honest local-demo disclosure, and explicit confirmation leading to the deterministic SVG QR receipt.

### Before / After Comparative Screenshots

| Viewport | Before (`improvements`) | After (`feature/sprint-02-driver-experience`) |
|---|---|---|
| **Desktop (1440×900)** | `02_trabajo/sprint_02/screenshots/before_desktop_1440x900.png` | `02_trabajo/sprint_02/screenshots/after_desktop_1440x900.png` |
| **Mobile (390×844 · List)** | `02_trabajo/sprint_02/screenshots/before_mobile_390x844.png` | `02_trabajo/sprint_02/screenshots/after_mobile_390x844.png` |
| **Mobile (390×844 · Map)** | *(stacked below full search form)* | `02_trabajo/sprint_02/screenshots/after_mobile_map_390x844.png` |
| **Desktop · Card Details & Amenities** | *(not present)* | `02_trabajo/sprint_02/screenshots/after_desktop_card_details.png` |
| **Desktop · Reservation Modal** | *(expanded dense table)* | `02_trabajo/sprint_02/screenshots/after_desktop_reserve_modal.png` |

---

## 2. Technical & Functional Changes (`core-booking.js` & `index.html`)

1. **PF-05 (Amenities, Restrictions & Combined Filters):**
   - Added tri-state synthetic `amenities` (`true` = Yes, `false` = No, `null` = Unknown) across all 8 garages (`covered`, `securityCctv`, `evCharging`, `accessible`, `valet`, `open24`).
   - Added pure domain helpers `getAmenityState`, `matchesFilters`, `filterGarages`. Filtering requires `=== 'yes'` (excluding both `no` and `unknown`). Filters never alter or override `evaluateGarageEligibility` (S2-T02).
2. **PF-06 (Synthetic Demo Ratings):**
   - Added `rating: { score, reviewCount, provenance: 'synthetic_demo' }` (range 1–5) to all garages and added `rating_desc` sorting in `sortGarages`.
   - Every UI rating label in ES and EN explicitly states `demo` and never attributes ratings to Google.
3. **PF-14 (Validated External Directions & Provider Interface):**
   - Added `isValidCoordinates`, `buildExternalDirectionsUrl` (`https://www.google.com/maps/dir/?api=1&destination=LAT%2CLNG&travelmode=driving`, keyless, rejects invalid coordinates), and `MAP_PROVIDERS` / `MapProviderRegistry` (`osm_leaflet` active, `google_maps` proposed stub with `requiresBilling: true`, `status: 'proposed_not_activated'`).
   - All directions links are explicitly labelled as navigation to a demo location and never imply an actual partner garage.
4. **PF-01 Extension (Overnight & Multi-Day Intervals in Buenos Aires UTC-3):**
   - Extended `validateInterval` to support independent `arrivalDate` and `departureDate`, overnight/multi-day spans, and proposed maximum duration cap of **72 hours** (`MAX_DURATION_HOURS = 72`).
   - Extended `isWithinOperatingHours` using `enumerateLocalDatesBetween` to validate garage operating hours across every Buenos Aires local calendar day touched by `[startMs, endMs)`, rejecting intervals that cross closed periods on non-24h garages while permitting them on 24h garages.
   - Preserved half-open `[start, end)` sweep-line peak concurrency across midnight and hourly-segment proration across midnight/weekends (recording `date` and `dayOfWeek` per segment) with single final ARS rounding and immutable locked quotes.
   - Preserved 100% legacy V1 and Sprint 1 booking record compatibility in `normalizeBooking`.

---

## 3. Pricing & Interval Policy Review Note (No Silent Changes)

Per specification, **no approved/proposed pricing multipliers were silently changed**:
- **Implemented Demo Multipliers (unchanged from Sprint 01):**
  - Vehicle: `motorcycle = 0.65`, `car = 1.00`, `suv = 1.30`, `van = 1.55`.
  - Occupancy (segment peak / total spaces): `<50% = 1.00`, `50–<75% = 1.20`, `>=75% = 1.40`.
  - **Implemented Peak Windows (BA local time):** `08:00–10:00` and `17:00–20:00` (`×1.15`). *Recorded for team review: `reglas_negocio_v01.md` R04 specifies the 1.15 peak factor without freezing exact clock hours, so the implemented `08–10` / `17–20` windows remain a proposed demo default pending formal team approval.*
  - Weekend (BA local day of week): Saturday & Sunday (`×1.10`), applied strictly per local hourly segment (so Friday 22:00–24:00 is `1.00` and Saturday 00:00–02:00 is `1.10`).
  - Rounding: Single final `Math.round(totalExact)` to integer ARS.
- **Proposed Sprint 02 Interval Cap:** Maximum booking duration `72h` (`4320 min`), flagged as `proposed_demo_default` pending team approval.

---

## 4. Acceptance Scenarios Execution Evidence

Reproducible commands:
```bash
node tests/core_booking_tests.js
node tests/sprint02_domain_tests.js
python3 tests/e2e_browser_acceptance.py
python3 tests/e2e_sprint02_acceptance.py
```

### Sprint 02 Acceptance Matrix (`S2-T01` – `S2-T10`)

| Test ID | Requirement | Input / Scenario | Expected | Actual Result (Verified) | Status | Reviewer |
|---|---|---|---|---|---|---|
| S2-T01 | PF-05 | Inspect Palermo Soho amenity matrix (`covered`, `valet`, `accessible`); filter `covered` + `evCharging` + `rating >= 4.5` + `maxPrice <= 15000` + `dist <= 2km`; trigger 0-results (`<= 0.5km`); click Clear Filters | Distinct `Sí` / `No` / `Sin informar` states; only `garage-puerto-madero` matches; empty state shows clear CTA; reset restores 8 garages | Domain & Browser E2E: `states=(Sí/No/Sin informar)`, `combined=garage-puerto-madero`, `emptyResetRestored=8` | PASS (Automated) | Pending team review |
| S2-T02 | PF-05 / PF-03 | Select `van` + filter `covered`; inspect `garage-colegiales` (accepts moto/car only); attempt booking via core & toggle `onlyAvailable` | Unavailable/incompatible garage remains `eligible=false` (`VEHICLE_TYPE_NOT_ACCEPTED`), button disabled, rejected by `createBooking`, hidden when `onlyAvailable` checked | Domain & Browser E2E: `colegialesIncompatibleWithVan=True`, `reserveDisabled=True`, `createBooking=VEHICLE_TYPE_NOT_ACCEPTED`, `hiddenByOnlyAvailable=True` | PASS (Automated) | Pending team review |
| S2-T03 | PF-06 | Sort by `rating_desc` and inspect rating labels in ES and EN | Descending scores (`4.8`..`3.9`), explicit `demo` label in both ES & EN, zero Google attribution | Domain & Browser E2E: `sortedDesc=4.8..3.9`, ES=`★ 4.8 (142 reseñas · demo)`, EN=`★ 4.8 (142 reviews · demo)`, no Google string | PASS (Automated) | Pending team review |
| S2-T04 | PF-14 | Inspect Puerto Madero directions link + validate invalid coords rejected; activate offline mode via Info/QA menu and book | Validated URL `https://www.google.com/maps/dir/?api=1&destination=-34.6074%2C-58.361&travelmode=driving` labelled `ubicación demo`; 4/4 invalid coords rejected; offline fallback retains 8 cards & booking | Domain & Browser E2E: `hrefValid=True`, `demoLabel='cómo llegar (ubicación demo)'`, `invalidCoordsRejected=4/4`, `offlineBooked=OK` | PASS (Automated) | Pending team review |
| S2-T05 | PF-01 ext | Cap 1 24h (`qa-cap1-24h`): book `2026-12-15 23:00` → `2026-12-16 01:00`; test `00:00–00:30` (overlap) & `01:00–02:00` (adjacent); cancel overnight & rebook `00:00–00:30` | Overlap blocked (`NO_AVAILABILITY`); adjacent `01:00–02:00` permitted; cancel releases capacity for `00:00–00:30` | Domain & Browser E2E: `overnight=OK`, `blocked0000=NO_AVAILABILITY`, `adjacent0100=OK`, `rebookedAfterCancel=OK` | PASS (Automated) | Pending team review |
| S2-T06 | PF-01 ext | Interval `2026-12-15 21:00` → `2026-12-16 08:00` on Palermo Soho (`07:00–22:00`) vs Puerto Madero (`24h`) + 48h multi-day check | Non-24h rejected (`OUT_OF_HOURS`, `spansClosedPeriod=true`); 24h accepted for overnight & 48h | Domain & Browser E2E: `palermo(07-22)=OUT_OF_HOURS`, `puertoMadero(24h)=eligible`, `multiDay48h=OK` | PASS (Automated) | Pending team review |
| S2-T07 | PF-04 / PF-01 ext | Friday `2026-12-18 22:00` → Saturday `2026-12-19 02:00`; verify breakdown collapsed by default; verify weekend factor per segment; confirm & mutate garage rate | Collapsed by default; 4 segments (Fri `×1.00`, Sat `×1.10`); single final ARS rounding (`ARS 25.200` on Obelisco / `ARS 2.733` fractional domain test); locked quote unchanged after rate mutation | Domain & Browser E2E: `collapsedByDefault=True`, `segs=4(Fri=1.0/Sat=1.1)`, `locked=ARS 25.200`, fractional `exact=2732.73 -> 2733` | PASS (Automated) | Pending team review |
| S2-T08 | PF-01 ext | Invalid arrival/departure dates, equal (`10:00–10:00`), reversed dates (`Dec 16 → Dec 15`), past date, exact 72h vs >72h (`96h` / `72h 1m`) in ES & EN | All invalid intervals rejected with clear bilingual inline feedback; 72h exact accepted | Domain & Browser E2E: all 7 domain edge cases + ES/EN `#intervalError` verified | PASS (Automated) | Pending team review |
| S2-T09 | PF-13 / Reg | Pre-seed legacy V1 booking `PF-2026-LEG1` in `localStorage`, run bookings & sandbox, reload page; run all Sprint 1 tests & in-app QA suite | Legacy record survives reload; Sprint 1 Node (10/10) + E2E (11/11) pass; in-app QA suite passes all 14 checks (0 failures); sandbox isolated | Domain & Browser E2E: `legacySurvived=PF-2026-LEG1`, `inAppQaRows=14(0 fails)`, S1 Node `10/10`, S1 E2E `11/11` | PASS (Automated) | Pending team review |
| S2-T10 | UX / QA | Desktop (1440×900) & Mobile (390×844) checks, separated QA menu, mobile search summary & map/list toggle, JS error listener, before/after screenshots | Zero horizontal overflow at 1440px and 390px; QA controls hidden from primary UI inside Info/QA modal; 0 uncaught JS errors; before/after screenshots captured | Browser E2E + visual check: `desktopOverflow=False`, `mobile390Overflow=False`, `qaSeparated=True`, `mobileToggle=OK`, `uncaughtErrors=0` | PASS (Automated; Visual Review Pending) | Pending human review |

---

## 5. Network Context & Known Limitations

- **Network Context Documented:**
  1. **Functional E2E Suites (`e2e_browser_acceptance.py` & `e2e_sprint02_acceptance.py`):** Executed against local `127.0.0.1` HTTP server with all external network calls intentionally aborted (`route.abort()`) to ensure deterministic, offline-safe verification of map fallback and booking integrity.
  2. **Before/After Visual Screenshot Capture:** Executed with live outbound network enabled in headless Chromium; `unpkg.com` (Leaflet 1.9.4) and `tile.openstreetmap.org` returned HTTP 200 (`tileResponses200=12`, `uncaughtErrors=[]`), confirming live OSM map tile rendering and Google Fonts fallback behavior.
- **Known Limitations (Explicitly Disclosed in UI & Docs):**
  1. **Browser-local persistence (`localStorage`):** Concurrency revalidation and duplicate-submit guards remain browser-local and do not synchronize across multiple tabs, devices, or users (requires future transactional backend PF-12).
  2. **Synthetic inventory, amenities, ratings & simulated payment/QR:** All listings, capacities, tri-state amenities, ratings (1–5), reviews, payments, and SVG QR codes are synthetic/simulated; no real partner garages, live sensors, or payment gateways are connected.
  3. **Estimated straight-line distance:** Walking time (~5 km/h) and distance use Haversine straight-line coordinates, not routed street paths; external directions open keyless Google Maps links clearly labelled as demo locations.
  4. **Google Maps Platform remains proposed only:** No API keys, billing, scraping, or Places/Routes credentials were activated.
  5. **Human Visual & Product Acceptance Pending:** Automated tests verified functional correctness, responsive layout geometry, and zero uncaught JS exceptions; subjective UX/visual approval and pricing/duration policy sign-off remain pending human review.
