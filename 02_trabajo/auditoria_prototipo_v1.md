# V1 baseline audit — 2026-11-25
Source inspected: index.html blob bbb8907035ec9accbd7b5f63d6cadbe93bbf3812.
| Finding | Code evidence | Severity | Action |
|---|---|---|---|
| Global inventory ignores booking interval | 1362–1393, 1899 | Critical | PF01–02 |
| Cached inventory and separate writes can diverge | 1363, 1899–1901 | Critical | derive availability from booking ledger; shared transaction later |
| Fixed quote | 1517–1519 | High | PF04 |
| No vehicle eligibility | 718–775, 1885–1897 | High | PF03 |
| Cancellation removes history | 2045–2057 | High | PF10, retain status |
| Storage failure silently ignored | 1355–1360 | High | explicit failure, no false confirmation |
| Synthetic inventory and payment | 718–785, 1896 | Boundary | label demo |
| Distance straight-line and estimated walk | 788–789, 1512–1515 | Medium | PF14; distinguish routed distance |
Static inspection only, no browser tests performed. Preserve original blob as V1 evidence. Do not represent future changes as reviewed or functional.
