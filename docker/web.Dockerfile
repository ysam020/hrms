FROM node:20-alpine AS slim
# Alpine's CDN mirror occasionally drops the TLS handshake mid-build — retry a
# few times before giving up.
RUN set -e; \
    for i in 1 2 3 4 5; do \
      if apk update && apk add --no-cache libc6-compat; then \
        exit 0; \
      fi; \
      echo "apk failed (attempt $i/5), retrying in 5s..."; \
      sleep 5; \
    done; \
    echo "apk failed after 5 attempts" >&2; \
    exit 1

FROM slim AS base
RUN npm install -g pnpm@8.15.6
RUN pnpm config set store-dir /root/.pnpm-store && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm config set fetch-timeout 300000

FROM base AS builder
WORKDIR /app

# The web app (apps/web) is self-contained: no workspace packages, no
# secrets, no Prisma client. Copy the workspace and install against the
# committed lockfile (frozen, so CI and local builds match). Only
# apps/web/dist reaches the runner stage.
COPY . .

RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

# Same-origin API (nginx proxies /api and /socket.io to api-gateway). No
# secrets are needed: the build reads no other VITE_* value.
ARG VITE_API_STRING=/api/v1
ENV VITE_API_STRING=$VITE_API_STRING

RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
# TLS, /api + /socket.io proxy to the gateway, SPA fallback, and no-cache
# headers for index.html and the service worker.
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
