# Sprint 01 — Core Booking Implementation & Acceptance Evidence

- **Branch:** `feature/sprint-01-core-booking` (branched from `docs/estructura-mba-parkfinder`)
- **Date:** 2026-11-25
- **Scope Implemented:** PF-01, PF-02, PF-03, PF-04 (browser-local scope, synthetic inventory)
- **Automated Execution:** Node.js domain suite (`tests/core_booking_tests.js`) + Headless Chromium Playwright E2E suite (`tests/e2e_browser_acceptance.py`)
- **Human / Team Review:** `PENDING_TEAM_REVIEW` (no merge to `main`, no production deployment)

## 1. Summary of Technical Changes

1. **Pure Core Booking Engine (`core-booking.js`)**
   - Zero-dependency UMD module (`window.ParkFinderCore` / `module.exports`), preserving static Netlify deployment (no build step, works on `file://` and HTTP).
   - **PF-01 (Interval Availability):** Explicit `America/Argentina/Buenos_Aires` (UTC-3) date and half-open `[start, end)` intervals. Availability is derived strictly from the confirmed booking ledger using a sweep-line peak concurrent overlap algorithm (processing departures `-1` before arrivals `+1` on timestamp ties so adjacent intervals never collide). Legacy V1 bookings normalize cleanly without data loss.
   - **PF-02 (Overselling Prevention — Local Scope):** Eliminated the divergent mutable `LS.inventory` counter (V1 Audit Findings #1 and #2). Revalidates interval, operating hours, vehicle compatibility, and fresh `localStorage` peak availability immediately before persisting. Adds synchronous in-flight + per-modal submission token duplicate-submit prevention (`createSubmissionGuard`). Adds explicit read-back durability verification and error surfacing on storage write failures (`createStorageAdapter`, V1 Audit Finding #6). Cancellation retains bookings with `status: 'cancelled'` and `cancelledAt` timestamp while releasing interval capacity (V1 Audit Finding #5).
   - **PF-03 (Vehicle Compatibility):** Independent validation of vehicle type (`motorcycle`, `car`, `suv`, `van`) and clearance height (`maxHeightM`) plus garage operating hours (`operatingHours`), enforced independently of pricing (R05).
   - **PF-04 (Dynamic Pricing & Locked Quote):** Hourly-segment dynamic pricing using Buenos Aires local clock hours with transparent segment breakdown and single final ARS rounding. Freezes an immutable `quote` snapshot + `cost` inside each confirmed booking so subsequent rate changes never alter stored booking prices.

2. **UI & Interactive Sandbox (`index.html`)**
   - Preserves visual identity, responsive layout (verified at 1366×900 desktop and 390×844 mobile with zero horizontal overflow), bilingual ES/EN UI, Leaflet/OSM map with decluttering, Nominatim geocoding + local fallback, SVG QR receipts, and offline mode.
   - Search bar upgraded with arrival time (`#arrivalInput`), departure time (`#departureInput`), vehicle selector (`#vehicleSel`), and inline interval validation (`#intervalError`).
   - Garage cards and map popups show dynamic total price, base hourly rate, interval availability (`avail / total`), operating hours, max height, accepted vehicle types, and explicit incompatibility/out-of-hours/full badges.
   - Confirmation modal displays the full hourly-segment pricing table, single-final-rounding total, simulated payment notice, explicit browser-local concurrency limitation disclosure, and inline error box for storage failures.
   - Info modal includes an isolated **QA Sandbox Mode** (`parkfinder.v2.sandbox.bookings` with capacity-1 and capacity-2 synthetic garages) and in-memory QA suite runner, leaving user bookings (`parkfinder.v1.bookings`) untouched.

## 2. Explicit Multi-Hour Proration Policy (Proposed Demo Defaults — Pending Team Review)

Per `01_fuentes/reglas_negocio_v01.md` (R04) and `02_trabajo/sprint_01/acceptance_criteria.md` (T06):

- **Policy Version:** `pf-v2-proposed-hourly-proration` (**proposed demo default; pending team sign-off**).
- **Segmentation:** The requested interval `[start, end)` is split at Buenos Aires (`UTC-3`) clock-hour boundaries. Partial-hour segments are prorated proportionally (`segmentMinutes / 60`).
- **Segment Formula:**
  `segmentSubtotalExact = baseRatePerHour × segmentHours × vehicleFactor × occupancyFactor × peakFactor × weekendFactor`
- **Multipliers:**
  - Vehicle factor: `motorcycle = 0.65`, `car = 1.00`, `suv = 1.30`, `van = 1.55`.
  - Occupancy factor (peak concurrent confirmed bookings in that segment / `totalSpaces` at quote time): `< 50% = 1.00`, `50% to < 75% = 1.20`, `>= 75% = 1.40`.
  - Peak hour factor (Buenos Aires local clock hour): `08:00–10:00` and `17:00–20:00` = `1.15`; otherwise `1.00`.
  - Weekend factor (Buenos Aires local day of week): Saturday and Sunday = `1.10`; Monday–Friday = `1.00`.
- **Rounding:** Exact segment subtotals are summed without intermediate rounding; `Math.round(totalExact)` is applied **once** to produce the final integer `ARS` amount.
- **Quote Freezing:** Confirmed bookings persist a deep-copied `quote` snapshot and `cost = quote.totalArs`.

## 3. Acceptance Scenarios Execution Evidence (Automated Runs)

Reproducible commands:
- `node tests/core_booking_tests.js`
- `python3 tests/e2e_browser_acceptance.py`

| Test ID | Requirement | Input / Scenario | Expected | Actual Result (Verified) | Status | Reviewer |
|---|---|---|---|---|---|---|
| T01 | PF-01 | Cap 1, `2026-12-15` BA, reserve `08:00–11:00` then `11:00–13:00` | Both accepted (half-open intervals) | Core & Browser E2E: both confirmed (`startAt`/`endAt` stored in `-03:00`), `sandboxBookings=2` | PASS (Automated) | Pending team review |
| T02 | PF-02 | Cap 1, `2026-12-15` BA, reserve `08:00–11:00` then `10:00–12:00` | Second rejected (`NO_AVAILABILITY`) | Core & Browser E2E: first confirmed, second blocked/disabled with `NO_AVAILABILITY`, count=1 | PASS (Automated) | Pending team review |
| T03 | PF-01 | Cap 2, existing `08:00–09:00` and `10:00–11:00`, request `08:00–11:00` | Peak concurrent = 1; accept exactly 1 extra booking, reject 2nd extra | Core & Browser E2E: `availBefore=1/2` (`peakBefore=1`), `extra1=OK`, `extra2=NO_AVAILABILITY` (`0/2`) | PASS (Automated) | Pending team review |
| T04 | PF-01 / PF-10 | Cancel active booking on Cap 1 `08:00–11:00`, rebook overlapping `09:00–10:00` | Interval released; cancelled record retained with audit status | Core & Browser E2E: record retained with `status='cancelled'` + `cancelledAt`; rebooking succeeded | PASS (Automated) | Pending team review |
| T05 | PF-01 / PF-03 | Invalid date (`2026-02-30` / empty), invalid time (`25:00`), negative/zero duration, incompatible vehicle (`suv` on moto/car garage), excessive height (`2.05m > 1.80m`), out-of-hours (`21:00–23:00` vs `07:00–22:00`) | All rejected with explicit error/ineligibility | Core (all 8 cases) & Browser E2E: `#intervalError` displayed; incompatible/out-of-hours cards disabled with explicit reason | PASS (Automated) | Pending team review |
| T06 | PF-04 | Cap 2 (`ARS 6000/h`), 1 booking `09:00–10:00` (50% occ), quote `09:00–11:00` Car vs SUV; plus fractional rate `1001/h` Sat moto `10:00–12:00` | Segment factors shown (peak `1.15`, occ `1.20`, weekend `1.10`, vehicle); Car != SUV; single final ARS round (`1431`, not `1432`) | Core & Browser E2E: Car=`ARS 14.280`, SUV=`ARS 18.564`, 2 segment rows in modal; single round=`1431` (`exact=1431.43`) | PASS (Automated) | Pending team review |
| T07 | PF-04 | Confirm booking at `ARS 6000/h` (`ARS 12.000`), then mutate garage rate to `ARS 15000/h` | Stored booking total remains `ARS 12.000` while new quotes reflect updated rate | Core & Browser E2E: `lockedBefore=ARS 12.000`, `lockedAfterRateChange=ARS 12.000`, `newCardQuote=ARS 36.000` | PASS (Automated) | Pending team review |
| T08 | PF-02 / PF-13 | (a) Simulated `QuotaExceededError` on `localStorage.setItem`; (b) Full page reload & sandbox exit | (a) Prevent durable confirmation & display error; (b) Normal bookings persist across reload & sandbox | Core & Browser E2E: `STORAGE_WRITE_FAILED`, success modal did not open, inline red error + toast shown; normal booking persisted after reload & sandbox reset | PASS (Automated) | Pending team review |
| T09 | PF-13 | Map/CDN unavailable & Offline mode enabled | Local list, dynamic pricing, and bookings remain accessible with explicit fallback banner | Browser E2E (external URLs aborted + offline switch): `#offlineBanner` & `#mapDown` visible, 8 cards rendered, booking confirmed offline | PASS (Automated) | Pending team review |
| T10 | PF-02 | Rapid repeated confirmation in same modal session (3 synchronous calls) + check disclosure | At most 1 booking created; local-only multi-tab/device limitation disclosed | Core & Browser E2E: `codes=['OK', 'DUPLICATE_SUBMISSION', 'DUPLICATE_SUBMISSION']`, `createdCount=1`, `localStorage` disclosure present | PASS (Automated) | Pending team review |
| UI-I18N-RESP | PF-13 | Switch ES → EN and inspect 390×844 mobile viewport | English UI applied, zero horizontal overflow, zero uncaught JS errors | Browser E2E: `lang=en`, `mobile390Overflow=False`, `uncaughtErrors=0` | PASS (Automated) | Pending team review |
| LEGACY | Compatibility | Normalize pre-existing V1 booking object (`date`, `arrival`, `hours`) | Seamless upgrade to interval schema without losing user bookings | Core unit test: normalized to `status='confirmed'`, `vehicleType='car'`, `startAt`/`endAt` in `-03:00` | PASS (Automated) | Pending team review |

## 4. Facts vs. Proposals vs. Known Limitations

- **Verified Facts:** All automated core unit tests (10/10) and headless Chromium browser E2E scenarios (11/11) passed on `feature/sprint-01-core-booking` with zero uncaught JavaScript exceptions and zero horizontal overflow on 390px mobile.
- **Proposals Pending Team Approval:** Vehicle multipliers, occupancy tier thresholds/multipliers, peak hour windows (`08:00–10:00`, `17:00–20:00`), weekend factor (`1.10`), and hourly proration policy are proposed demo defaults (R04).
- **Known Limitations (Explicitly Disclosed in UI & Docs):**
  1. **Browser-local persistence (`localStorage`):** Does not provide atomic concurrency control across multiple browser tabs, devices, or concurrent users. Shared transactional storage remains a future backend capability (PF-12).
  2. **Synthetic inventory and simulated payment/QR:** Garages, capacities, rates, restrictions, payments, and deterministic SVG QR codes are synthetic/simulated; no real payment gateway, live occupancy sensors, or physical admission checks exist.
  3. **Distance estimation:** Distances use straight-line Haversine coordinates and estimated walking speed (5 km/h), not routed street distance (PF-14).
  4. **Same-day intervals:** Current interval search validates single-day windows (`00:00` to `24:00` Buenos Aires time); overnight multi-day intervals are out of Sprint 01 scope.
  5. **Browser E2E network context:** Headless E2E tests intentionally aborted external CDN/tile calls to guarantee deterministic offline-safe execution; live OSM tile rendering should be spot-checked manually with internet access during team review.
