# COSMIC ATLAS API - FastAPI on uvicorn.
FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ATLAS_DB=/data/atlas.sqlite3 \
    HOST=0.0.0.0 \
    PORT=8000 \
    LOG_LEVEL=info

WORKDIR /app

RUN groupadd --system --gid 10001 atlas \
 && useradd --system --uid 10001 --gid atlas --home-dir /app --shell /usr/sbin/nologin atlas \
 && mkdir -p /data && chown atlas:atlas /data

COPY requirements.lock ./
RUN pip install --only-binary=:all: -r requirements.lock

COPY app ./app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh && python -m compileall -q app

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4)" || exit 1

# The entrypoint fixes /data ownership (mounted volumes arrive root-owned) and then drops to the non-root 'atlas' user.
ENTRYPOINT ["docker-entrypoint.sh"]
