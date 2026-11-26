# Sprint 02 — Driver Experience · v0.1 · implementation specification
Base: improvements, inherited from Sprint 01 commit 6194d0bf2871c19d14fb0b08b53ed1bff34b8fb8. Create feature/sprint-02-driver-experience from current improvements. Preserve current UI, ES/EN, local ledger compatibility, static hosting, all Sprint 01 tests and QA sandbox. Do not merge or deploy.

## Scope
- PF05: synthetic garage amenity data (covered, security/CCTV, EV charging, accessible bays, valet, 24/7); show unknown separately from no. Combine selected filters with availability, vehicle compatibility, total price and distance. Clear filters and show no-results guidance.
- PF06: synthetic rating 1–5 and review count explicitly labelled demo; sort by rating; do not imply Google source or scrape Google. Display amenities and restrictions on cards and details.
- PF14: external Google Maps directions links with validated destination coordinates, labelled as navigation to a demo location; maintain Leaflet/OSM, explicit estimated straight-line distance and list fallback. No new paid APIs. Prepare provider interface only where useful; Google integration remains proposed.
- PF01 extension: support arrival and departure dates independently, overnight and multi-day intervals in Buenos Aires UTC-3; proposed maximum duration 72h, validate end > start and future booking window. Preserve half-open overlap and peak concurrent occupancy. Validate opening hours across every local day including overnight and closed periods. Extend hourly proration across midnight/weekend. Preserve locked quotes and legacy same-day records. Do not silently change approved/proposed pricing factors; record current implemented peak windows and proposed discrepancy for team review.
- Improve responsive card hierarchy, filter usability, keyboard navigation and clear error messages, without redesigning brand.

## Acceptance
S2-T01 combined amenity/price/rating/distance filters return only matching synthetic data; reset restores results.
S2-T02 unavailable/vehicle-incompatible garages never become bookable through filters.
S2-T03 ratings explicitly demo in both languages; no Google attribution.
S2-T04 navigation uses correct validated coordinates; no claim of actual partner garage; map failure retains list and booking.
S2-T05 cap 1 reservation 23:00–01:00 next day blocks 00:00–00:30 but permits 01:00–02:00; cancellation releases capacity.
S2-T06 non-24h garage rejects intervals spanning a closed period; 24h garage accepts overnight.
S2-T07 Friday-to-Saturday quote applies weekend multiplier only to Saturday segments, preserves final rounding and locked price.
S2-T08 invalid dates, equal/reversed interval, excessive duration rejected with clear bilingual feedback.
S2-T09 old booking records survive reload, all Sprint 01 tests still pass, sandbox isolated.
S2-T10 desktop/mobile visual checks, no uncaught JS errors; document network context.
Run actual domain and browser tests. Save report with inputs, actual/expected, status, commit and known limitations; don't claim tests not run passed. Keep local-only concurrency and synthetic inventory labels. No billing, credentials, real payments, merge or deployment. Push branch and report.

## UX redesign — priority for Sprint 02
Replace the current dense desktop dashboard feel with a polished consumer parking marketplace. Use a light neutral background, restrained dark navy text and a single teal accent; WCAG AA contrast, clear typographic hierarchy, consistent spacing (8px grid), generous tap targets and minimal decorative borders. Desktop: compact brand header, prominent destination/time/vehicle search, map/list split with readable cards and sticky filters; mobile: search summary, map/list toggle or bottom sheet, full-width primary action. Cards: garage name, walk estimate clearly labeled, total ARS price as primary, interval availability and essential amenities; hide secondary details in expandable detail view. Reservation: short review flow with quote breakdown collapsed by default, visible total and demo disclosure, explicit confirmation. Avoid technical badges and QA controls in the primary journey; keep them accessible in an information/QA menu, without concealing synthetic status. Design empty/loading/error/disabled states. Preserve ES/EN, keyboard access, booking logic, test hooks and offline fallback. Do not introduce paid assets or external dependencies. Provide before/after screenshots at desktop and mobile and run regression tests; visual review pending human acceptance.
