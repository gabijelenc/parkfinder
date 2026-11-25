# Business rules · draft · proposed demo defaults
- R01: Each garage has capacity, operating hours, accepted vehicle types, amenities and physical restrictions.
- R02: Store start/end in Buenos Aires time, validate positive duration and use half-open intervals. Available capacity = total capacity minus maximum concurrent active bookings during requested interval, not sum of all intersecting bookings.
- R03: Revalidate capacity before confirmation. Browser-local storage does not ensure cross-device atomicity; shared transactional storage is a separate capability.
- R04: Base hourly rate × duration × vehicle factor × demand/time factors; display total and breakdown before confirmation. Freeze the confirmed quote. Proposed vehicle factors: motorcycle .65, car 1, SUV 1.30, van 1.55. Occupancy <50%: 1; 50–<75%: 1.2; ≥75%: 1.4. Proposed peak factor 1.15 and weekend factor 1.10. Define multi-hour proration before implementation.
- R05: Garage compatibility must be enforced independently of pricing. Ratings and amenities must identify provenance; synthetic ratings must not be represented as Google reviews.
- R06: Early cancellation at least two hours before arrival: 0%; later cancellation: 20%; verified no-show: 30%; grace period: 15 minutes. These are proposals, not legal/commercial approval. Verify actual non-arrival before release of remaining reserved time; dispute and manual override with audit trail.
- R07: Payment test only. A future real booking requires a secure payment confirmation and capacity hold/reconciliation; no confirmed booking based only on browser redirect.
- R08: Operator manages capacity, rates, restrictions and attendance; owner reviews KPIs and recommendations, never automatic price changes without approval.
- R09: Clearly distinguish functional, simulated and conceptual. Never claim live availability or cash collected from synthetic records.
