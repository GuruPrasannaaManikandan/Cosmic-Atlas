# Warp flight verification

- **Motion:**
  - departure from the current position;
  - S-curve ease, so acceleration then deceleration;
  - log-distance approach;
  - smooth heading turn (first 22 %);
  - arrival into follow mode.
- **Duration:** distance-based (3-11 s, log of the zoom ratio) divided by the Flight setting (Cinematic 0.5x / Normal / Fast 2x). Unit test: Neptune takes longer than the Moon, and Fast halves the time.
- **Honesty:** the HUD shows the real remaining distance and light time, e.g. "13,600,422 km, light 45.4 s" on Phobos -> Jupiter. The flight itself is time-compressed.
- **HUD:**
  - shows mode (Departing / Warp / Approach), from -> to, a thin progress bar, ETA and a labelled cancel;
  - at most 1.86 % of a 1440x900 viewport, and never covers the centre (automated);
  - screenshots: `02_*`, `03_*`.
- **Cancel:**
  - tested at about 45 % of the flight (C1, C2), plus unit tests about 2 s in;
  - position holds, there is no stale stepping, and the next flight departs from there.
  - **Not separately automated:** cancel at the very start or very end (same code path).
- **Reduced motion:** turns off the warp streaks (dock toggle; defaults to the OS `prefers-reduced-motion` setting).
