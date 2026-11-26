# parkFinder — Sprint 2C Test Report, Requirements Matrix, Decisions & Limitations

- **Branch:** `feature/sprint-02c-supabase-backend` (based on `feature/sprint-02-driver-experience`; NOT merged to `improvements` or `main`)
- **Date:** 2026-11-25
- **Target Remote Supabase Project:** `parkfinder-dev` (`qerrmfdpxbjwmeprwrbc` · PostgreSQL `17.12` · Free Tier)
- **Automated Verification Executed Locally:** **99 / 99 PASS** (56 preserved legacy tests + 43 new Sprint 2C tests across PostgreSQL 17.12, Node.js, and Playwright Chromium)
- **Remote Supabase SQL Execution & Live Acceptance:** **`PENDING_REMOTE_EXECUTION`** (requires user to execute `01_backend_migration.sql`, `02_demo_seed.sql`, and `03_database_tests.sql` manually in Supabase SQL Editor)

> **Evidence Integrity Statement:** Every test marked **PASS (Executed Locally)** below was actually executed in this environment against PostgreSQL 17.12, Node.js, and headless Google Chrome via Playwright. Tests requiring manual SQL migration execution on the remote `qerrmfdpxbjwmeprwrbc.supabase.co` instance are explicitly separated and marked **PENDING_REMOTE_EXECUTION** — never declared passed before execution.

---

## 1. Automated Verification Summary (Executed Locally: 99 / 99 PASS)

| Suite | Command | Environment | Passed | Status |
|---|---|---|---|---|
| **Sprint 1 Core Domain Regression** | `node tests/core_booking_tests.js` | Node.js | 10 / 10 | PASS (Executed Locally) |
| **Sprint 2A Core Domain Regression** | `node tests/sprint02_domain_tests.js` | Node.js | 9 / 9 | PASS (Executed Locally) |
| **Sprint 2B Core Domain Regression** | `node tests/sprint02b_domain_tests.js` | Node.js | 6 / 6 | PASS (Executed Locally) |
| **Sprint 1 Browser E2E Regression** | `python3 tests/e2e_browser_acceptance.py` | Playwright Chromium | 11 / 11 | PASS (Executed Locally) |
| **Sprint 2A Browser E2E Regression** | `python3 tests/e2e_sprint02_acceptance.py` | Playwright Chromium | 10 / 10 | PASS (Executed Locally) |
| **Sprint 2B Browser E2E Regression** | `python3 tests/e2e_sprint02b_acceptance.py` | Playwright Chromium | 10 / 10 | PASS (Executed Locally) |
| **Sprint 2C SQL Integrity & Security** | `supabase/sprint_02c/03_database_tests.sql` | Local PostgreSQL 17.12 | 12 / 12 | PASS (Executed Locally) |
| **Sprint 2C Multi-Session Concurrency & JS-vs-SQL Parity** | `node tests/pg_concurrency_and_parity_tests.js` | Local PostgreSQL 17.12 (10 parallel sessions) | 15 / 15 | PASS (Executed Locally) |
| **Sprint 2C Adapter & Security Unit Tests** | `node tests/sprint02c_domain_tests.js` | Node.js | 6 / 6 | PASS (Executed Locally) |
| **Sprint 2C Browser E2E Acceptance (Multi-User & Multi-Device)** | `python3 tests/e2e_sprint02c_acceptance.py` | Playwright Chromium (3 contexts / devices) | 10 / 10 | PASS (Executed Locally) |
| **TOTAL EXECUTED LOCALLY** | — | — | **99 / 99** | **ALL PASS (0 regressions)** |

### Detailed New Sprint 2C Executed Test Results

