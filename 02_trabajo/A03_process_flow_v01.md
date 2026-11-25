# A03 — Operational process flow · v0.1 · proposed
Scope: driver planning parking through departure. Current baseline demonstrates only map/list, local reservation and cancellation; interval validation, real payment and physical admission are not established.
```mermaid
flowchart TD
 A[Enter destination, vehicle and time] --> B[Search participating garages]
 B --> C{Eligible capacity?}
 C -- No --> D[Offer alternate garage or time]
 D --> B
 C -- Yes --> E[Compare total quote and conditions]
 E --> F[Confirm request]
 F --> G{Revalidate inventory}
 G -- No --> D
 G -- Yes --> H[Hold capacity and payment check if applicable]
 H --> I{Payment or demo confirmation valid?}
 I -- No --> J[Release hold and explain retry]
 I -- Yes --> K[Booking reference and locked quote]
 K --> L{Arrival or cancellation}
 L -- Cancel --> M[Apply policy and record release]
 L -- Arrival --> N{Operator validates booking}
 N -- Valid --> O[Check in]
 N -- Exception --> P[Operator checks record and escalates]
 P --> Q[Alternative or refund review]
 O --> R[Check out and record actual stay]
 L -- No arrival --> S[Verify absence after grace period]
 S --> T[Record no-show and release remaining interval]
 R --> U[Analytics and reconciliation]
 M --> U
 T --> U
 Q --> U
```
Payment, holds, operator validation, exception handling and actual occupancy are proposed; no funds move in the demo. Local booking must remain usable when map rendering fails.
