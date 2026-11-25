# A08 — Performance indicators · v0.1 · proposed
All targets illustrative and unmeasured. Define reporting in Buenos Aires time; exclude synthetic test resets from future production metrics.
| KPI | Formula | Window | Source | Owner | Proposed target |
|---|---|---|---|---|---|
| Booking success | confirmed / valid submitted requests | weekly | booking events | Platform Ops | ≥95% |
| Inventory mismatch | confirmed arrivals denied for capacity / confirmed arrivals | weekly | incident and check-in records | Garage manager | 0% |
| Service availability | usable booking minutes / agreed service minutes excluding planned maintenance | monthly | synthetic probes/incidents | Technology | ≥99% |
| Incident resolution | median elapsed time report to resolution | weekly | support log | Support | <60 min |
| Booked utilization | reserved bay-hours / sellable bay-hours | daily | intervals and capacity schedule | Owner | baseline first |
| Actual utilization | checked-in bay-hours / operating bay-hours | daily | check-in/out | Owner | baseline first |
| Estimated booking revenue | sum confirmed locked quotes less modeled cancellations | monthly | booking ledger | Owner | baseline first |
| No-show rate | verified no-shows / eligible confirmed bookings | weekly | attendance records | Garage manager | baseline first |
| Revenue per available bay-hour | actual net collected / sellable bay-hours | monthly | reconciled payments | Finance | baseline first |
Do not label estimated revenue as cash collected or booked occupancy as actual occupancy. If denominator zero, return N/A. Current prototype lacks full event history and actual payment/attendance records; these metrics remain proposed until data exists.
