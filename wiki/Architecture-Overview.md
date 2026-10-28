# Architecture Overview

## System Diagram

```
                        ┌──────────────────────────────────┐
                        │         React SPA (web)           │
                        │  Vite · MUI · Socket.IO · IndexedDB│
                        └────────────────┬─────────────────┘
                                         │ HTTPS / REST / WebSocket
                        ┌────────────────▼─────────────────┐
                        │           API Gateway             │
                        │  Express · JWT · Socket.IO · CSRF │
                        │  Rate limiting · Audit logging    │
                        └──────┬─────────────────────┬──────┘
              gRPC (protobuf)  │                     │  Direct Prisma
      ┌────────────────────────┤                     │  (business models
      │        │       │       │       │       │     │   via tenant DB)
  ┌───▼──┐ ┌──▼───┐ ┌──▼───┐ ┌▼────┐ ┌▼─────┐ ┌▼──▼──────────────────┐
  │ auth │ │ user │ │empl. │ │leave│ │salary│ │rules · policies      │
  └──────┘ └──────┘ └──────┘ └─────┘ └──────┘ │analytics · recruit.  │
                                                │hrm · notification    │
                                                └──────────────────────┘
                    ┌─────────────────┐
                    │ scheduler-service│  BullMQ cron workers
                    └────────┬────────┘
                             │ queues
            ┌────────────────▼──────────────────────────┐
            │              Shared Infrastructure         │
            │  MongoDB (master + per-tenant DBs)         │
            │  Redis (sessions · cache L2 · Socket.IO)   │
            │  S3 (files) · Firebase FCM · Razorpay      │
            └────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Database-Per-Tenant Silo Model

Every organisation (tenant) gets its own dedicated MongoDB database. No business data is co-mingled across tenants at the database layer.

```
MongoDB cluster
├── hrms-master          ← users, tenants, memberships, invites (shared)
├── hrms-acme-corp       ← all data for tenant "acme-corp"
├── hrms-globex          ← all data for tenant "globex"
└── hrms-initech         ← all data for tenant "initech"
```

**Why silo over shared schema?**

- Hard tenant-level isolation: a bug cannot leak row A into tenant B's query.
- Independent backup and restore per org.
- Scales naturally: heavy orgs can be migrated to dedicated clusters.
- Eliminates an entire class of multi-tenancy query bugs (forgetting `WHERE tenantId = ?`).

The `Tenant.dbName` field (e.g. `hrms-acme-corp`) is the routing key. Every inbound request carries this in the JWT, and the `prismaWithTenant` proxy routes each Prisma query to the correct client.

### 2. `prismaWithTenant` — Federated Query Router

`packages/database/src/prismaWithTenant.ts` exports a single `prismaWithTenant` proxy that every service treats as a normal Prisma client. Under the hood it resolves which physical database to send each model's query to:

| Model                                        | Routes to                           | Why                                          |
| -------------------------------------------- | ----------------------------------- | -------------------------------------------- |
| `user`                                       | Master DB (auto-injects `tenantId`) | Users are cross-tenant; scoped by membership |
| `tenant`, `tenantMembership`, `tenantInvite` | Master DB (plain)                   | Platform-level records                       |
| All business models                          | Tenant DB (`getTenantClient()`)     | Isolated per-org data                        |

The tenant context flows through the request lifecycle via **Node.js `AsyncLocalStorage`** — no extra parameters need to be threaded through call stacks.

```
HTTP request arrives
       │
       ▼
authenticate middleware
  ├── verifies JWT
  ├── resolves dbName (from JWT or DB lookup, with in-memory cache)
  ├── calls getClientForDb(dbName) → lazily creates/returns PrismaClient
  └── stores { tenantId, tenantClient } in AsyncLocalStorage
       │
       ▼
Route handler calls prismaWithTenant.leave.findMany(…)
       │
       ▼
prismaWithTenant proxy reads AsyncLocalStorage
  └── routes query to the tenant's PrismaClient instance
```

### 3. Tenant Connection Pool

`packages/database/src/tenantClientPool.ts` maintains a `Map<dbName, PrismaClient>`. Clients are created on first access and reused on all subsequent requests for that tenant — one long-lived connection pool per org, no reconnect overhead per request.

```typescript
// Simplified
const pool = new Map<string, PrismaClient>();

