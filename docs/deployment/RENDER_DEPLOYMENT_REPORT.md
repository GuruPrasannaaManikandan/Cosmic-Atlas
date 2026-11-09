# Render Deployment Report (2026-11-09)

**Status: RESOLVED (14:48:52 UTC).** Auto-deploy did not publish PR #9 (`b409f93`) or PR #10 (`b356968`). The owner ran a manual deploy of `main` from the Render dashboard. The live site now serves `main`'s exact build (`index-2v9BLBJf.js`) and passes 19/19 live checks (`DEPLOYMENT_VERIFICATION_REPORT.md`).

The rest of this report is the investigation as it stood before the manual deploy. The section "Auto-deploy after the fix" at the end records whether the next commit to `main` deployed by itself.

## Configuration audited (`render.yaml`, no changes made)

| Service | Type | Root | Build / start | Health | Auto-deploy | Branch |
|---|---|---|---|---|---|---|
| `cosmic-atlas` | Static site | `frontend` | `npm ci --no-audit --no-fund && npm run build` → `./dist`; `NODE_VERSION 22.14.0`; `/api/*` rewrites to the API | — | `autoDeployTrigger: commit` | none set, so it uses the repo default branch `main` |
| `cosmic-atlas-api` | Docker web service, free plan, Singapore | `backend` | `backend/Dockerfile` | `/api/health` | `autoDeployTrigger: commit` | none set, so `main` |

- **Branch:** both services deploy from `main`. No other branch is referenced, and only `main` now exists on GitHub.
- **Secrets:** `ANTHROPIC_API_KEY` is `sync: false`, held only in the dashboard. It was not read or exposed.
- **Persistent data:** the API filesystem is ephemeral (free plan, documented in `render.yaml`). There is no disk or database to protect.
- **Minor finding:** `render.yaml` sets `Cache-Control: no-cache` on `/index.html`, but `/` is served with `public, max-age=0, s-maxage=300`. The header rule matches the path `/index.html`, not `/`, so the CDN may serve HTML up to 5 minutes old after a deploy. This is harmless but worth knowing when you check a deploy. It was not changed, to avoid unrelated production edits.

## Evidence: which commit is live

A Vite build is content-hashed: building the same tree locally gives the same bundle file names Render produces.

| Commit | Merged (UTC) | Local build bundle | Served by Render? |
|---|---|---|---|
| `8504a14` / `8daa9e4` (PR #4) | 13:47 | `index-Bkzw5OKv.js`, `vendor-three-B0AfMsil.js`, `index-BEoNyWTm.css` | **Yes.** `last-modified: 13:51:10 UTC` (deployed about 3.5 min after the merge) |
| `b409f93` (PR #9, Travel overhaul) | 13:58 | `index-2v9BLBJf.js`, `vendor-three-DKcu54yN.js`, `index-DDEEF0IO.css` | **No** |
| `b356968` (PR #10, docs only, same frontend bundle as `b409f93`) | 14:26 | `index-2v9BLBJf.js` | **No.** Checked every 30 s from 14:26 to 14:42 (timeout), then again at 14:44 |

Checks at 14:44 UTC:
- `GET /assets/index-2v9BLBJf.js` → **404** (`cf-cache-status: BYPASS`, so this came from the origin, not a stale CDN copy). The new build is not on Render.
- `GET /` → `index-Bkzw5OKv.js`, `last-modified: 13:51:10 UTC`, `s-maxage=300`. CDN caching is at most 5 minutes, so it can't explain a gap of 46 minutes or more.
- `GET /api/health` → 200 `{"status":"ok",...}` after a 23 s cold start (free plan spin-down). The backend code is unchanged since PR #1, so the API is up to date whether or not it redeployed.
- **GitHub:** no deployment records and no commit statuses or checks from Render on `b409f93` or `b356968`. There's nothing to confirm a deploy was ever triggered.
- **Build-relevant changes between the live commit and `main`:** none in `package.json`, `package-lock.json`, `vite.config.ts`, `render.yaml` or `backend/`. Only source files and docs changed. `main` builds locally with the exact Render command (`tsc --noEmit && vite build`, exit 0). A build failure on Render is therefore unlikely, but it can only be confirmed in the dashboard.

## Diagnosis

Auto-deploy worked for PR #4 at 13:47, then stopped for the next two pushes to `main`. Possible causes, which only the dashboard can tell apart:

1. **Auto-deploy is off on the `cosmic-atlas` service.** Dashboard settings override `render.yaml` unless the Blueprint is re-synced. The PR #4 deploy may have been a manual one.
2. **The deploy was queued or cancelled.** For example, the free plan's build-minute limit was reached, or a newer push cancelled a queued build.
3. **The build failed on Render**, for a reason not reproducible locally.
4. **The GitHub → Render webhook was not delivered.**

The Render dashboard couldn't be inspected from this session: the in-app browser returned "Policy check temporarily unavailable" on `dashboard.render.com`. There is no Render API key, and none was requested.

## What to do (owner, Render dashboard)

1. Open **cosmic-atlas → Events**. Find the latest deploy and its commit. If a deploy for `b409f93` or `b356968` failed, open its log.
2. **Manual Deploy → Deploy latest commit** (`main` @ `b356968`). Do the same for `cosmic-atlas-api` if it also shows an old commit. Its code is unchanged, so this is optional.
3. **Settings → Build & Deploy:** confirm **Branch = `main`** and **Auto-Deploy = On Commit**.
4. **Verify the deploy:**
   - `curl -s https://cosmic-atlas-jk2e.onrender.com/ | grep -o 'assets/index-[^"]*\.js'` must print `assets/index-2v9BLBJf.js`. Allow up to 5 minutes for the CDN.
   - Then run `python scripts/e2e/live_site_check.py --base https://cosmic-atlas-jk2e.onrender.com --out docs/qa/deployment`.

## Auto-deploy after the fix

The merge of this report's PR (#11, docs only) is the test. If auto-deploy works, `last-modified` on `/` moves past 14:48:52 UTC within a few minutes, while the bundle stays `index-2v9BLBJf.js` (no frontend change). The result is recorded in the PR #11 conversation and in the final hand-off.
