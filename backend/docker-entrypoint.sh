#!/bin/sh
set -eu

DATA_DIR="$(dirname "${ATLAS_DB:-/data/atlas.sqlite3}")"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  # Volumes (Docker named volumes, Fly volumes) may be root-owned; give the app user write access, then drop root.
  chown -R atlas:atlas "$DATA_DIR"
  exec setpriv --reuid=atlas --regid=atlas --init-groups "$0" "$@"
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Single worker on purpose: SQLite writes are serialised by an in-process lock; sync endpoints run in a thread pool.
exec uvicorn app.main:app \
  --host "${HOST:-0.0.0.0}" \
  --port "${PORT:-8000}" \
  --log-level "$(echo "${LOG_LEVEL:-info}" | tr 'A-Z' 'a-z')" \
  --proxy-headers --forwarded-allow-ips '*' \
  --timeout-keep-alive 75 \
  --timeout-graceful-shutdown 20 \
  --no-server-header
