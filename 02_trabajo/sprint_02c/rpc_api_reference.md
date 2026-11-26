# parkFinder — Sprint 2C PostgreSQL RPC API Reference

All client-callable RPCs are implemented in `supabase/sprint_02c/01_backend_migration.sql` as `SECURITY DEFINER` functions with:
- Locked `search_path` (`pg_catalog, public` or `pg_catalog, public, extensions`)
- `REVOKE ALL FROM PUBLIC`
- Minimal `GRANT EXECUTE` (`anon, authenticated` only for read-only catalog/quote functions; strictly `authenticated` for all mutations and user-scoped reads)
- Identity strictly derived from `auth.uid()` (never trusting client-supplied `user_id`, `role`, `status`, or `price`)

---

## 1. Public Read-Only RPCs (`anon, authenticated`)

### `public.pf_get_catalog_availability`
```sql
pf_get_catalog_availability(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_vehicle_type text DEFAULT 'car',
  p_vehicle_height_m numeric DEFAULT NULL,
  p_include_qa boolean DEFAULT false
) RETURNS jsonb
```
- **Purpose:** Returns active facilities (excluding `is_qa = true` unless `p_include_qa = true`), amenities, 7-day operating hours, accepted vehicle types, synthetic demo reviews, half-open interval eligibility, peak concurrent occupancy, available spaces, and authoritative server-side dynamic quote.
- **Validations:** `p_ends_at > p_starts_at`, duration `<= 72h`, `p_vehicle_type IN ('motorcycle','car','suv','van')`.
- **Privacy:** Never exposes user bookings, PII, or access tokens.
- **Error codes:** `NON_POSITIVE_DURATION`, `EXCEEDS_MAX_DURATION`, `INVALID_VEHICLE_TYPE`.

### `public.pf_get_facility_quote`
```sql
pf_get_facility_quote(
  p_facility_slug_or_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_vehicle_type text DEFAULT 'car',
  p_vehicle_height_m numeric DEFAULT NULL
) RETURNS jsonb
```
- **Purpose:** Computes authoritative availability and segmented dynamic quote for a single active facility by `slug` or `uuid`.
- **Error codes:** `NON_POSITIVE_DURATION`, `EXCEEDS_MAX_DURATION`, `INVALID_VEHICLE_TYPE`, `FACILITY_NOT_FOUND`.

---

## 2. Authenticated Driver Booking & Account RPCs (`authenticated` only)

### `public.pf_create_booking_hold`
```sql
pf_create_booking_hold(
  p_facility_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_payment_method text DEFAULT 'pay_at_garage',
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
```
- **Purpose:** Atomically creates a temporary `pending_payment` reservation hold (configurable TTL from `system_settings.booking_hold_minutes`, default `10` minutes) with a concrete assigned `space_id`, frozen `vehicle_snapshot`, and authoritative `quote_snapshot`.
- **Concurrency:** Acquires `pg_advisory_xact_lock` + `FOR UPDATE` on `parking_facilities`, expires overdue holds for that facility, allocates a compatible free `parking_spaces` row, and is backed by `bookings_no_overlapping_space` GiST exclusion constraint.
- **Idempotency:** Passing the same `p_idempotency_key` replays the existing hold without creating duplicates.
- **Validations:** `auth.uid() IS NOT NULL`, `p_starts_at >= now() - 2 min`, `0 < duration <= 72h`, vehicle owned by `auth.uid()`, facility `is_active = true`, day-by-day Buenos Aires operating hours, vehicle type accepted, height `<= max_height_m`, available physical space.
- **Error codes:** `AUTH_REQUIRED`, `INVALID_PAYMENT_METHOD`, `NON_POSITIVE_DURATION`, `PAST_START_TIME`, `EXCEEDS_MAX_DURATION`, `VEHICLE_NOT_FOUND`, `FACILITY_NOT_FOUND`, `OUT_OF_HOURS`, `VEHICLE_TYPE_NOT_ACCEPTED`, `HEIGHT_EXCEEDS_CLEARANCE`, `NO_AVAILABILITY`.

### `public.pf_confirm_booking_demo`
```sql
pf_confirm_booking_demo(
  p_booking_id uuid,
  p_payment_method text DEFAULT NULL
) RETURNS jsonb
```
- **Purpose:** Confirms an unexpired `pending_payment` hold belonging to `auth.uid()` in Sprint 2C demo mode. Issues a SHA-256 hashed access token in `booking_access_tokens`, logs `confirmed_demo` in `booking_events` and `audit_logs`, and creates an in-app `notifications` entry if enabled.
- **Hold Expiry Protection:** Locks the facility row and re-checks `hold_expires_at > now()`. If expired, transitions booking to `expired`, cancels pending payment, logs `hold_expired`, and returns `HOLD_EXPIRED` (never overbooks).
- **Payment Guard:** Keeps `payments.is_test = true` and `payments.status = 'pending'`; clients can **never** mark a payment `approved`.
- **Error codes:** `AUTH_REQUIRED`, `BOOKING_NOT_FOUND`, `ALREADY_CONFIRMED`, `INVALID_BOOKING_TRANSITION`, `HOLD_EXPIRED`, `INVALID_PAYMENT_METHOD`.

