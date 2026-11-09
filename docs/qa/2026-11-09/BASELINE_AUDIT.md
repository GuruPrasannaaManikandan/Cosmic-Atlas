# Baseline Audit (2026-11-09)

## Repository

| Item | State at start of this QA pass |
|---|---|
| Remote | `origin` = github.com/GuruPrasannaaManikandan/Cosmic-Atlas (fetched) |
| `origin/main` | `c6657eb` (merge of PR #1). Unchanged; nothing was merged. |
| Open PR | #2 `feat/universal-realism-ui-travel` → `main` (foundation stabilisation), awaiting owner review |
| Working branch | `qa/chrome-full-audit`, created from `feat/universal-realism-ui-travel` @ `660e9e5`. It is stacked on PR #2 because the QA builds on that work. |
| Working tree | Clean, apart from the local `.claude/` launch configuration (untracked, not committed) |
| Render | `render.yaml`: two web services (`cosmic-atlas` frontend, `cosmic-atlas-api`), `autoDeployTrigger: commit`, no branch set (deploys from the default branch `main`), no preview environments. **Not modified.** |

## Machine and tools

| Item | Value |
|---|---|
| CPU / GPU / RAM | Intel Core Ultra 7 155H, Intel Arc integrated GPU, 15.6 GB RAM |
| OS | Windows 11 Home 10.0.26200 |
| Disk | A: 40 GB free of 49 GB |
| Browsers | **Google Chrome 156.0.8078.81** (QA browser) and Microsoft Edge 157.0.4341.42 (second browser), driven by Playwright (Python) with `channel=chrome` / `msedge` |
| Runtimes | Node 22.14.0, Python 3.13.9, .NET 10 SDK |
| Unity | 6000.3.28f1 (6.3 LTS), WebGL Build Support installed, URP 17.3.0, batch-mode CLI builds working. The repo is opened through the `A:\CA` junction because of MAX_PATH. |

## Local services

| Service | Command | Health |
|---|---|---|
| Backend (FastAPI) | `python -m uvicorn app.main:app --app-dir backend --port 8000` | `GET /api/health` → 200 |
| Frontend (Vite dev) | `npm --prefix frontend run dev` → port 5174 (5173 was taken) | `GET /` → 200. `/api` is proxied to :8000. |
| Unity WebGL | `python scripts/e2e/serve_unity_webgl.py --dir unity/CosmicAtlas/Builds/WebGL --port 8091` | Serves `.wasm` as `application/wasm`, no-store |

## Baseline results (before this pass's fixes)

| Check | Result |
|---|---|
| TypeScript / Vitest / Vite production build | Pass / 132 of 132 / pass. Bundles: index 440 kB (132 kB gzip), three.js vendor 823 kB (222 kB gzip). |
| Backend pytest | 12/12 |
| e2e: Travel / layout / app smoke / planet audit | 18/18 / 14/14 / 12/12 / pass |
| Unity EditMode / PlayMode (last run; no C# changed since) | 49/49 / 2/2 |
| Unity WebGL build | Exit 0, 81.2 MB uncompressed, Chromium bridge 10/10 |

## Defects found by the Chrome QA

See `VISUAL_DEFECT_REGISTER.md` (QA-1 to QA-6).

## Not present in the product (scope)

The brief's journeys G and H (Surface Explore of Moon/Mars/Titan, rover/artifact inspection) and section 8 (mission data) refer to features **that do not exist** in the frontend, backend or Unity project. The companion specification `Cosmic_Atlas_Mission_Archaeology_Master_Prompt.pdf` is **not on this machine**. These are reported as not implemented. The previous P0 instruction froze mission and rover work until the foundation passes, and PR #2 is still awaiting review.
