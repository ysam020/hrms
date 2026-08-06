ARG APP_DIR=api-gateway
ARG PROJECT=api-gateway
ARG PORT=9002

FROM node:20-alpine AS runtime-base
# Alpine's CDN mirror occasionally drops the TLS handshake mid-build in CI —
# retry a few times before giving up, rather than failing the whole image
# build on one transient network blip. Exits non-zero if every attempt
# fails, so a genuine persistent failure still fails the build loudly.
RUN set -e; \
    for i in 1 2 3 4 5; do \
      if apk update && apk add --no-cache libc6-compat openssl; then \
        exit 0; \
      fi; \
      echo "apk failed (attempt $i/5), retrying in 5s..."; \
      sleep 5; \
    done; \
    echo "apk failed after 5 attempts" >&2; \
    exit 1

# protobuf/protobuf-dev provide `protoc`, needed only to generate TS from
# .proto files during the build (ts-proto, via packages/proto-definitions).
# At runtime services load .proto files through @grpc/proto-loader (pure
# JS), so this layer is kept off the runner stage to trim the shipped image.
FROM runtime-base AS build-base
RUN set -e; \
    for i in 1 2 3 4 5; do \
      if apk update && apk add --no-cache protobuf protobuf-dev; then \
        exit 0; \
      fi; \
      echo "apk failed (attempt $i/5), retrying in 5s..."; \
      sleep 5; \
    done; \
    echo "apk failed after 5 attempts" >&2; \
    exit 1

FROM build-base AS base
RUN npm install -g pnpm@8.15.6 turbo@2.10.5
RUN pnpm config set store-dir /root/.pnpm-store && \
    pnpm config set manage-package-manager-versions false && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm config set fetch-timeout 300000

FROM base AS pruner
ARG PROJECT
WORKDIR /app
COPY . .
RUN turbo prune --scope=${PROJECT} --docker

FROM base AS builder
ARG PROJECT
WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

COPY --from=pruner /app/out/full/ .

RUN pnpm proto:gen
RUN PATH="/app/node_modules/.bin:$PATH" pnpm db:generate
RUN turbo build --filter=${PROJECT}
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store pnpm prune --prod --no-optional --ignore-scripts
RUN find . -path "*/src" -type d \
    ! -path "./node_modules/*" \
    ! -path "./.pnpm/*" \
    ! -path "./packages/certificates/*" \
    -exec rm -rf {} + 2>/dev/null || true

FROM runtime-base AS runner
ARG APP_DIR
ARG PORT

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
ENV AWS_SHARED_CREDENTIALS_FILE=/app/.aws/credentials
ENV AWS_CONFIG_FILE=/app/.aws/config
# Interview/attendance times are stored as naive "YYYYMMDDTHHmmss" strings
# with no timezone marker (see recruitment-service's parseInterviewTime) —
# every comparison against the server's own clock only lines up if the
# container's local time matches the tenant's. node:20-alpine defaults to
# UTC otherwise, which silently shifts every such deadline by the offset.
ENV TZ=Asia/Kolkata
USER nodejs

WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app .
WORKDIR /app/apps/${APP_DIR}

EXPOSE ${PORT}
CMD ["node", "dist/bootstrap.js"]
