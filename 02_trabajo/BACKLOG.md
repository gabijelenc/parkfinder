# Product backlog — Sprint 2C updated
| ID | Requirement | Priority | Status |
|---|---|---|---|
| PF-01 | Interval availability, half-open intervals and peak concurrent occupancy | Critical | Implemented (JS + PostgreSQL 17 RPCs; remote SQL execution pending) |
| PF-02 | Capacity revalidation; cross-device protection requires shared transactional storage | Critical | Implemented (PostgreSQL `FOR UPDATE` + advisory lock + GiST exclusion constraint + 10-min hold TTL; 10-session local concurrency PASS; remote verification pending) |
| PF-03 | Vehicle type and compatibility | High | Implemented (JS + PostgreSQL RPC + Multi-vehicle CRUD & historical snapshots) |
| PF-04 | Transparent dynamic pricing and locked confirmed price | High | Implemented (JS + PostgreSQL 12/12 parity PASS; immutable `quote_snapshot`) |
| PF-05 | Amenities, restrictions and filters | High | Implemented (tri-state DB + UI filters) |
| PF-06 | Ratings, clearly labeled demo data; Google Places subject to approval | Medium | Implemented (24 synthetic demo reviews in DB; zero Google attribution) |
| PF-07 | Operator dashboard | High | Planned (Sprint 3; role & schema groundwork ready) |
| PF-08 | Owner analytics, CSV and rule-based insights | High | Driver personal analytics + CSV implemented (S2C); Owner dashboard planned (Sprint 3) |
| PF-09 | Valid QR and check-in/out | Medium | SHA-256 hashed access tokens stored server-side (S2C); operator scan/check-in/out planned (Sprint 3) |
| PF-10 | Configurable cancellation/no-show, verified release and simulated refund | High | Cancellation policy & capacity release implemented (S2C); verified no-show planned (Sprint 3) |
| PF-11 | Mercado Pago test integration | Optional | Architecture, schema (`payments`/`payment_events`), idempotency & `pf_prepare_mp_checkout_stub` prepared for Sprint 2D (no real payments) |
| PF-12 | Shared data, roles and transactional concurrency | High for multiuser | Implemented (Supabase Auth, 23/23 RLS tables, 12 `SECURITY DEFINER` RPCs; pending manual remote SQL Editor execution) |
| PF-13 | Regression tests, contingencies and documentation | Critical | 99/99 local automated checks PASS; architecture/ERD/RPC/setup docs completed; remote & human review pending |
| PF-14 | Map provider adapter: Google target, OSM fallback, keyless directions and quota controls | High | Implemented (OSM/Leaflet active + keyless Google Maps demo directions + offline fallback) |

