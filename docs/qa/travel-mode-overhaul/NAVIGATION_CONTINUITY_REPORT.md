# Navigation continuity report

Chrome 156, live local site (`scripts/e2e/travel_overhaul_check.py`, `travel_overhaul_report.json`).

Each leg starts at the previous arrival:
- the first-frame move is a fraction of the route length;
- arrival is in target radii;
- "Monotonic" means the distance to the target decreased in every sample;
- "Panels in flight" is the largest number of panels visible during the flight.

| Leg | Departure distance | First-frame move | Arrival | Monotonic | Panels in flight |
|---|---|---|---|---|---|
| earth -> moon | 4.017e-08 ly | 0.0096 % | 3.5 R | True | 0 |
| moon -> mars | 2.153e-05 ly | 0.0023 % | 3.5 R | True | 0 |
| mars -> phobos | 1.160e-09 ly | 0.0036 % | 4.2 R | True | 0 |
| phobos -> jupiter | 6.336e-05 ly | 0.0066 % | 3.5 R | True | 0 |
| jupiter -> europa | 6.083e-08 ly | 0.0124 % | 3.5 R | True | 0 |
| europa -> saturn | 2.063e-04 ly | 0.0024 % | 6.0 R | True | 0 |
| saturn -> titan | 1.116e-07 ly | 0.0039 % | 3.5 R | True | 0 |
| titan -> neptune | 3.265e-04 ly | 0.0021 % | 3.5 R | True | 0 |

Additional results:
- **Mid-flight cancel** (real Cancel button): position drift 0; the next flight starts at the cancel point ({'firstFrameFraction': 6.609587009130219e-05}).
- **Travel Mode entry:** position delta 0, orientation unchanged, speed 0, reference body = the viewed body.
- **Unit tests** (`navigationContinuity.test.ts`, 9): t=0 pose = departure, smooth heading, slerp stability, the 9-leg chain, distance- and speed-based duration, cancel hold and resume, Travel entry, autopilot routing, exit continuity.
