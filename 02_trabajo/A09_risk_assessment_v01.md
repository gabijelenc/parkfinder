# A09 — Risk & Governance · v0.1 · draft
Scale P and I 1–5; score P×I. Gross before controls; net is a hypothetical estimate after proposed controls, not measured residual exposure.
| ID | Cause → event → consequence | Gross P×I | Control | Net P×I | Accountable role |
|---|---|---|---|---|---|
| R1 | Stale or concurrent inventory → overbooking → denied admission | 4×5=20 | Interval validation, transactional store, operator reconciliation | 2×5=10 | Platform Ops |
| R2 | Map/provider failure → search unavailable → lost bookings | 3×3=9 | List fallback, provider monitoring, keyless directions | 2×2=4 | Technology |
| R3 | Payment mismatch → wrong confirmation/refund → financial loss | 3×5=15 | Verified webhook, idempotency, reconciliation, sandbox first | 2×4=8 | Finance |
| R4 | Weak access/data exposure → unauthorized booking or disclosure → loss of trust | 3×5=15 | Role checks, minimum data, secure server credentials, audit | 2×4=8 | Technology |
| R5 | Incorrect restrictions/attendance → unsuitable admission or unfair charge → dispute | 3×4=12 | Compatibility checks, verified no-show, manual dispute review | 2×3=6 | Garage manager |
Exposure: R1, R3, R4 dominate; most severe event is a confirmed booking denied due to overselling. Proposed appetite: zero knowingly oversold confirmed bookings; any incident triggers sales pause for affected garage and support/manager notification within 15 minutes. Monitor mismatch count and unresolved payment discrepancies. Escalation: verify booking and capacity, protect existing customers, offer alternative/refund review, investigate root cause, resume only after reconciliation. Controls largely proposed; browser-local validation cannot guarantee concurrency. Team must approve scores, tolerance and owners.
