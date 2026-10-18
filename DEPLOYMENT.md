# COSMIC ATLAS — Deployment Guide

## Current deployment

| | URL |
|---|---|
| Website | https://cosmic-atlas-jk2e.onrender.com |
| API (via the website, same origin) | https://cosmic-atlas-jk2e.onrender.com/api/ |
| Health / readiness | `/api/health` · `/api/ready` |
| API service direct URL (diagnostics only) | https://cosmic-atlas-api.onrender.com/api/health |

Render Blueprint `cosmic-atlas` created from the **public** repo URL
`https://github.com/GuruPrasannaaManikandan/Cosmic-Atlas`, branch `main`. Because GitHub isn't connected to the
Render workspace, **pushes do not auto-deploy**. Use *Manual Deploy* (see Redeploy), or connect GitHub in Render
(Account Settings → Git providers) to enable auto-deploy and Blueprint auto-sync.

The workspace's 750 free instance-hours/month are shared with every other free web service in it (e.g. `OceanGuard`).

## Architecture

### Production (Render, free plan)

```
Browser ──HTTPS──▶ cosmic-atlas            Render Static Site (global CDN, always on)
                     ├─ /            → Vite production build (frontend/dist)
                     └─ /api/*       → rewrite ──HTTPS──▶ cosmic-atlas-api   Render web service (Docker, free)
                                                           └─ FastAPI/uvicorn (backend/Dockerfile)
                                                               ├─ SQLite at /data/atlas.sqlite3 (EPHEMERAL on free plan)
                                                               └─ SIMBAD (CDS) · JPL Horizons · optional Anthropic API
```

* The browser only ever talks to one origin: `https://cosmic-atlas-jk2e.onrender.com`, with the API at `/api/...`.
  No browser request goes to `localhost` or to an internal hostname. CORS is not needed, but the API also allows
  exactly the static-site origin as a fallback (`ATLAS_CORS_ORIGINS`).
* Defined as code in [`render.yaml`](render.yaml) (Render Blueprint). Pushing to the connected branch redeploys both services.

### Self-hosted / production-like (Docker Compose)

```
Browser ──▶ web  (nginx-unprivileged :8080)  static SPA + /api proxy, gzip, cache headers, SPA fallback, JSON 503 if API down
              └─▶ api (FastAPI :8000, not published)  ──▶ named volume atlas-data → /data/atlas.sqlite3 (persistent)
```

Use this on any VPS or machine with Docker; put a TLS terminator (Caddy, Traefik, a cloud load balancer) in front for HTTPS.

## Free-plan limitations (accepted when choosing Render free)

| Limitation | Effect on COSMIC ATLAS |
|---|---|
| API spins down after 15 min without traffic; ~1 min cold start | The 3D explorer, FIND HOME, Travel, Events, Academy and audio run entirely in the browser and are unaffected. The page pings `/api/health` on load so the API wakes while you explore; the first SIMBAD/Horizons/upload call after idle can take up to a minute. |
| Ephemeral filesystem, no disks | Uploaded datasets, saved mapping profiles and the catalogue cache are **lost on every restart, redeploy or spin-down**. A dataset is usable for the session in which it was uploaded. |
| 512 MB RAM / 0.1 CPU | Fine for the sample dataset; very large uploads (tens of MB) are slow. |
| 750 free instance-hours / month | One always-awake service uses ~744 h, so the quota is enough. |

**To make data persistent:** in the Render dashboard switch `cosmic-atlas-api` to a paid instance (Starter) and add
a Disk mounted at `/data` (1 GB is plenty). `ATLAS_DB` already points to `/data/atlas.sqlite3`; no code changes are needed.

## Environment variables