export function getClientForDb(dbName: string): PrismaClient {
  if (!pool.has(dbName)) {
    pool.set(dbName, new PrismaClient({ datasourceUrl: buildUrl(dbName) }));
  }
  return pool.get(dbName)!;
}
```

### 4. Microservices over gRPC

Each business domain is an independent Node.js process with its own gRPC server. The API gateway is the only public-facing process — all inter-service calls are internal gRPC on the Docker network and never exposed to the internet.

Protocol Buffer definitions live in `packages/proto-definitions` and are shared across all services. Running `pnpm proto:gen` regenerates TypeScript bindings for every service at once.

### 5. Two-Tier Cache (L1 LRU + L2 Redis)

`packages/cache/src/CacheManager.ts` implements a layered cache:

- **L1 — in-process LRU** (max 1,000 entries): sub-millisecond reads; evicts on capacity.
- **L2 — Redis**: survives process restarts; shared across gateway replicas.

Read path: check L1 → if miss check L2 → if miss query DB and populate both layers.  
Write/invalidate: evict from L1 synchronously; SCAN-based pattern invalidation on Redis (non-blocking).  
Redis failures are transparent — the cache falls back to L1 only; requests continue serving.

| Entity         | TTL    |
| -------------- | ------ |
| `notification` | 5 min  |
| `attendance`   | 30 min |
| `leave`        | 1 h    |
| `employee`     | 2 h    |
| `salary`       | 4 h    |
| `holiday`      | 24 h   |

### 6. Single API Gateway

The gateway concentrates cross-cutting concerns in one place:

- **Authentication** — JWT verification + tenant context setup on every protected route
- **Subscription guard** — blocks `expired` orgs with HTTP 402; passes `grace_period`/`cancelling` with warning headers
- **Rate limiting** — per-IP limits per endpoint group
- **CSRF protection** — double-CSRF double-submit pattern
- **Audit logging** — every write action persisted to `AuditLog`
- **WebSocket upgrades** — Socket.IO attached to the same HTTPS server

### 7. Tenant Lifecycle

```
New user signs up via Google OAuth
       │
       ▼
pendingSetup JWT issued (limited to org-setup endpoints)
       │
       ▼
User creates organisation (name, slug, industry, etc.)
       ├── Tenant row created in master DB
       ├── dbName assigned (hrms-<slug>)
       └── Razorpay subscription created
       │
       ▼
Payment confirmed (Razorpay webhook → subscriptionStatus = "active")
       │
       ▼
Full JWT issued — access to all business routes
       │
       ▼
Normal operation ──────────────────────────────────────────────┐
       │                                                        │
       │  Plan expires (payment failure)                       │
       ▼                                                        │
grace_period (X-Subscription-Grace-Period header on responses) │
       │                                                        │
       │  Payment still not received                           │
       ▼                                                        │
expired → HTTP 402 on all business routes                      │
       │                                                        │
       │  Admin reactivates / pays                             │
       └────────────────────────────────────────────────────────┘
