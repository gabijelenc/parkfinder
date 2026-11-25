# A05 — Low-fidelity wireframes · draft
Conceptual layout, not screenshots or implemented UI.
## Driver
```
[ParkFinder | ES/EN | My bookings]
[Destination      ] [Date] [Arrival] [Duration]
[Vehicle ▼] [Amenities ▼] [Search]
+------------------+----------------------+
| Map / list mode  | Garage / availability|
| Demo markers     | restrictions / quote |
|                  | [Compare] [Reserve]   |
+------------------+----------------------+
[Demo inventory — no real payment]
```
Reserve dialog: dates, vehicle, base rate, demand/time factors, total locked on confirmation, policy and demo label. If no capacity, show alternatives and no confirmation.
## Operator
```
[Garage selector] [Today] [Capacity status]
[Capacity & hours] [Rates] [Vehicle restrictions]
[Reservation ID | interval | status | Check in/out]
[Exceptions | Verify absence | Escalate]
```
Prevent capacity reductions conflicting with confirmed bookings. Confirm destructive edits; record reason.
## Owner
```
[Garage] [Period] [Export CSV]
[Booked occupancy] [Estimated revenue] [No-show rate]
[Hourly demand chart] [Vehicle mix]
[Recommendations: evidence / review / dismiss]
```
Actual occupancy and collected revenue show N/A without supporting records.
## Platform support (conceptual)
```
[Incident queue] [Garage / booking ID] [Severity]
[Capacity mismatch | payment pending | provider outage]
[Assign owner] [Suspend sales] [Resolve / record evidence]
```
Role enforcement requires a shared authenticated backend; local demo tabs are not security boundaries.
