# Spacecraft control test report

| Area | Result | How |
|---|---|---|
| W/S/A/D/Space/C, Shift boost, blur release, mouse look, wheel zoom, V camera modes, M nav map, Escape | PASS | `travel_controls.py`, 18/18 (Chrome) |
| Typing in search does not drive the ship | PASS | `qa_chrome_audit.py` journey D |
| Autopilot (via a destination request) | PASS: phases ['accelerate', 'align', 'arrive', 'cruise', 'decelerate']; peak speed at sample 12 of 59; final speed 0; arrived | T4 |
| Manual override (W during autopilot) | PASS: autopilot released | T5 |
| Braking (B) | PASS: speed reduced by more than 80 % in 1.5 s | T6 |
| Camera modes | PASS: chase / external / cockpit | T7 (`12_camera_*.png`) |
| Speed display corresponds to the simulation | Visually verified: the HUD shows the actual velocity relative to the reference body (0 km/s at entry) | `07_*` |
| Not automated | Collision/proximity warning; gear speed-limit labels vs the HUD; pitch/roll key-by-key | - |
