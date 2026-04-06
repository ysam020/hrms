# Getting Started

## Prerequisites

| Tool                             | Version    | Notes                                        |
| -------------------------------- | ---------- | -------------------------------------------- |
| Node.js                          | ≥ 18       |                                              |
| pnpm                             | 8.15.6     | Set by `packageManager` field — use corepack |
| Docker + Docker Compose          | Any recent | For containerized local dev                  |
| `protoc` + `protoc-gen-ts_proto` | Any recent | For regenerating gRPC types                  |
| OpenSSL                          | Any        | For generating local SSL certificates        |

### Install pnpm via corepack

```bash
corepack enable
corepack prepare pnpm@8.15.6 --activate
```

### Install protoc (macOS)

```bash
brew install protobuf
npm install -g ts-proto   # protoc-gen-ts_proto plugin
```

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd hrms
pnpm install
```

`pnpm install` automatically runs `pnpm db:generate` (Prisma client generation) via the `postinstall` hook.

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values. Required variables:

| Variable                   | Purpose                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `MONGO_URI`                | MongoDB connection string                                                   |
| `REDIS_HOST`               | Redis hostname                                                              |
| `REDIS_PORT`               | Redis port (default `6379`)                                                 |
| `JWT_SECRET_ACCESS`        | Access token signing key                                                    |
| `JWT_SECRET_REFRESH`       | Refresh token signing key                                                   |
| `GOOGLE_CLIENT_ID`         | Google OAuth client ID                                                      |
| `GOOGLE_CLIENT_SECRET`     | Google OAuth client secret                                                  |
| `GOOGLE_CALLBACK_URL`      | OAuth redirect URI (e.g. `https://localhost:9002/api/auth/google/callback`) |
| `FIREBASE_SERVICE_ACCOUNT` | FCM service account JSON (stringified)                                      |
| `AWS_ACCESS_KEY_ID`        | S3 / Secrets Manager                                                        |
| `AWS_SECRET_ACCESS_KEY`    | S3 / Secrets Manager                                                        |
| `AWS_REGION`               | AWS region                                                                  |
| `CSRF_SECRET`              | CSRF protection secret (random string)                                      |
| `CLIENT_URL`               | Frontend origin(s), comma-separated                                         |
| `API_GATEWAY_PORT`         | Gateway port (default `9002`)                                               |
| `NODE_ENV`                 | `development` or `production`                                               |

### 3. Generate Protobuf types

```bash
pnpm proto:gen
```

Runs `protoc` against all `.proto` files in `packages/proto-definitions/src/proto/` and outputs TypeScript bindings to `packages/proto-definitions/src/generated/`. Must be re-run whenever a `.proto` file changes.

### 4. SSL certificates for local HTTPS

Both the API gateway and the Vite dev server run on HTTPS locally. Place certificates in `packages/certificates/`:

```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout packages/certificates/key.pem \
  -out  packages/certificates/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

### 5. One-shot bootstrap

```bash
pnpm setup:project   # proto:gen → db:generate → build
```

---

## Running in development

```bash
pnpm dev
```

Turborepo starts all services and the frontend concurrently (up to 25 tasks in parallel) and streams logs via its TUI.

| Service        | URL                                                       |
| -------------- | --------------------------------------------------------- |
| React frontend | `https://localhost:5173`                                  |
| API gateway    | `https://localhost:9002`                                  |
| Swagger UI     | `https://localhost:9002/api-docs`                         |
| Prisma Studio  | `http://localhost:5555` (run `pnpm db:studio` separately) |

### Service ports (gRPC — internal only)

| Service              | Port  |
| -------------------- | ----- |
| auth-service         | 50051 |
| user-service         | 50052 |
| employee-service     | 50053 |
| attendance-service   | 50054 |
| leave-service        | 50055 |
| recruitment-service  | 50056 |
| hrm-service          | 50057 |
| salary-service       | 50058 |
| analytics-service    | 50059 |
| notification-service | 50060 |

---

## Command reference

```bash
# Install dependencies
pnpm install

# Start all services (dev mode)
pnpm dev

# Build everything
pnpm build

# Analyze frontend bundle size
cd apps/web && pnpm analyze

# Format all files (Prettier + ESLint --fix)
pnpm format

# Lint all packages
pnpm lint

# Regenerate Protobuf TypeScript types
pnpm proto:gen

# Prisma: apply schema changes (no migration file)
pnpm db:push

# Prisma: run migrations
pnpm db:migrate

# Prisma: open visual data browser
pnpm db:studio

# Prisma: seed sample data
pnpm db:seed

# Full rebuild from scratch
pnpm setup:project
```

---

## Running with Docker

### Full stack (recommended for first run)

```bash
docker compose -f docker-compose.local.yml up
```

Starts all services plus MongoDB and Redis containers.

### Services only (use external infra)

```bash
docker compose -f docker-compose.dev.yml up
```

### Build images (CI)

```bash
docker compose -f docker-compose.ci.yml build
```

See [Deployment](Deployment) for production Docker usage.

---

## Troubleshooting

**`protoc: command not found`**
Install Protocol Buffers: `brew install protobuf` (macOS) or download from the [GitHub releases](https://github.com/protocolbuffers/protobuf/releases).

**`ECONNREFUSED` on startup**
Make sure MongoDB and Redis are running. Use `docker compose -f docker-compose.local.yml up mongo redis` to start only the infra.

**`SSL certificate error` in browser**
Accept the self-signed certificate in your browser, or add it to your system's trusted certificates.

**Prisma client not found**
Run `pnpm db:generate` to regenerate the Prisma client after schema changes.

**gRPC connection errors between services**
Verify that the port environment variables match what each service binds to. All services must be running for the gateway to function.
