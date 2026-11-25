# A04 — Service Blueprint · v0.1 · proposed
User: driver with a planned destination. Trigger: needs parking before arrival. Outcome: suitable reservation honored and stay closed. Boundary: search to check-out; onboarding and support shown as dependencies.
| Layer | Search | Compare | Reserve | Arrive | Depart |
|---|---|---|---|---|---|
| Evidence | Map/list | Quote + restrictions | Booking reference | Admission record | Receipt/status |
| User actions | Enter destination/time/vehicle | Select garage | Confirm | Present reference | Leave |
| **Line of interaction** | | | | | |
| Frontstage | App results | App quote | Confirmation or rejection | Attendant validates | Status updated |
| **Line of visibility** | | | | | |
| Backstage | Booking service checks eligible inventory | Pricing engine computes quote | Revalidate and persist reservation | Operator verifies slot and records check-in | Operator records check-out |
| **Line of internal interaction** | | | | | |
| Support | Map provider; garage onboarding | Rate and restriction maintenance | Inventory store; payment partner if enabled | Staff and support escalation | Event records; reconciliation |
Ownership: platform operations owns inventory service and incidents; garage manager owns capacity, hours and admission; finance owns reconciliation; technology owns provider availability and data integrity. Proposed roles, not assigned personnel.
Critical dependency: accurate garage capacity and atomic reservation validation. Exception: confirmed driver arrives but no space. Attendant verifies reference and actual capacity, informs support, offers approved alternative or refund review; platform records incident, checks affected bookings and suspends further sales if capacity unreliable. No automatic real refund in prototype.
Status: current map/list/local confirmation are baseline code capabilities pending browser verification; remaining stages proposed. Synthetic inventory is not live occupancy.
