# parkFinder — Supabase Database Migrations & Setup Manual (Sprint 2C)

- **Supabase Project:** `parkfinder-dev`
- **Project Reference:** `qerrmfdpxbjwmeprwrbc`
- **Project URL:** `https://qerrmfdpxbjwmeprwrbc.supabase.co`
- **PostgreSQL Version:** `17.12` (Database Timezone: `UTC` | Business Timezone: `America/Argentina/Buenos_Aires`, UTC-3)
- **Access Mode:** Free Tier · Manual SQL Editor execution (no paid add-ons, no MCP credentials, no `service_role` keys in GitHub or frontend)

---

## 1. Versioned Migration Inventory

### A. Baseline Migrations (Already Applied Manually on `parkfinder-dev`)
All 5 baseline migrations are versioned under `supabase/migrations/` for full traceability:

| Order | File | Scope | Status on `parkfinder-dev` |
|---|---|---|---|
| 1 | `supabase/migrations/20261126000100_profiles_roles.sql` | `profiles`, `user_roles`, RLS & least-privilege grants (DB01.1) | Applied by user |
| 2 | `supabase/migrations/20261126000200_auth_user_trigger.sql` | `handle_new_user()` trigger on `auth.users` creating profile + `driver` role (DB01.2 — retroactively versioned in Sprint 2C) | Applied by user (verified with `driver@example.com`) |
| 3 | `supabase/migrations/20261126000300_parking_facilities.sql` | `parking_facilities` table (13 baseline columns) + RLS (DB02.1 — retroactively versioned in Sprint 2C) | Applied by user |
| 4 | `supabase/migrations/20261126000400_consolidated_schema.sql` | 19 domain tables with fail-closed RLS + public catalog read policies (DB02.3) | Applied by user |
| 5 | `supabase/migrations/20261126000500_driver_security.sql` | Driver owner-scoped RLS policies, deny direct booking/role/token writes & reads (DB02.4) | Applied by user (verified: `direct_booking_insert=false`, `direct_role_insert=false`, `anonymous_booking_read=false`, `direct_token_read=false`) |

### B. Sprint 2C Consolidated Scripts (To Execute Manually in Supabase SQL Editor)
Located in `supabase/sprint_02c/`. All three scripts are **non-destructive** and **idempotent** (safe to re-run without dropping tables or duplicating rows):

| Execution Order | Script | Purpose |
|---|---|---|
| **Step 1** | `supabase/sprint_02c/01_backend_migration.sql` | Incremental column additions (`ADD COLUMN IF NOT EXISTS`), `btree_gist` exclusion constraint (`bookings_no_overlapping_space`), `system_settings` (10-min hold TTL), single-default vehicle trigger, hardened auth trigger, dynamic pricing engine, and 12 authoritative `SECURITY DEFINER` RPCs. |
| **Step 2** | `supabase/sprint_02c/02_demo_seed.sql` | Seeds all **8 synthetic commercial garages** from `core-booking.js` (**725 physical spaces**), tri-state amenities, 7-day operating hours, accepted vehicle types, 24 synthetic demo reviews, 10 global pricing rules, and **3 isolated QA facilities** (`is_qa = true`, capacity 1 & 2, 4 spaces). |
| **Step 3** | `supabase/sprint_02c/03_database_tests.sql` | Self-cleaning SQL verification suite (`DB-T01..DB-T12`) testing RLS, table privileges, seed counts, auth trigger, half-open intervals, vehicle/height/hours/overnight checks, dynamic pricing, hold expiry, multi-user isolation, quote lock, extension, and Mercado Pago Sprint 2D stub. |

---

## 2. Exact Instructions for Supabase SQL Editor

1. Open the Supabase Dashboard for project **`parkfinder-dev`** (`qerrmfdpxbjwmeprwrbc`) and navigate to **SQL Editor** → **New query**.
2. **Run Step 1 (`01_backend_migration.sql`):**
   - Paste the full contents of `supabase/sprint_02c/01_backend_migration.sql` and click **Run**.
   - **Expected result:** `status = 01_backend_migration_applied`, `rls_enabled_tables = 23`, `rls_disabled_tables = 0`, and all 6 direct-privilege checks (`direct_booking_insert`, `direct_role_insert`, `anonymous_booking_read`, `direct_token_read`, `direct_payment_update`, `direct_settings_read`) = `false`.
3. **Run Step 2 (`02_demo_seed.sql`):**
   - Open a new SQL tab, paste `supabase/sprint_02c/02_demo_seed.sql`, and click **Run**.
   - **Expected result:** 2 summary rows:
     - `is_qa = false` · `synthetic_demo` · `facilities_count = 8` · `declared_spaces = 725` · `physical_spaces_seeded = 725`
     - `is_qa = true` · `synthetic_qa` · `facilities_count = 3` · `declared_spaces = 4` · `physical_spaces_seeded = 4`
   - *(Optional idempotency check)*: Run `02_demo_seed.sql` a second time; counts must remain strictly `8 / 725` and `3 / 4`.
4. **Run Step 3 (`03_database_tests.sql`):**
   - Open a new SQL tab, paste `supabase/sprint_02c/03_database_tests.sql`, and click **Run**.
   - **Expected result:** 12 rows (`DB-T01` through `DB-T12`), all with `status = PASS`. All temporary QA users and bookings are automatically cleaned up before completion.
5. **Verify Authentication Settings (Supabase Dashboard → Authentication):**
   - Ensure **Email** provider is enabled (Confirm email optional for dev testing; if enabled, new accounts confirm via inbox before sign-in).
   - Add your Cloudflare Workers preview URL and local dev URL to **Authentication → URL Configuration → Redirect URLs** for password recovery links.
   - Do **not** activate Google/Apple OAuth or any paid add-on in Sprint 2C.

---

## 3. Multi-Session Concurrency & JS-vs-PostgreSQL Pricing Parity Testing

Because Supabase SQL Editor runs statements sequentially in a single session, true parallel multi-session contention on the last parking space is verified with the automated script:

```bash
# Against local PostgreSQL 17.12 Docker container (pf-pg17)
node tests/pg_concurrency_and_parity_tests.js

# Or against any PostgreSQL connection string (do NOT commit credentials!)
DATABASE_URL="postgres://..." node tests/pg_concurrency_and_parity_tests.js
```

This runs 10 simultaneous sessions competing for capacity-1 (`PG-CONC-01`), 8 simultaneous sessions competing for the last spot of capacity-2 (`PG-CONC-02`), concurrent late-confirm vs rebook after hold expiry (`PG-CONC-03`), and 12 exact dynamic pricing parity checks comparing `core-booking.js` vs `public.pf_calculate_quote_internal` (`PG-PARITY-01..12`).
