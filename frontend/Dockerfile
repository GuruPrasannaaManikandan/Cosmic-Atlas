# COSMIC ATLAS web - Vite production build served by unprivileged nginx, which also proxies /api to the API service.

# ---- build stage ----
FROM node:22.14-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Leave empty for the same-origin /api deployment. Only set it if the API is on another origin (public value, no secrets).
ARG VITE_API_BASE=
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build \
 && find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) \
      -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;

# ---- runtime stage ----
FROM nginxinc/nginx-unprivileged:1.28-alpine

# API_UPSTREAM is the container-to-container address of the API (never used by browser code).
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the image entrypoint export the container's DNS server as NGINX_LOCAL_RESOLVERS,
# so the API hostname is re-resolved at runtime (works for Docker's 127.0.0.11 and Fly's fdaa::3).
ENV API_UPSTREAM=http://api:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_CLIENT_MAX_BODY_SIZE=60m

COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html

# Fail the image build if the rendered configuration is invalid.
RUN NGINX_LOCAL_RESOLVERS=127.0.0.11 envsubst '${API_UPSTREAM} ${NGINX_LOCAL_RESOLVERS} ${NGINX_CLIENT_MAX_BODY_SIZE}' \
      < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf \
 && nginx -t \
 && rm /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