### `public.pf_cancel_booking`
```sql
pf_cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT 'user_cancelled'
) RETURNS jsonb
```
- **Purpose:** Cancels a `pending_payment` or `confirmed` booking owned by `auth.uid()`, releases capacity immediately, revokes `booking_access_tokens`, cancels pending payment, computes proposed R06 fee (`0%` if `>=2h` before `starts_at`, `20%` if `<2h` for confirmed bookings), and appends `cancelled` to `booking_events` and `audit_logs`.
- **Error codes:** `AUTH_REQUIRED`, `BOOKING_NOT_FOUND`, `ALREADY_CANCELLED`, `CANNOT_CANCEL_STATUS`.

### `public.pf_preview_booking_extension`
```sql
pf_preview_booking_extension(
  p_booking_id uuid,
  p_new_ends_at timestamptz
) RETURNS jsonb
```
- **Purpose:** Non-mutating verification before extending a `confirmed` or `checked_in` booking. Validates `p_new_ends_at > ends_at`, total duration `<= 72h`, BA operating hours for `[ends_at, p_new_ends_at)`, and physical space availability, returning `incrementalAmount`, `newTotalAmount`, and `incrementalQuote`.
- **Error codes:** `AUTH_REQUIRED`, `BOOKING_NOT_FOUND`, `INVALID_EXTENSION_STATUS`, `EXTENSION_MUST_BE_LATER`, `EXCEEDS_MAX_DURATION`, `OUT_OF_HOURS`, `NO_AVAILABILITY`.

### `public.pf_extend_booking`
```sql
pf_extend_booking(
  p_booking_id uuid,
  p_new_ends_at timestamptz
) RETURNS jsonb
```
- **Purpose:** Atomically extends `ends_at` under facility lock, adds server-calculated `incrementalAmount` to `total_amount`, preserves `originalTotalArs` and appends extension record inside `quote_snapshot.extensions`, extends QR token expiry, and logs `extended` in `booking_events`, `notifications`, and `audit_logs`.
- **Error codes:** Same as `pf_preview_booking_extension`.

### `public.pf_get_my_bookings`
```sql
pf_get_my_bookings() RETURNS jsonb
```
- **Purpose:** Lazily expires overdue holds for `auth.uid()` and returns all bookings owned by `auth.uid()` joined with facility metadata, `spaceLabel`, `paymentStatus`, `events` timeline, and `uiCategory` (`active`, `upcoming`, `completed`, `cancelled`).
- **Operational Guard:** Sets `uiCategory = 'completed'` **exclusively** when `bookings.status = 'completed'`; elapsed confirmed stays without an operational check-out event are flagged `awaitingOperationalClosure = true` rather than auto-completed.

### `public.pf_get_my_analytics`
```sql
pf_get_my_analytics() RETURNS jsonb
```
- **Purpose:** Aggregates monthly spend, booking counts, frequent garages, `bookedEstimatedArs`, `simulatedPaidArs`, `bookedEstimatedHours`, and `actualParkedHours` (counting only operationally `completed` stays).

### `public.pf_set_default_vehicle`
```sql
pf_set_default_vehicle(p_vehicle_id uuid) RETURNS jsonb
```
- **Purpose:** Atomically sets `p_vehicle_id` as the sole `is_default = true` vehicle for `auth.uid()`.

### `public.pf_prepare_mp_checkout_stub`
```sql
pf_prepare_mp_checkout_stub(p_booking_id uuid) RETURNS jsonb
```
- **Purpose:** Sprint 2D architecture verification stub. Always returns `ok = false`, `code = 'MERCADO_PAGO_NOT_ACTIVATED_SPRINT_2D'`, and the prepared contract (`externalReference`, `idempotencyKey`, `amount`, `currency`, `isTest = true`, `clientCanApprove = false`).

### `public.pf_release_expired_holds`
```sql
pf_release_expired_holds() RETURNS jsonb
```
- **Purpose:** Authenticated trigger to expire overdue `pending_payment` holds across facilities.

---

## 3. Direct RLS Self-Service Tables (`authenticated` only)

Clients interact directly via PostgREST only on owner-scoped self-service tables protected by `user_id = (SELECT auth.uid())`:
- `public.profiles` (`SELECT` own, `UPDATE` `full_name, phone, preferred_language, preferred_theme, default_payment_method`)
- `public.user_roles` (`SELECT` own only; zero client writes)
- `public.vehicles` (`SELECT, INSERT, UPDATE, DELETE` own; `DELETE` protected by `bookings` FK so historical snapshots stay intact; trigger guarantees single default)
- `public.favorite_garages` (`SELECT, INSERT, UPDATE, DELETE` own)
- `public.favorite_destinations` (`SELECT, INSERT, UPDATE, DELETE` own)
- `public.notification_preferences` (`SELECT, INSERT, UPDATE, DELETE` own)
- `public.notifications` (`SELECT` own, `UPDATE(read_at)` own)
