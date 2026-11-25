# ParkFinder — Product requirements · v0.1 · draft
Goal: demonstrate a reliable local reservation for a suitable garage and time interval using synthetic data. Source: product brief, business rules, course guidelines pp. 4–10.
| ID | Requirement | Acceptance | Target |
|---|---|---|---|
| PF01 | Search by destination, arrival and departure | Valid interval; results show eligible capacity based on peak simultaneous overlaps | V2 |
| PF02 | Revalidate at confirmation | Reject full garage; prevent duplicate submission; disclose browser-only scope | V2 |
| PF03 | Vehicle compatibility | Reject incompatible type/clearance; show restrictions | V2 |
| PF04 | Transparent quote | Show base, duration, factors, total in ARS; save locked price | V2 |
| PF05 | Amenities and filters | Filter on verified demo attributes, show missing data | V2 |
| PF06 | Reviews | Synthetic reviews labeled; real Places subject to terms and cost approval | V3 optional |
| PF07 | Operator | Edit demo capacity/rates/hours; view bookings; reject changes that invalidate confirmed reservations | V2/V3 |
| PF08 | Owner analytics | Calculate booked occupancy, estimated revenue and cancellations from records; export CSV; distinguish actual from estimates | V3 |
| PF09 | Admission | Unique booking reference and QR validation against reservation; reject duplicate/invalid check-in | V3 |
| PF10 | Exceptions | Log cancellation, grace period and verified no-show; release only unused future capacity; simulated penalties | V3 |
| PF11 | Payment | Sandbox only; verified webhook and idempotency required for real integration | Optional |
| PF12 | Shared inventory | Transactional concurrency, roles and auditable events; otherwise explicitly local | Optional |
| PF13 | QA | Repeatable scenarios, accessibility, mobile layout, ES/EN, fallback and data reset | All |
| PF14 | Maps | Google target, OSM demo fallback; external directions, no paid API without approval | V2/V3 |
Platform management: garage onboarding, support, incident management, privacy, partner reconciliation and role access are conceptual until implemented. Nonfunctional: no real payment or personal data in demo; no secrets in repo; responsive layout; transparent error states; stable local persistence; no unsupported availability promise. Final acceptance requires human review and execution evidence.
