FROM node:20-alpine AS slim
RUN apk update && apk add --no-cache libc6-compat

FROM slim AS base
RUN npm install -g pnpm turbo
RUN pnpm config set store-dir /root/.pnpm-store

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=web --docker

FROM base AS builder
WORKDIR /app

# Override API URL so the bundle proxies through nginx, not the raw gateway port.
# Must be set before secrets load (loadSecrets skips already-set env vars).
ENV VITE_API_STRING=/api

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    pnpm install --no-frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

RUN pnpm db:generate

RUN --mount=type=secret,id=aws_credentials,target=/root/.aws/credentials \
    --mount=type=secret,id=aws_config,target=/root/.aws/config \
    turbo build --filter=web

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