#### A. PostgreSQL 17.12 SQL Suite (`03_database_tests.sql` — 12/12 PASS)
| Test ID | Coverage | Observed Result |
|---|---|---|
| `DB-T01` | RLS enabled on all public tables | `23 / 23` enabled (`0` disabled) |
| `DB-T02` | Least-privilege direct table access controls | `bookings INSERT=f`, `user_roles INSERT=f`, `anon bookings SELECT=f`, `booking_access_tokens SELECT=f`, `payments UPDATE=f`, `audit_logs SELECT=f`, `system_settings SELECT=f` |
| `DB-T03` | Seed integrity & idempotency (run twice) | 8 commercial garages = 725 physical spaces; 3 QA garages = 4 spaces; 0 duplicates on re-run |
| `DB-T04` | Auth trigger auto-provisioning | Auto-created `profiles`, `user_roles ('driver')`, 6 `notification_preferences`; single-default vehicle trigger verified |
| `DB-T05` | Half-open intervals `[08:00,11:00)` + `[11:00,13:00)` | Both accepted on cap-1; overlapping `[10:00,12:00)` rejected with `NO_AVAILABILITY` |
| `DB-T06` | Vehicle, height, hours, past, >72h & overnight | Rejected SUV, 2.10m car (>1.80m), 21:00–23:00, past time, 73h, non-24h overnight; accepted 24h overnight |
| `DB-T07` | Cap-2 peak concurrent occupancy | 08–09 + 10–11 accepted 1 extra 08–11 and rejected 2nd (`NO_AVAILABILITY`) |
| `DB-T08` | Dynamic pricing exact verification | Car `14280`, SUV `18564`, Fri→Sat `27300` (Saturday-only `×1.10`) |
| `DB-T09` | Hold TTL expiration & capacity release | Expired hold returned `HOLD_EXPIRED` on late confirm; slot immediately bookable by User B |
| `DB-T10` | Multi-user RLS & RPC isolation | User B saw 0 User A bookings/vehicles, blocked from cancel/extend and direct `INSERT` |
| `DB-T11` | Immutable quote lock + Extension + Cancel release | Facility rate mutation did not change booking total; overlapping extension blocked; cancel freed slot; extension succeeded with incremental quote |
| `DB-T12` | No auto-completed + Mercado Pago Sprint 2D stub | `uiCategory = 'completed'` never auto-triggered; MP stub returned `MERCADO_PAGO_NOT_ACTIVATED_SPRINT_2D` with `clientCanApprove = false` |

#### B. Multi-Session Concurrency & JS-vs-SQL Parity (`tests/pg_concurrency_and_parity_tests.js` — 15/15 PASS)
| Test ID | Coverage | Observed Result |
|---|---|---|
| `PG-CONC-01` | 10 parallel PostgreSQL sessions racing for capacity-1 garage | Strictly **1** winner, **9** `NO_AVAILABILITY`, **1** DB row |
| `PG-CONC-02` | 8 parallel PostgreSQL sessions racing for last space (`1/2`) on capacity-2 | Strictly **1** winner, **7** `NO_AVAILABILITY`, **2/2** DB rows |
| `PG-CONC-03` | Parallel late confirm vs 5 concurrent rebooks right after hold expiry | Late confirm rejected, **1/5** rebook winner, strictly **1** active DB row |
| `PG-PARITY-01..12` | JavaScript (`core-booking.js`) vs PostgreSQL (`pf_calculate_quote_internal`) | **12/12** exact ARS match (off-peak, morning/evening peak, all 4 vehicle types, `<50%`/`50%`/`>=75%` occupancy, fractional minutes, Fri→Sat, Sun→Mon, 48h multi-day `344533 === 344533`, odd-rate single final rounding `1431 === 1431`) |

