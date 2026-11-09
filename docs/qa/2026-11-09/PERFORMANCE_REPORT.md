# Performance Report (2026-11-09)

**Machine:** Intel Core Ultra 7 155H, Intel Arc iGPU, 15.6 GB RAM, Windows 11. **Browser:** chrome 156.0.8078.81 (headed, vsync).
**Viewport:** 1920x1080, DPR 1. **Quality:** balanced. **Duration:** 60 s per scenario, plus a 300 s soak. Script: `scripts/e2e/perf_scenarios.py`.

## Load (Vite dev server, unminified modules)

| TTFB | DOMContentLoaded | load | first canvas frame | time to interactive | resources | transferred |
|---|---|---|---|---|---|---|
| 6 ms | 241 ms | 244 ms | 3.02 s | 3.05 s | 106 | 17.5 MB |

Production bundle (Vite build): index 440 kB (132 kB gzip), three.js vendor 823 kB (222 kB gzip), plus textures and the asteroid catalogue.

## Scenarios

| Scenario | mean | median | p95 | p99 | max | frames >= 58 fps | long tasks | JS heap start -> end |
|---|---|---|---|---|---|---|---|---|
| idle-solar-system | 16.67 ms | 16.7 | 16.8 | 16.9 | 17.1 | 100.0 % | 0 | 38.6 -> 52.6 MB |
| camera-orbit-drag | 16.67 ms | 16.7 | 16.8 | 16.9 | 16.9 | 100.0 % | 0 | 45.1 -> 69.0 MB |
| fast-navigation | 16.67 ms | 16.7 | 16.8 | 16.8 | 17.1 | 100.0 % | 0 | 53.9 -> 56.5 MB |
| dense-starfield-milkyway | 16.67 ms | 16.7 | 16.8 | 16.9 | 17 | 100.0 % | 0 | 48.6 -> 54.3 MB |
| black-hole-event | 16.67 ms | 16.7 | 16.8 | 16.9 | 17 | 100.0 % | 0 | 44.7 -> 53.1 MB |
| planet-closeup-saturn | 16.67 ms | 16.7 | 16.8 | 16.8 | 17.1 | 100.0 % | 0 | 44.0 -> 56.3 MB |
| travel-navmap-open | 16.67 ms | 16.7 | 16.8 | 16.8 | 16.9 | 100.0 % | 0 | 64.3 -> 57.8 MB |

**Soak (300 s, idle Solar System, sampled every 10 s):** JS heap 38.9-69.6 MB, sawtooth (garbage-collection cycles) with no upward trend, so no leak was detected.

## Quality tiers and other measurements

- **Live site, 1920x1080 headed, Uranus close-up:** tiers interleaved High / Balanced / Performance x 2 give mean 16.67 ms and p95 <= 16.9 ms at every tier (`docs/foundation`).
- **Unity WebGL production build:** 81.2 MB uncompressed; load 6.1 s; WASM heap 166 MB constant.
- **Unity WebGL frame time** (headless, uncapped CPU interval): Medium black hole 9.8 ms / nebula 3.1 ms; Low 4.1 / 5.6 ms; High 4.2 / 7.9 ms.
- **Unity WebGL headed with vsync:** 60 fps locked in all 40 station x tier combinations (M2 validation).

## Caveats

- **vsync-locked numbers** show the display rate is held (headroom exists). They do not measure spare GPU time.
- **No GPU timer queries** are used. Browser GPU cost per pass is not reported.
- **Load figures** are from the dev server. A production build is smaller (minified, tree-shaken).
