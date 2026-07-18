FROM node:20-alpine AS slim
# Alpine's CDN mirror occasionally drops the TLS handshake mid-build in CI —
# retry a few times before giving up, rather than failing the whole image
# build on one transient network blip. Exits non-zero if every attempt
# fails, so a genuine persistent failure still fails the build loudly.
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
RUN npm install -g pnpm@8.15.6 turbo@2.10.5
RUN pnpm config set store-dir /root/.pnpm-store
RUN pnpm config set fetch-retries 5
RUN pnpm config set fetch-retry-mintimeout 20000
RUN pnpm config set fetch-retry-maxtimeout 120000
RUN pnpm config set fetch-timeout 300000

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=web --docker

FROM base AS builder
WORKDIR /app

# Override API URL so the bundle proxies through nginx, not the raw gateway port.
# Must be set before secrets load (loadSecrets skips already-set env vars).
ENV VITE_API_STRING=/api/v1
ENV VITE_SERVER_URL=

# Install against the FULL workspace's package.json files (from the pruner
# stage's unpruned checkout), not turbo prune's out/json subset: turbo@2.10.5's
# prune has a confirmed bug where a package that's a pure leaf (no
# dependencies of its own — e.g. ua-parser-js's detect-europe-js/
# is-standalone-pwa/ua-is-frozen) is referenced by its dependent but its own
# resolution entry is silently dropped from the pruned pnpm-lock.yaml, so
# --frozen-lockfile fails with ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY even
# though the real lockfile is completely consistent — reproduced against a
# genuinely cold, isolated pnpm store, so this isn't a caching artifact.
# Installing against the full graph is exactly what already works at the
# real repo root; it costs a slightly heavier builder-stage install (more
# packages than web strictly needs), which doesn't affect the final image —
# only apps/web/dist is copied into the nginx runner stage below. Source is
# still swapped to turbo's correctly-pruned out/full/ afterward, so the
# actual `turbo build` step stays scoped to just web.
COPY --from=pruner /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/package.json ./package.json
COPY --from=pruner /app/apps ./apps
COPY --from=pruner /app/packages ./packages

RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

RUN pnpm db:generate

RUN --mount=type=secret,id=aws_credentials,target=/root/.aws/credentials \
    --mount=type=secret,id=aws_config,target=/root/.aws/config \
    turbo build --filter=web --force

# Pinned (not the floating `alpine` tag) for reproducible builds — an
# automatic base-image update landing between builds shouldn't be able to
# change what ships to prod without that change going through review.
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