#### C. Sprint 2C Domain & Real-Browser E2E (`tests/sprint02c_domain_tests.js` 6/6 + `tests/e2e_sprint02c_acceptance.py` 10/10 PASS)
| Test ID | Coverage | Observed Result |
|---|---|---|
| `S2C-D01..D06` | Public-only config, offline auth refusal, tri-state & booking mapping, RFC 5545 `.ics`, ES/EN share, CSV export, client price-tampering omission | **6/6 PASS** |
| `S2C-E01` | Anonymous browsing, offline auth refusal, Reserve prompts `#authModal`, Google/Apple future disabled | **PASS** |
| `S2C-E02` | Registration, automatic `driver` role display, profile edit (`phone`, `default_payment_method`) | **PASS** |
| `S2C-E03` | Vehicle CRUD (add 2, delete unused) | **PASS** |
| `S2C-E04` | Centralized Hold Checkout (`09:59` live timer), MP Sprint 2D contract notice, confirm, `.ics` + Share, FK blocks deleting vehicle with bookings | **PASS** |
| `S2C-E05` | Hold expiration (`HOLD_EXPIRED`) blocks late confirm & offers re-hold | **PASS** |
| `S2C-E06` | My Bookings 5 status tabs, Completed empty without operational check-out, Event History (`hold_created`, `confirmed_demo`), Extend Stay preview & confirm (`+ARS 6.500 -> ARS 19.500`) | **PASS** |
| `S2C-E07` | Cross-device persistence (User A Device 1 → fresh Device 2 synced bookings/vehicle/favorites) & strict multi-user isolation (User B sees `0/0/0`) | **PASS** |
| `S2C-E08` | Connection failure (`NETWORK_ERROR`) blocks confirmation, shows retry banner, never confirms offline as centralized | **PASS** |
| `S2C-E09` | Notification preferences (6 toggles synced) + Personal Analytics KPIs + CSV export | **PASS** |
| `S2C-E10` | Bilingual ES/EN, Light/Dark modes, Desktop 1440×900 & Mobile 390×844 zero overflow, 0 JS errors, 7 screenshots @ 2× DPR | **PASS** |

---

## 2. Pending Remote Verification on `qerrmfdpxbjwmeprwrbc.supabase.co`

The following acceptance checks **HAVE NOT YET BEEN EXECUTED** against the remote Supabase Cloud instance because Antigravity has no MCP/SQL admin access to `parkfinder-dev`:

| Remote Check ID | Action Required by User / QA Team | Status |
|---|---|---|
| `REM-01` | Execute `supabase/sprint_02c/01_backend_migration.sql` in Supabase SQL Editor and verify `rls_enabled_tables = 23`, `rls_disabled_tables = 0`, all 6 direct-privilege checks `= false`. | `PENDING_REMOTE_EXECUTION` |
| `REM-02` | Execute `supabase/sprint_02c/02_demo_seed.sql` twice in Supabase SQL Editor and confirm `8` commercial garages (`725` spaces) + `3` QA facilities (`4` spaces) with 0 duplicates. | `PENDING_REMOTE_EXECUTION` |
| `REM-03` | Execute `supabase/sprint_02c/03_database_tests.sql` in Supabase SQL Editor and confirm `12/12 PASS`. | `PENDING_REMOTE_EXECUTION` |
| `REM-04` | Open deployed preview in two browsers/devices with real Supabase Auth accounts (`driver@example.com` + a second account): verify login, password recovery email, vehicle CRUD, live hold countdown, concurrent last-space booking on `qa-cap1-centro`, extension, cancellation, and cross-device sync. | `PENDING_REMOTE_EXECUTION` |
| `REM-05` | Human visual & functional review before any merge to `improvements` or `main`. | `PENDING_HUMAN_ACCEPTANCE` |

---

## 3. Requirements Traceability Matrix (Sprint 2C Prompt Sections 1–19)

