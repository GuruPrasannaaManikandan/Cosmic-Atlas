# Build and Test Report — Stage 2

**Date:** 2026-11-10.
**Code under test:** `main` at `b6357b1`. That includes the PR #12 merge (`ff0d57c`) and the build fix `f2ba9f0`.
**Scope:** no application code was changed for these runs.

## Results

| Suite | Command | Result | Run by / when |
|---|---|---|---|
| TypeScript and production build | `npm --prefix frontend run build` (`tsc --noEmit && vite build`) | **PASS**, exit 0. It emits `index-CqKaTsR9.js` (376.94 kB, 113.61 kB gzip). The only warning is the size of the `vendor-three` chunk (1,052 kB) | this session |
| Frontend unit tests | `npx vitest run` | **PASS: 226 / 226** in 23 files | this session |
| Backend tests | `python -m pytest backend/tests -q` | **PASS: 12 / 12** | this session |
| Unity EditMode | `Unity.exe -batchmode -nographics -runTests -testPlatform EditMode` | **PASS: 52 / 52**, including `MarsTimeTests` 3 / 3. Results are in `unity_EditMode_results.xml` and the log in `unity/CosmicAtlas/Builds/logs/editmode_tests.log` (git-ignored) | this session |
| Unity PlayMode | — | **NOT RUN.** The only PlayMode suite is `ShowcasePlayModeTests` (the M2 space showcase), and there are no Mars PlayMode tests | — |
| Unity WebGL build (Mars) | `MarsPrototypeBuild` (editor script) | **Success**: 0 errors, 22 warnings, 92,891,197 bytes, 10 min 54 s (`Builds/logs/mars_build_1.log`) | previous session, 2026-11-10 09:11. Not rebuilt; the benchmarks tested this build |
| Mars benchmark: headless, headed, headed uncapped | `scripts/e2e/mars_prototype_benchmark.py` | **All gates PASS** (`MARS_PROTOTYPE_GATE_REPORT.md`) | this session |
| Python scripts compile | `python -m py_compile` | PASS according to the Gemini audit | **not re-run here** |
| Live site | `curl https://cosmic-atlas-jk2e.onrender.com/` | It serves `index-CqKaTsR9.js`, the same bundle as the local build of `main`. The Render deploy has happened since `FINAL_RELEASE_REPORT.md` was written | this session |

## The production build failure reported by Gemini

- **Cause:** `tsc --noEmit`, the first half of `npm run build`, failed with two type errors. Vite itself never failed.
  1. `src/input/appInput.ts:22`: `Property 'driving' does not exist on type 'SurfaceUI'`.
  2. `src/surface/vehicle.test.ts:66`: the inline ground object was typed `{ heightAt: () => number }`, so it rejected `(_x, z) => …`.
- **Fix:** `f2ba9f0` added `driving?: boolean` to `SurfaceUI` and typed the test's ground object as `Ground`. That commit is merged.
- **Status:** **resolved.** The build passes on `main` today.
- **What remains:** nothing sets `driving` to `true` yet. The input manager that reads it isn't installed in the app (see `docs/space-exploration/controls/CONTROLS_AUDIT.md`).

## Unity build warnings (22)

| Count | Warning | Shader | In Mars scope? |
|---|---|---|---|
| 16 | `pow(f, e) will not work for negative f` | `CosmicAtlas/BlackHole` | no (M2 showcase) |
| 4 | same | `CosmicAtlas/StarGlow` | no |
| 2 | same | `CosmicAtlas/MarsSky` | **yes**. Harmless if the base can never be negative; clamp it with `max(f, 0)` when the shader is next edited |

The log also prints two `#warning` lines from Unity's own `lib_webgpu.js` about older Firefox versions. They are not counted in the 22.

## Side effects of the test runs

- Unity batch mode touched `unity/CosmicAtlas/ProjectSettings/ShaderGraphSettings.asset`. `git diff` shows **no content change**, only a different line ending. It does not need committing.
- The benchmark runs overwrote the nine `*.png` screenshots in this folder with captures from the headed, uncapped run.