```

### 8. Subscription Status Routing

`apps/api-gateway/src/middleware/requireActiveSubscription.ts` sits behind all business routes:

| Status         | Gateway behaviour                                                        |
| -------------- | ------------------------------------------------------------------------ |
| `active`       | Pass through                                                             |
| `grace_period` | Pass through + `X-Subscription-Grace-Period: true` + `X-Plan-Expires-At` |
| `cancelling`   | Pass through + `X-Subscription-Cancelling: true`                         |
| `expired`      | HTTP 402 — request blocked                                               |

Plan IDs are cached in a two-level plan cache (in-process → Redis → Razorpay API) to avoid hitting the Razorpay API on every request.

### 9. Time-Versioned Tenant Settings

HR policy parameters (leave quotas, attendance thresholds, geofencing rules, notice period) are stored as immutable versioned rows in `TenantSettings`. The _active_ settings at any moment are the latest row where `effectiveFrom ≤ now()`. A future-dated row is a _pending_ change.

This means an HR admin can schedule a policy change to take effect on the first of next month without any downtime or special deployment step.

### 10. Turborepo Build Graph

Turborepo understands the dependency graph between workspace packages and builds/caches them in topological order. `pnpm build` in the root compiles all packages in parallel where possible. Affected packages are rebuilt on change; unaffected packages are restored from the Turborepo cache.

---

## Tech Stack

| Layer                 | Technology                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Frontend              | React 18, Vite 8, TypeScript, MUI v6, PrimeReact v10                                        |
| Forms / validation    | Formik, Zod                                                                                 |
| HTTP client           | Axios (with interceptors + protobuf support)                                                |
| Real-time client      | Socket.IO client 4.8                                                                        |
| Offline storage       | IndexedDB (6 stores via custom wrapper)                                                     |
| Service worker        | Workbox                                                                                     |
| API gateway           | Node.js, Express 4, Socket.IO 4, gRPC-js                                                    |
| Microservices         | Node.js, TypeScript, gRPC                                                                   |
| ORM                   | Prisma (MongoDB provider)                                                                   |
| Database              | MongoDB (database-per-tenant silo)                                                          |
| Cache                 | Two-tier: in-process LRU (L1) + Redis ioredis (L2)                                          |
| Job queue             | BullMQ on Redis                                                                             |
| Payments              | Razorpay (subscriptions + webhooks)                                                         |
| Push notifications    | Firebase Cloud Messaging                                                                    |
| File storage          | AWS S3                                                                                      |
| AI / LLM              | Ollama (qwen2.5-coder:14b) — AI insights, resume score; chat is via external MCP assistants |
| Build system          | Turborepo, pnpm workspaces                                                                  |
| Containerisation      | Docker, nginx                                                                               |
| Observability (local) | Prometheus + Grafana + Loki                                                                 |
| Observability (prod)  | AWS CloudWatch                                                                              |
| Code quality          | Husky, Prettier, ESLint, Conventional Commits                                               |

---

## Repository Layout

```
hrms/
├── apps/
│   ├── web/                    # React SPA (Vite)
│   ├── api-gateway/            # Public-facing Express gateway
│   ├── auth-service/           # gRPC: auth, tokens, WebAuthn, OAuth
│   ├── user-service/           # gRPC: user accounts
│   ├── employee-service/       # gRPC: employee profiles, KYC
│   ├── attendance-service/     # gRPC: check-in/out, reports
│   ├── leave-service/          # gRPC: leave requests and approvals
│   ├── recruitment-service/    # gRPC: jobs, applications, interviews
│   ├── hrm-service/            # gRPC: HR activities, appraisals
│   ├── salary-service/         # gRPC: salary structures, payslips
│   ├── analytics-service/      # gRPC: workforce analytics
│   ├── notification-service/   # gRPC: FCM tokens, push dispatch
│   └── scheduler-service/      # BullMQ workers (cron + background tasks)
│
├── packages/
│   ├── proto-definitions/      # .proto files + generated TypeScript stubs
│   ├── database/               # Prisma schema, prismaWithTenant, tenant pool
│   ├── cache/                  # Two-tier LRU + Redis CacheManager
│   ├── queue/                  # BullMQ connection factory + job types
│   ├── common/                 # apiResponse helper + RESPONSE_STATUS enum
│   ├── logger/                 # Winston logger (structured JSON)
│   ├── crypto/                 # AES-256 field-level encryption
│   ├── grpc-client/            # gRPC channel factory (gateway)
│   ├── grpc-server/            # gRPC server bootstrap (microservices)
│   ├── websocket/              # Socket.IO config + Redis adapter
│   ├── firebase/               # FCM push notification helpers
│   ├── certificates/           # Local dev TLS certificates
│   └── typescript-config/      # Base tsconfig presets
│
├── docker/
│   ├── base.Dockerfile         # Multi-stage build for Node services
│   ├── web.Dockerfile          # Multi-stage build for React frontend
│   └── nginx.conf
│
├── docker-compose.local.yml    # Full stack including MongoDB and Redis
├── docker-compose.dev.yml      # Services only (uses remote infra)
├── docker-compose.ci.yml       # CI build and smoke test
├── docker-compose.prod.yml     # Production (pulls registry images)
├── turbo.json                  # Turborepo task graph
└── pnpm-workspace.yaml
```

---

## Request Flow (End to End)

```
Browser → HTTPS → API Gateway
  1. authLimiter / defaultLimiter (rate limit)
  2. authenticate middleware
     ├── verifies JWT (HS256)
     ├── resolves dbName → in-memory cache → DB lookup
     └── stores { tenantId, tenantClient } in AsyncLocalStorage
  3. requireTenant (rejects pendingSetup tokens on business routes)
  4. requireActiveSubscription (rejects expired tenants with 402)
  5. Route handler
     ├── validates request body (Zod)
     ├── calls gRPC microservice  OR  queries DB via prismaWithTenant
     │    └── prismaWithTenant reads AsyncLocalStorage → routes to tenant DB
     ├── writes AuditLog (write paths)
     └── returns apiResponse(res, status, data)
```

---

## Observability

| Signal  | Local stack          | Production          |
| ------- | -------------------- | ------------------- |
| Metrics | Prometheus + Grafana | AWS CloudWatch      |
| Logs    | Loki + Grafana       | AWS CloudWatch Logs |
| Traces  | —                    | —                   |

Each service exposes a `/metrics` endpoint on a separate `METRICS_PORT` (not the gRPC port) scraped by Prometheus. Structured JSON logs are written by `@hrms/logger` (Winston) and shipped to Loki or CloudWatch depending on `NODE_ENV`.

---

## Security Perimeter

| Concern                  | Mechanism                                                                |
| ------------------------ | ------------------------------------------------------------------------ |
| Authentication           | Passwordless: WebAuthn (passkeys) or Google OAuth 2.0                    |
| Access token             | Short-lived JWT (HS256, 15 min), in-memory only                          |
| Refresh token            | Redis-backed, `httpOnly; Secure; SameSite=Strict` cookie                 |
| CSRF                     | Double-submit pattern (`X-CSRF-Token` header + `httpOnly` cookie secret) |
| Sensitive fields at rest | AES-256 via `@hrms/crypto` (Aadhaar, PAN, bank account, mobile)          |
| Transport                | HTTPS/TLS everywhere; gRPC services use mTLS internally                  |
| Tenant isolation         | Database-per-tenant silo — no shared tables between orgs                 |
| Login anomaly detection  | 6-signal risk score; ≥30 → alert email; ≥50 → suspicious sign-in flag    |
| Superuser elevation      | `isSuperUser` boolean on `User`; cross-tenant admin capabilities         |
| Pending setup tokens     | Limited-scope JWT; blocks all business routes via `requireTenant`        |

See [Authentication](Authentication) for the complete auth flow.