| Req. | Requirement | Implementation Artifact | Verification |
|---|---|---|---|
| §1 | Branch `feature/sprint-02c-supabase-backend` from `feature/sprint-02-driver-experience`; do not merge `improvements`/`main` | Git branch `feature/sprint-02c-supabase-backend` | Verified |
| §2 | Preserve Urban Tech Design System & all Sprint 1/2A/2B features | `styles.css`, `index.html`, `core-booking.js` | 56/56 legacy PASS |
| §3–4 | Non-destructive incremental migrations + retroactive versioning of manual DB migrations | `supabase/migrations/000100..000500`, `supabase/sprint_02c/01_backend_migration.sql`, `supabase/README.md` | PG 17.12 PASS (`REM-01` pending) |
| §5 | Supabase as centralized source of truth; clearly differentiated Offline Demo mode | `supabase-client.js`, `sprint2c-app.js`, `#backendModePill` | `S2C-E01`, `S2C-E07`, `S2C-E08` PASS |
| §6 | Idempotent seed of 8 commercial garages (725 spaces) + isolated QA cap-1/cap-2 | `supabase/sprint_02c/02_demo_seed.sql` | `DB-T03` PASS (idempotency 2×) |
| §7 | Supabase Auth (register, login, logout, password recovery, session persistence; anonymous browse; login on reserve; Google/Apple future) | `supabase-client.js`, `sprint2c-app.js` (`#authModal`) | `S2C-D02`, `S2C-E01`, `S2C-E02` PASS (`REM-04` pending) |
| §8 | Profile edit & Vehicle CRUD with default toggle & historical booking snapshots | `01_backend_migration.sql`, `sprint2c-app.js` (`#profileModal`) | `DB-T04`, `S2C-E02`, `S2C-E03`, `S2C-E04` PASS |
| §9 | Centralized RPC booking engine with server validation & half-open `[start, end)` intervals | `pf_get_catalog_availability`, `pf_create_booking_hold`, `pf_confirm_booking_demo`, `pf_cancel_booking`, `pf_extend_booking`, `pf_get_my_bookings` | `DB-T05..T12` PASS |
| §10 | Anti-overbooking transactional concurrency + 10-min configurable hold TTL | `pg_advisory_xact_lock` + `FOR UPDATE` + `bookings_no_overlapping_space` GiST exclusion + lazy hold expiry | `PG-CONC-01..03` (10 parallel sessions) PASS |
| §11 | Backend dynamic pricing matching `core-booking.js` + JS-vs-SQL parity tests | `pf_calculate_quote_internal` + `tests/pg_concurrency_and_parity_tests.js` | `PG-PARITY-01..12` (12/12 exact match) PASS |
| §12 | Bookings tabs (active/upcoming/completed/cancelled), no auto-completed, extend with pre-quote, cancel, events, `.ics`, share | `sprint2c-app.js`, `supabase-client.js`, `pf_get_my_bookings`, `pf_preview_booking_extension`, `pf_extend_booking` | `DB-T11`, `DB-T12`, `S2C-D05`, `S2C-E06` PASS |
| §13 | Favorites (garages + destinations), notifications, profile & vehicles sync | `supabase-client.js`, `index.html`, `sprint2c-app.js` | `S2C-E07`, `S2C-E09` PASS |
| §14 | Mercado Pago Sprint 2D architecture preparation (no real payments, no cards, no secrets) | `payments`/`payment_events` columns, `pf_prepare_mp_checkout_stub`, checkout notice | `DB-T12`, `S2C-D01`, `S2C-E04` PASS |
| §15 | RLS 23/23, least privilege, `SECURITY DEFINER` + locked `search_path`, QR token hashing, role readiness | `01_backend_migration.sql`, `03_database_tests.sql` | `DB-T01`, `DB-T02`, `DB-T10`, `S2C-D06` PASS |
| §16–18 | 3 consolidated SQL scripts, architecture/ERD, RPC docs, setup manual, test report, screenshots | `supabase/sprint_02c/`, `02_trabajo/sprint_02c/` | Completed |

---

## 4. Decision Log (Sprint 2C Proposals Pending Team Approval)

