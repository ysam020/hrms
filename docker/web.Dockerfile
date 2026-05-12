FROM node:20-alpine AS slim
RUN apk update && apk add --no-cache libc6-compat

FROM slim AS base
RUN npm install -g pnpm turbo
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

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    pnpm install --no-frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

RUN pnpm db:generate

RUN --mount=type=secret,id=aws_credentials,target=/root/.aws/credentials \
    --mount=type=secret,id=aws_config,target=/root/.aws/config \
    turbo build --filter=web --force

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
