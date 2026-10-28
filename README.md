# HRMS — Human Resource Management System

A production-grade, multi-tenant HRMS built as a **pnpm monorepo**. The backend is a **microservices architecture** communicating over gRPC, fronted by a single Express API gateway. The frontend is a React 18 SPA with offline-first capabilities, served by nginx.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Multi-Tenancy](#multi-tenancy)
- [Tech Stack](#tech-stack)
- [AI Features](#ai-features)
- [Security](#security)
- [Billing & Subscriptions](#billing--subscriptions)
- [Observability](#observability)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development](#development)
- [Building for Production](#building-for-production)
- [Docker](#docker)
- [Git Conventions](#git-conventions)

---

## Overview

HRMS covers the full lifecycle of an employee — from onboarding (KYC, biometric registration) through daily operations to offboarding (resignation, exit feedback). It is a **multi-tenant SaaS platform** where each organisation (tenant) operates in complete data isolation.

**Functional areas:**

| Domain                  | Capabilities                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| **Employee management** | Profiles, KYC, org tree, designations, document storage             |
| **Attendance**          | Check-in/out, geofencing, corrections, half-day logic, reports      |
| **Leave**               | Apply, approve/reject, leave balances, custom leave types           |
| **Payroll**             | Salary structures, components, payslips, PDF generation             |
| **Recruitment**         | Job openings, applications, AI resume scoring, interview scheduling |
| **HR activities**       | Appraisals, feedback, announcements, calendar events                |
| **Policies**            | Document management, PDF download                                   |
| **Business rules**      | Visual rule builder, condition/action engine, scheduled execution   |
| **Analytics**           | Workforce, attendance, salary, recruitment dashboards               |
| **Chat**                | Peer-to-peer messaging, file sharing, offline message queue         |
| **Notifications**       | Real-time push (FCM) and in-app (Socket.IO)                         |
| **Permissions**         | Role-based access control, teams, superuser elevation               |
| **Tenant settings**     | Per-org leave policy, attendance rules, geofencing, HR defaults     |
| **Audit logs**          | Tamper-evident trail for all data mutations                         |
| **AI Assistants (MCP)** | Connect an MCP-capable AI assistant to your own HR data             |
| **AI Insights**         | Per-module streaming analysis via Ollama                            |
| **Security**            | Login risk scoring, impossible-travel detection, anomaly alerts     |
| **Billing**             | Razorpay subscription management, grace periods, webhooks           |

---

## Architecture

```
                             ┌──────────────────────────┐
                             │      React 18 (web)       │
                             │  Vite · MUI · PrimeReact  │
                             │  PWA · IndexedDB · WebAssembly│
                             └───────────┬──────────────┘
                                         │ HTTPS / REST + SSE + Socket.IO
                                         │
                             ┌───────────▼──────────────┐
                             │       API Gateway         │
                             │  Express · JWT · CSRF     │
                             │  Socket.IO · Rate-limit   │
                             │  Audit Log · Swagger      │
                             └───────────┬──────────────┘
                                         │
                   gRPC (protobuf) over mTLS
          ┌──────────────────────────────┼──────────────────────────────┐
          │          │          │         │         │          │         │
      ┌───▼───┐ ┌────▼──┐ ┌────▼──┐ ┌───▼───┐ ┌───▼───┐ ┌───▼────┐ ┌──▼───────┐
      │ auth  │ │ user  │ │ empl. │ │ leave │ │salary │ │ recruit│ │analytics │
      └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └────────┘ └──────────┘
          │          │          │         │         │          │
      ┌───▼───┐ ┌────▼──┐ ┌────▼──┐ ┌───▼───┐ ┌───▼───────────────────────┐
      │attend.│ │  hrm  │ │notif. │ │sched. │ │       BullMQ workers       │
      └───────┘ └───────┘ └───────┘ └───────┘ │  resumeParser · scheduler │
                                               └───────────────────────────┘

      ┌──────────────────────────────────────────────────────────────────────┐
      │                       Shared Data Layer                               │
      │                                                                      │
      │   ┌─────────────────────────────────────────────────────────────┐   │
      │   │   MongoDB — Database-per-tenant (Silo Model)                 │   │
      │   │   • master DB: users, tenants, memberships, invites          │   │
      │   │   • hrms-<slug> DB per org: all business data                │   │
      │   └─────────────────────────────────────────────────────────────┘   │
      │                                                                      │
      │   Redis (ioredis)            Firebase (FCM)     Ollama (local LLM)   │
      │   L2 cache · BullMQ queue    Push notifications  qwen2.5-coder:14b   │
      │   Razorpay plan-ID cache     Device tokens                           │
      └──────────────────────────────────────────────────────────────────────┘

      ┌──────────────────────────────────────────────────────────────────────┐
      │                         Observability                                 │
      │   Prometheus · Grafana · Loki · Winston (JSON) · AWS CloudWatch      │
      └──────────────────────────────────────────────────────────────────────┘
```

### Key architectural decisions

**Microservices over gRPC**
Each business domain is an independent Node.js service with its own gRPC server. The API gateway is the sole public-facing process — all inter-service calls are gRPC, never directly exposed to the internet. Proto definitions live in `packages/proto-definitions` and are compiled to TypeScript at build time.

**Database-per-tenant isolation (Silo model)**
Every organisation gets its own MongoDB database (`hrms-<slug>`). A Prisma connection pool (`tenantClientPool`) maintains live `PrismaClient` instances keyed by database name. The `prismaWithTenant` proxy uses Node.js `AsyncLocalStorage` to route each query to the correct database transparently — handlers never manage connections themselves. See [Multi-Tenancy](#multi-tenancy).

**Single API gateway**
Handles JWT verification, CSRF, request routing, rate limiting, WebSocket upgrades, audit logging, Swagger documentation, and subscription enforcement. No microservice is reachable without going through the gateway.

**Two-tier cache**
Every cache read checks an in-process LRU cache (max 1,000 entries) before hitting Redis. Cache writes populate both tiers. Entity-specific TTLs range from 5 minutes (notifications) to 24 hours (holidays). Redis failures fall back to memory-only gracefully.

**Turborepo build graph**
`pnpm build` compiles all 20+ packages in topological order. Turborepo's remote cache means unchanged packages are never rebuilt in CI.

**Shared packages**
Cross-cutting concerns are extracted into workspace packages — no logic is duplicated across services:

| Package             | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `@hrms/db`          | Prisma client, `prismaWithTenant` proxy, tenant connection pool |
| `@hrms/proto`       | Protobuf definitions + generated TypeScript types               |
| `@hrms/cache`       | Two-tier cache (LRU memory + Redis), entity-TTL strategy        |
| `@hrms/queue`       | BullMQ connection factory + job type definitions                |
| `@hrms/crypto`      | AES-256 encryption for sensitive fields                         |
| `@hrms/logger`      | Winston logger + `prom-client` metrics sidecar                  |
| `@hrms/common`      | API response helpers (`apiResponse`), status codes              |
| `@hrms/grpc-client` | gRPC channel factory + `grpcCall` helper                        |
| `@hrms/grpc-server` | `BaseGrpcServer` bootstrap class                                |
| `@hrms/websocket`   | Socket.IO config shared by gateway                              |
| `@hrms/firebase`    | FCM push notification helpers                                   |
| `@hrms/schemas`     | Zod validation schemas (shared server + client)                 |

---

## Multi-Tenancy

The system uses a **database-per-tenant silo model**. Each organisation's business data lives in an isolated MongoDB database. The platform master database holds cross-tenant identity data only.

### Database layout

```
MongoDB cluster
├── master DB  (shared across all tenants)
│   ├── users           ← one doc per user, tenantId field scoped
│   ├── tenants         ← org registry (name, slug, dbName, billing)
│   ├── tenant_memberships  ← user ↔ tenant role assignments
│   └── tenant_invites  ← pending email invitations
│
├── hrms-acme-corp      ← Acme Corp's isolated DB
│   ├── attendance_records
│   ├── leaves
│   ├── salary_structures
│   ├── chatrooms / messages
│   ├── audit_logs
│   ├── tenant_settings
│   └── ... (all business collections)
│
└── hrms-globex-inc     ← Globex Inc's isolated DB
    └── ...
```

### Request flow

```
JWT (tenantId, dbName) → authenticate middleware
    → resolve dbName from cache (in-memory → DB)
    → getClientForDb(dbName)        // connection pool lookup/create
    → AsyncLocalStorage.run({ tenantId, tenantClient }, next)
        → prismaWithTenant.<model>  // routed transparently
```

The `prismaWithTenant` proxy routes at the model level:

| Model                                        | Database  | Isolation mechanism                                                      |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `user`                                       | Master DB | Prisma `$extends` auto-injects `where: { tenantId }` on every read/write |
| `tenant`, `tenantMembership`, `tenantInvite` | Master DB | No filter — cross-tenant admin data                                      |
| All business models                          | Tenant DB | Naturally isolated by separate database                                  |

### Tenant lifecycle

1. **Registration** — user signs in via Google OAuth; a `pendingSetup` token is issued; no tenant assigned yet.
2. **Org setup** — user provides org name, industry, size; `POST /tenants/complete-org-setup` creates the Tenant record (`dbName = hrms-<slug>`) and initialises the tenant DB.
3. **Subscription** — Razorpay subscription created; webhook confirms payment; `subscriptionStatus` set to `active`.
4. **Operations** — all requests carry a full JWT with `tenantId` + `dbName`; auth middleware routes to the correct database.
5. **Multi-tenant users** — users can belong to multiple tenants (e.g. a consultant); `tenants/select` switches the active context and issues a new JWT scoped to that tenant.
6. **Offboarding** — subscription cancellation triggers `cancelling` → `expired` state; `requireActiveSubscription` middleware blocks API access on expiry.

### Tenant Settings

Each org configures its own operational rules via `TenantSettings`. Settings are **time-versioned**: a new record with `effectiveFrom` in the future can be staged without disrupting current operations.

| Category        | Configurable fields                                                          |
| --------------- | ---------------------------------------------------------------------------- |
| **Leave**       | Paid/sick/casual days per year, medical cert requirement, custom leave types |
| **Attendance**  | Work start time, late grace period (minutes), full/half-day hour thresholds  |
| **Geofencing**  | Enable/disable, office GPS coordinates, radius (metres)                      |
| **HR defaults** | Probation period (days), notice period (days)                                |

---

## Tech Stack

| Layer              | Technology                                         |
| ------------------ | -------------------------------------------------- |
| Frontend           | React 18, Vite, TypeScript, MUI v6, PrimeReact v10 |
| State / forms      | React Context, Formik, Zod                         |
| Offline / PWA      | IndexedDB, Workbox (service worker), Web Workers   |
| API gateway        | Node.js, Express, gRPC-js, Socket.IO               |
| Microservices      | Node.js, TypeScript, gRPC                          |
| ORM                | Prisma (MongoDB provider)                          |
| Database           | MongoDB (database-per-tenant silo)                 |
| Cache              | Redis (ioredis), in-process LRU                    |
| Job queue          | BullMQ                                             |
| Push notifications | Firebase Cloud Messaging (FCM)                     |
| Payments           | Razorpay (subscriptions + webhooks)                |
| AI inference       | Ollama, for AI Insights and resume scoring only    |
| Observability      | Prometheus, Grafana, Loki, Winston, AWS CloudWatch |
| Build system       | Turborepo, pnpm workspaces                         |
| Containerisation   | Docker, nginx                                      |
| Code quality       | Husky, Prettier, ESLint, Conventional Commits      |

---

## AI Features

### AI Assistants (MCP)

Praesto doesn't host a chatbot. People connect the AI assistant they already use to Praesto's **MCP server** at `https://api.praesto.in/mcp`. The assistant runs the model; Praesto only answers tool calls, so no Ollama server, GPU or LLM API key is involved.

- The assistant signs in through Praesto's normal Google / passkey sign-in, then the person approves what it may read (OAuth 2.1 + PKCE, consent screen in the web app).
- Eleven read-only tools: the person's own profile, leave, attendance and salary; the organisation's policies, announcements and holidays; and public careers-page openings (also at `/mcp/public`, no sign-in).
- No tool can address another user or organisation; every call re-checks the grant, membership and subscription inside the same tenant context as the web API.

See [docs/mcp.md](docs/mcp.md) for the flow, tools, security model and setup.

### AI Insights

A separate analytical feature at `POST /api/ai-insights`, a one-shot report (this still uses Ollama):

1. The gateway fetches data for the requested module and time period directly from the tenant database.
2. Data is sent to Ollama with an analytical prompt.
3. Streaming insights are returned as SSE to the frontend.

**Supported modules:** attendance, leave, salary, recruitment (each with `month`, `last_month`, `quarter`, `year` periods).

### AI Resume Scoring

When a candidate submits an application via `POST /api/apply-for-job`, a BullMQ job is enqueued asynchronously. The `resumeParser` worker in `recruitment-service`:

1. Extracts text from the uploaded resume PDF (`pdf-parse`).
2. Sends resume text + job requirements to Ollama.
3. Ollama returns a score (0–10) and explanation.
4. Score and notes are persisted to `JobApplication.resumeScore` / `JobApplication.aiNotes`.
5. Applications below the threshold (default 7/10) are auto-rejected.

**Configuration:**

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:14b
```

---

## Security

### Authentication flows

**Google OAuth 2.0**
`GET /api/auth/google` → Google consent screen → `GET /api/auth/google/callback` → JWT issued → browser redirected into SPA.

**WebAuthn (Passkeys)**
Employees can enrol a passkey (biometric or hardware key). Once enrolled, login skips OAuth entirely and uses the passkey challenge flow. Full WebAuthn Level 2 spec compliance.

**Hidden admin fallback**
Username + password endpoint, not surfaced in the UI. Used for emergency access.

### Multi-tenant onboarding tokens

A `pendingSetup: true` JWT is issued immediately after first OAuth sign-in. This token has limited scope — it can only call `/tenants/complete-org-setup` and `/tenants/select`. After org setup completes, a full-scope JWT with `tenantId` and `dbName` is issued.

### Login risk scoring

Every login is scored against six weighted signals:

| Signal            | Weight | Description                                 |
| ----------------- | ------ | ------------------------------------------- |
| Impossible travel | 60     | >500 km in <6 hours (Haversine formula)     |
| New country       | 35     | First sign-in from this country             |
| New device        | 20     | Unrecognised browser/OS fingerprint         |
| Unusual hour      | 15     | Outside historically used 3-hour buckets    |
| New IP subnet     | 10     | First sign-in from this /24 subnet          |
| New auth method   | 10     | First use of this method (OAuth vs passkey) |

- Score ≥ 30 → notification email with login details
- Score ≥ 50 → **Suspicious Sign-In Detected** email with warning banner

### CSRF protection

All mutating requests (POST / PUT / PATCH / DELETE) require an `X-CSRF-Token` header. The token is fetched lazily from `GET /csrf-token`, cached in memory, and bound to the session identifier. Concurrent fetches are deduplicated via a shared in-flight promise. Tokens are invalidated on logout and automatically re-fetched on 403.

### Superuser elevation

A boolean `isSuperUser` flag on the `User` model grants cross-tenant admin capabilities (accessing all tenants' data, bypassing permission checks). This is separate from the tenant role hierarchy (`owner → admin → hr → manager → employee`).

---

## Billing & Subscriptions

Subscriptions are managed via **Razorpay**.

### Subscription lifecycle

```
New org → pendingSetup token
    → POST /payment/create-subscription  (Razorpay subscription created)
    → Razorpay webhook confirms payment
    → subscriptionStatus: "active"
    → full JWT issued

Monthly/annual renewal → Razorpay webhook
    → planActivatedAt / planExpiresAt updated

Cancellation requested → subscriptionStatus: "cancelling"
    → X-Subscription-Cancelling header on all responses
    → frontend shows cancellation-pending banner

Razorpay confirms cancellation → subscriptionStatus: "expired"
    → requireActiveSubscription middleware → HTTP 402

Grace period → subscriptionStatus: "grace_period"
    → X-Subscription-Grace-Period + X-Plan-Expires-At headers
    → frontend shows renewal banner; access not blocked
```

### Razorpay plan cache

Plan IDs are permanent in Razorpay. To avoid redundant API calls across service restarts, plan IDs are cached at two levels:

1. **In-memory** — for the lifetime of the process
2. **Redis** — survives restarts; keyed by billing period (`monthly` / `annual`)

---

## Observability

### Metrics (Prometheus + Grafana)

Every service exposes a `/metrics` endpoint on a dedicated `METRICS_PORT` sidecar. Metrics collected via `prom-client` in `@hrms/logger`:

| Metric                     | Type      | Labels                         |
| -------------------------- | --------- | ------------------------------ |
| `http_request_duration_ms` | Histogram | method, route, status, service |
| `http_requests_total`      | Counter   | method, route, status, service |
| `grpc_request_duration_ms` | Histogram | method, service                |
| `grpc_requests_total`      | Counter   | method, service                |
| Node.js defaults           | —         | CPU, memory, event loop lag    |

### Logs (Loki + CloudWatch)

| Environment | Backend        | Key                                       |
| ----------- | -------------- | ----------------------------------------- |
| Local / dev | Loki           | Set `LOKI_URL` env var                    |
| Production  | AWS CloudWatch | `/hrms/<service>/<env>`, 90-day retention |

### Local monitoring stack

```bash
# Start (also runs automatically with pnpm dev)
docker compose -f docker-compose.monitoring.yml up -d

# Stop
pnpm monitoring:stop
```

| Service    | URL                     | Credentials   |
| ---------- | ----------------------- | ------------- |
| Grafana    | `http://localhost:3000` | admin / admin |
| Prometheus | `http://localhost:9090` | —             |
| Loki       | `http://localhost:3100` | —             |

---

## Project Structure

```
.
├── apps/
│   ├── web/                    # React 18 frontend (Vite)
│   ├── api-gateway/            # Public-facing Express gateway
│   ├── auth-service/           # gRPC: authentication, tokens, WebAuthn, OAuth
│   ├── user-service/           # gRPC: user accounts, FCM tokens
│   ├── employee-service/       # gRPC: employee profiles, KYC, org tree
│   ├── attendance-service/     # gRPC: check-in/out, corrections, summaries
│   ├── leave-service/          # gRPC: leave requests, approvals, balances
│   ├── recruitment-service/    # gRPC: job openings, applications, AI scoring
│   ├── hrm-service/            # gRPC: appraisals, policies, rules, HR activities
│   ├── salary-service/         # gRPC: salary structures, payslips
│   ├── analytics-service/      # gRPC: workforce and business analytics
│   ├── notification-service/   # gRPC: FCM dispatch, in-app notifications
│   └── scheduler-service/      # BullMQ workers and cron jobs
│
├── packages/
│   ├── proto-definitions/      # .proto files + generated TypeScript types
│   ├── database/               # Prisma schema, client, prismaWithTenant proxy,
│   │                           #   tenant connection pool, migration scripts
│   ├── cache/                  # Two-tier CacheManager (LRU + Redis)
│   ├── queue/                  # BullMQ connection factory + job types
│   ├── crypto/                 # AES-256 field encryption
│   ├── logger/                 # Winston logger + prom-client metrics sidecar
│   ├── common/                 # apiResponse helper, RESPONSE_STATUS enum
│   ├── grpc-client/            # gRPC channel factory, grpcCall helper
│   ├── grpc-server/            # BaseGrpcServer bootstrap class
│   ├── websocket/              # Socket.IO config
│   ├── firebase/               # FCM helpers
│   └── typescript-config/      # Base tsconfig presets
│
├── monitoring/
│   ├── prometheus.yml              # Prometheus scrape config (Docker)
│   ├── prometheus-local.yml        # Prometheus scrape config (local dev)
│   ├── loki-config.yml             # Loki storage config
│   └── grafana/
│       ├── provisioning/           # Auto-provisioned datasources + dashboards
│       └── dashboards/hrms.json    # Pre-built HRMS Grafana dashboard
│
├── docker/
│   ├── base.Dockerfile         # Multi-stage build for all Node.js services
│   ├── web.Dockerfile          # Multi-stage build for React frontend
│   └── nginx.conf              # nginx config for web container
│
├── docker-compose.dev.yml          # Dev (no infra — uses remote MongoDB/Redis)
├── docker-compose.ci.yml           # Build/smoke-test all images — run in CI on every PR (.github/workflows/ci.yml, see wiki/Deployment.md)
├── docker-compose.prod.yml         # Production (pulls from registry)
├── docker-compose.monitoring.yml   # Prometheus + Loki + Grafana stack
├── turbo.json                      # Turborepo task graph
└── pnpm-workspace.yaml
```

---

## Prerequisites

| Tool                             | Version                                      |
| -------------------------------- | -------------------------------------------- |
| Node.js                          | ≥ 18                                         |
| pnpm                             | 8.15.6 (`packageManager` field)              |
| Docker + Docker Compose          | For containerised local dev                  |
| `protoc` + `protoc-gen-ts_proto` | For regenerating gRPC types                  |
| Ollama                           | For AI chatbot, insights, and resume scoring |

```bash
# Install protoc (macOS)
brew install protobuf

# Activate the pinned pnpm version
corepack enable && corepack prepare pnpm@8.15.6 --activate

# Install and start Ollama
# Download from https://ollama.com
ollama pull qwen2.5-coder:14b
ollama serve
```

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd hrms
pnpm install          # also runs pnpm db:generate via postinstall
```

### 2. Environment variables

```bash
cp .env.example .env
```

Key variables:

| Variable                                                              | Purpose                               |
| --------------------------------------------------------------------- | ------------------------------------- |
| `DEV_MONGODB_URI`                                                     | MongoDB connection string (master DB) |
| `REDIS_URL`                                                           | Redis connection                      |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                            | Separate signing keys                 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL`   | OAuth                                 |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payments                              |
| `FIREBASE_SERVICE_ACCOUNT`                                            | FCM push notifications                |
| `OLLAMA_URL` / `OLLAMA_MODEL`                                         | AI features                           |
| `LOKI_URL`                                                            | Optional: log shipping to Loki        |
| `METRICS_PORT`                                                        | Per-service Prometheus metrics port   |

### 3. Generate protobuf types

```bash
pnpm proto:gen
```

Runs `protoc` against all `.proto` files in `packages/proto-definitions/src/proto/` and outputs TypeScript bindings.

### 4. SSL certificates

```bash
pnpm certs:generate     # generates self-signed certs for local dev
```

Or place your own `cert.pem` / `key.pem` in `packages/certificates/`.

### 5. One-shot bootstrap

```bash
pnpm setup:project      # proto:gen → db:generate → build
```

---

## Development

```bash
pnpm dev                # starts all services + monitoring stack
```

| Service       | URL                               |
| ------------- | --------------------------------- |
| Web (React)   | `https://localhost:5173`          |
| API Gateway   | `https://localhost:9002`          |
| Swagger UI    | `https://localhost:9002/api-docs` |
| Prisma Studio | `http://localhost:5555`           |
| Grafana       | `http://localhost:3000`           |
| Prometheus    | `http://localhost:9090`           |
| Loki          | `http://localhost:3100`           |

### Useful commands

```bash
pnpm build              # build all packages (topological order)
pnpm format             # Prettier + ESLint --fix
pnpm db:push            # push Prisma schema to MongoDB
pnpm db:studio          # open Prisma Studio
pnpm monitoring:stop    # stop Prometheus + Loki + Grafana stack
```

---

## Building for Production

```bash
pnpm build
```

The frontend pipeline (`apps/web`) runs:

1. `build:wasm` — compile WASM modules (face recognition)
2. `vite build` — bundle and split the React app
3. `optimize-images` — generate responsive image variants
4. `workbox injectManifest` — inject precache manifest into service worker
5. `optimize-css-loading` — convert blocking CSS to async preloads
6. `purge-css` — remove unused CSS from output bundles

Output: `apps/web/dist/`

---

## Docker

All Docker operations go through `pnpm docker <command> [service]`.

| Command                         | Description                              |
| ------------------------------- | ---------------------------------------- |
| `pnpm docker build [svc]`       | Build image(s) using layer cache         |
| `pnpm docker build:force [svc]` | Build with `--no-cache`                  |
| `pnpm docker up [svc]`          | Start MongoDB + Redis, then container(s) |
| `pnpm docker down [svc]`        | Stop and remove containers               |
| `pnpm docker push [svc]`        | Push image(s) to Docker Hub              |

**Service names:** `api-gateway`, `auth-service`, `user-service`, `employee-service`, `attendance-service`, `leave-service`, `recruitment-service`, `hrm-service`, `salary-service`, `analytics-service`, `notification-service`, `scheduler-service`, `web`

### How the Dockerfiles work

**`base.Dockerfile`** (all backend services):

1. **pruner** — `turbo prune --scope=<service>` produces a minimal dependency subtree
2. **builder** — installs pruned deps, generates protos + Prisma client, compiles TypeScript
3. **runner** — copies only the production build, no dev dependencies, runs as non-root

**`web.Dockerfile`** (frontend):

1. **pruner** — same Turborepo pruning for `web` scope
2. **builder** — installs deps, runs full Vite build pipeline
3. **runner** — copies `dist/` into `nginx:alpine`; no Node.js at runtime

---

## Git Conventions

See [GIT_HOOKS.md](./GIT_HOOKS.md) for full details.

**Branch naming:** `<type>/<description>` (e.g. `feat/geofencing`, `fix/jwt-expiry`)

**Allowed types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `hotfix`, `release`

**Commit format (Conventional Commits):**

```
feat(tenant): add per-tenant geofencing configuration
fix(auth): clear refresh token cookie on logout
chore: update pnpm lockfile
```

The `pre-commit` hook runs Prettier on staged files automatically.
