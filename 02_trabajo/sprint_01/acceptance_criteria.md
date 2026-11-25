# Core Booking — executable scenarios to implement
Use synthetic garage capacity 1 or 2, fixed future dates in America/Argentina/Buenos_Aires. Tests must be isolated, resettable and preserve user data.
- T01: capacity 1, reserve 08:00–11:00 and 11:00–13:00; both accepted.
- T02: capacity 1, reserve 08:00–11:00 then 10:00–12:00; reject second.
- T03: capacity 2, existing 08:00–09:00 and 10:00–11:00; request 08:00–11:00; accept exactly one extra concurrent booking.
- T04: cancel active booking and release interval; retain audit status.
- T05: reject invalid date/time, negative duration, incompatible vehicle and out-of-hours interval.
- T06: calculate quote per hourly segment using local peak/weekend and occupancy at quote time; display factors; round final ARS amount once. Proposed proration policy pending team review.
- T07: changing rate after confirmation cannot change stored price.
- T08: storage failure must prevent durable confirmation and display error.
- T09: map unavailable; local list and bookings remain accessible.
- T10: rapid repeated confirm creates at most one booking in same page. Explicitly disclose multi-tab/device race limitations.
Evidence: test ID, commit, input, expected/actual, status, screenshot/log, reviewer. All not run.
