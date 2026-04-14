ARG APP_DIR=api-gateway
ARG PROJECT=api-gateway
ARG PORT=9002

FROM node:20-alpine AS slim
RUN apk update
RUN apk add --no-cache libc6-compat
RUN apk add --no-cache openssl

FROM slim AS base
RUN npm install pnpm turbo --global
RUN pnpm config set store-dir ~/.pnpm-store

FROM base AS pruner
ARG PROJECT

WORKDIR /app
COPY . .
RUN turbo prune --scope=${PROJECT} --docker

# setting up the build getting all the required external dependencies
FROM base AS builder
ARG PROJECT

WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm install --no-frozen-lockfile

COPY --from=pruner /app/out/full/ .

RUN pnpm proto:gen
RUN pnpm db:generate
RUN turbo build --filter=${PROJECT}
RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm prune --prod --no-optional
RUN rm -rf ./**/*/src

FROM base AS runner
ARG APP_DIR
ARG PORT

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs

WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app .
WORKDIR /app/apps/${APP_DIR}

EXPOSE ${PORT}
CMD [ "pnpm", "start:prod" ]