| Variable | Where | Default | Notes |
|---|---|---|---|
| `ATLAS_DB` | API | `/data/atlas.sqlite3` (image) | SQLite path; its directory is created and chowned on start. |
| `LOG_LEVEL` | API | `info` | `debug`/`info`/`warning`/`error`. |
| `ATLAS_CORS_ORIGINS` | API | dev origins | Comma-separated exact origins. Never `*`. |
| `ANTHROPIC_API_KEY` | API (**secret**) | unset | Optional LLM hints for unmapped columns. Set in Render dashboard → Environment, never in files. |
| `ANTHROPIC_MODEL` | API | `claude-haiku-5-5` | |
| `PORT` / `HOST` | API | `8000` / `0.0.0.0` | Respected if the platform injects `PORT`. |
| `VITE_API_BASE` | frontend **build** | empty | Empty = same-origin `/api`. Only set for a split-origin deployment (then also set `ATLAS_CORS_ORIGINS`). Embedded in public JS — never a secret. |
| `API_UPSTREAM` | web container | `http://api:8000` | Container-to-container address used by nginx only. |
| `NGINX_CLIENT_MAX_BODY_SIZE` | web container | `60m` | 40 MB upload limit × base64 overhead. |
| `WEB_PORT` | compose | `8080` | Host port. |

Copy [`.env.example`](.env.example) to `.env` for Compose. `.env` is git-ignored.

## Run locally

Development (unchanged): `uvicorn app.main:app --port 8000` in `backend/`, `npm run dev` in `frontend/` (Vite proxies `/api`).

Production-like with Docker:

```bash
docker compose up --build -d
docker compose ps                     # both services should become "healthy"
python scripts/smoke_test_deployment.py http://localhost:8080
```

Production bundle without Docker: `npm run build` then `npx vite preview` (proxies `/api` to `127.0.0.1:8000`).

## Health checks

* `GET /api/health` — liveness (process up; lists connectors and optional formats). Used by Render and the image HEALTHCHECK.
* `GET /api/ready` — readiness (database reachable; 503 otherwise). Used by the Compose health check. External
  catalogues are deliberately not part of either check.
* `GET /healthz` — nginx liveness in the web container.

Diagnosing failures:

```bash
docker compose ps
docker compose logs -f api            # startup line shows the DB path, CORS origins and whether LLM mapping is enabled
docker compose logs -f web
docker inspect --format '{{json .State.Health}}' cosmic-atlas-api-1
```

On Render: service → **Logs** / **Events**. A failing health check usually means the container crashed on start
(see the first log lines) or is still cold-starting.

## Persistence and backups (Compose / paid disk)

```bash
# backup (consistent copy via SQLite's online backup)
docker compose exec api python -c "import sqlite3; s=sqlite3.connect('/data/atlas.sqlite3'); d=sqlite3.connect('/data/backup.sqlite3'); s.backup(d)"
docker compose cp api:/data/backup.sqlite3 ./atlas-backup-$(date +%F).sqlite3
# restore: stop api, copy the file back to /data/atlas.sqlite3, start api
```

`docker compose down` keeps the `atlas-data` volume; only `docker compose down -v` deletes it.

## Redeploy

* **Render:** `git push origin main`, then in the dashboard open each changed service → *Manual Deploy* →
  *Deploy latest commit* (`cosmic-atlas-api` for backend changes, `cosmic-atlas` for frontend changes).
  For `render.yaml` changes, open Blueprints → `cosmic-atlas` → *Manual Sync*. If GitHub is connected to Render,
  pushes deploy both services automatically.
* **Compose:** `docker compose up --build -d`.

Verify after every deploy:

```bash
python scripts/smoke_test_deployment.py https://cosmic-atlas-jk2e.onrender.com
```

## External services

| Service | Used for | Auth | Failure behaviour |
|---|---|---|---|
| CDS SIMBAD (name resolver + TAP) | live object search | none | JSON 502 with a reason; 3D scene unaffected; 24 h cache |
| NASA/JPL Horizons API | “compare with JPL Horizons” | none | JSON 502; 7 day cache |
| Anthropic Messages API | optional column-mapping hints | `ANTHROPIC_API_KEY` | falls back to deterministic mapping |
