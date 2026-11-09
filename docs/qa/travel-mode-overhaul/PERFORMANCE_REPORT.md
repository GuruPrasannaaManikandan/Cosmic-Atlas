# Performance report

**Conditions:** headed Chrome 156, 1920x1080, vsync, Balanced quality, Intel Arc iGPU (Core Ultra 7 155H, 15.6 GB). 7 scenarios x 30 s.

- **Every run:** median 16.70 ms, p95 16.80 ms, mean 16.65-16.78 ms in every scenario, and **0 long tasks**.
- **Occasional single dropped frames** (33 ms, up to about 2 % of frames; 14 % in one idle run) move between scenarios from run to run.
- **A/B test of the dock observer:**
  - ON: idle 99.1 % / 100 %, Saturn 99.9 % / 99.4 % of frames at 58 fps or more;
  - OFF: idle 100 % / 98.9 %, Saturn 100 % / 99.9 %.
  - **No measurable cost.** The drops are system noise on this laptop.
- **No added draw calls:** the HUD is DOM. The warp streaks are the existing 600-point layer, now camera-aligned.
- **Raw data:** `metrics/performance_balanced.json`, `perf.log`.