| ID | Topic | Proposed Implementation (Sprint 2C) | Team Status |
|---|---|---|---|
| `D06` | Temporary Checkout Hold TTL | `10 minutes` configurable via `public.system_settings ('booking_hold_minutes')`, lazily expired inside every capacity-sensitive RPC (no paid cron needed). | `PROPOSED_PENDING_TEAM_APPROVAL` |
| `D07` | Physical Space Allocation & Anti-Overbooking | Assign concrete `parking_spaces.id` under facility `FOR UPDATE` + `pg_advisory_xact_lock`, backed by `btree_gist` exclusion constraint `bookings_no_overlapping_space`. | `PROPOSED_PENDING_TEAM_APPROVAL` |
| `D08` | Dynamic Pricing Parameters (SQL + JS) | Vehicle (`0.65/1.00/1.30/1.55`), Occupancy (`1.00/1.20/1.40`), Peak (`08–10` & `17–20` BA `×1.15`), Weekend (`Sat/Sun ×1.10`), single final rounding. | `PROPOSED_PENDING_TEAM_APPROVAL` |
| `D09` | Cancellation Fee Policy (R06) | `0%` when cancelled `>=2h` prior to `starts_at`; `20%` when `<2h` prior (demo calculation only; no real charge). | `PROPOSED_PENDING_TEAM_APPROVAL` |
| `D10` | Vehicle Deletion Integrity | Preserve PostgreSQL FK from `bookings` to `vehicles`: unused vehicles can be deleted; vehicles with bookings are retained to guarantee referential integrity alongside `vehicle_snapshot`. | `PROPOSED_PENDING_TEAM_APPROVAL` |

---

## 5. Known Limitations

1. **Remote SQL scripts pending manual execution:** `01_backend_migration.sql`, `02_demo_seed.sql`, and `03_database_tests.sql` have been verified against PostgreSQL 17.12 locally, and must be executed manually by the user in Supabase SQL Editor (`qerrmfdpxbjwmeprwrbc`) before the live app switches from `Supabase · Migraciones pendientes` to `Backend Supabase · Centralizado`.
2. **No real payments or webhooks yet:** Mercado Pago Checkout Pro preference creation, test credentials, and server-side webhook verification belong to Sprint 2D; all Sprint 2C payments remain `is_test = true` and `status = 'pending'`.
3. **No operator check-in/out or QR hardware validation yet:** `booking_access_tokens` stores SHA-256 hashes securely, and confirmed stays never auto-transition to `completed`. Operational check-in, check-out, QR scanning, no-show verification, and owner dashboards belong to Sprint 3.
4. **In-app notifications only:** Notification preferences sync with PostgreSQL and trigger in-app `notifications` rows on booking events, without background Web Push / email / SMS gateways (zero-cost constraint).
5. **Synthetic demo catalog & illustrative SVGs:** All 8 commercial garages (725 spaces), 3 QA garages (4 spaces), amenities, demo reviews, and SVG images are synthetic demo data.

---

## 6. High-Resolution Sprint 2C Screenshots (2× DPR)

| Screen | File |
|---|---|
| Auth Modal (Light · Reserve Prompt + Future Google/Apple) | `02_trabajo/sprint_02c/screenshots/s2c_01_auth_modal_light.png` |
| Profile · Account Tab (Light · Role + Edit Profile) | `02_trabajo/sprint_02c/screenshots/s2c_02_profile_account_light.png` |
| Profile · Vehicles CRUD Tab (Light · Multi-Vehicle + Default) | `02_trabajo/sprint_02c/screenshots/s2c_03_profile_vehicles_light.png` |
| Hold Checkout Modal (Light · Live `09:59` Timer + Server Quote + MP Sprint 2D Prep) | `02_trabajo/sprint_02c/screenshots/s2c_04_checkout_hold_light.png` |
| Extend Stay Modal (Light · Pre-Confirmation Incremental Quote) | `02_trabajo/sprint_02c/screenshots/s2c_05_extend_booking_light.png` |
| My Bookings Modal (Dark · 5 Status Tabs + Supabase Badge + Event History + ICS/Share/Extend) | `02_trabajo/sprint_02c/screenshots/s2c_06_bookings_dark.png` |
| Mobile 390×844 Auth Modal (Dark · 0 Overflow) | `02_trabajo/sprint_02c/screenshots/s2c_07_mobile_auth_dark_390x844.png` |
