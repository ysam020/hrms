# Architecture Overview

## System Diagram

```
                       ┌─────────────────┐
                       │   React (web)   │  Vite + nginx
                       └────────┬────────┘
                                │ HTTPS / REST / WebSocket
                       ┌────────▼────────┐
                       │   API Gateway   │  Express · JWT · Socket.IO · CSRF
                       └────────┬────────┘
             gRPC (protobuf)    │
     ┌─────────────────────────-┼──────────────────────────────┐
     │          │          │    │    │          │           │   │
 ┌───▼──┐ ┌────▼───┐ ┌────▼──┐ │ ┌──▼────┐ ┌──▼─────┐ ┌──▼────▼────────┐
 │ auth │ │  user  │ │ empl. │ │ │ leave │ │ salary │ │ recruit · hrm  │
 └──────┘ └────────┘ └───────┘ │ └───────┘ └────────┘ │ analytics · …  │
                                │                       └────────────────┘
                        ┌───────▼──────┐
                        │  scheduler   │  BullMQ cron jobs
                        └──────────────┘

     ┌──────────────────────────────────────────────────────┐
     │                 Shared Infrastructure                 │
     │   MongoDB (Prisma ORM)   Redis   Firebase (FCM)  S3  │
     └──────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Microservices over gRPC

Each business domain (auth, employee, leave, …) is an independent Node.js process with its own gRPC server. The API gateway is the only public-facing process — all inter-service calls are internal gRPC on localhost and are never exposed to the internet.

Protocol Buffer definitions live in `packages/proto-definitions` and are shared across all services. Running `pnpm proto:gen` regenerates TypeScript bindings for every service at once.

### 2. Single API gateway

The gateway concentrates cross-cutting concerns in one place:

- **Authentication** — JWT verification on every protected route
- **Authorization** — role and permission checks
- **Rate limiting** — per-IP limits per endpoint group
- **CSRF protection** — double-CSRF pattern for state-changing requests
- **Audit logging** — every write action is persisted to `AuditLog`
- **WebSocket upgrades** — Socket.IO attached to the same HTTPS server

### 3. Turborepo build graph

Turborepo understands the dependency graph between workspace packages and builds/caches them in the correct order. `pnpm build` in the root builds all 30+ packages in parallel where possible. Affected packages are rebuilt on change; unaffected packages are restored from cache.

### 4. Email-first authentication

Users never set a password. They authenticate via:

1. **WebAuthn (passkey)** — biometric or device-PIN, if a credential is already enrolled
2. **Google OAuth 2.0** — redirect to Google consent screen, then back

### 5. Stateless access tokens, stateful refresh tokens

- **Access token** — short-lived JWT (HS256), kept in memory only, not written to `localStorage` or cookies. Silently renewed via the refresh token.
- **Refresh token** — stored in Redis, delivered as `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/refresh-token`. Invisible to JavaScript.

### 6. AES-256 field-level encryption

Sensitive fields (Aadhaar number, mobile, bank account, etc.) are encrypted at rest using AES-256 via `@hrms/crypto`. The encryption key is injected at runtime from environment variables / AWS Secrets Manager; the Prisma schema stores only ciphertext.

---

## Tech Stack

| Layer              | Technology                                           |
| ------------------ | ---------------------------------------------------- |
| Frontend           | React 18, Vite 8, TypeScript, MUI v6, PrimeReact v10 |
| Forms / validation | Formik, Zod                                          |
| HTTP client        | Axios (with interceptors)                            |
| Real-time client   | Socket.IO client 4.8                                 |
| API gateway        | Node.js, Express 4, gRPC-js, Socket.IO 4             |
| Microservices      | Node.js, TypeScript, gRPC                            |
| ORM                | Prisma (MongoDB provider)                            |
| Database           | MongoDB                                              |
| Cache / sessions   | Redis (ioredis)                                      |
| Job queue          | BullMQ                                               |
| Push notifications | Firebase Cloud Messaging                             |
| File storage       | AWS S3                                               |
| Build system       | Turborepo, pnpm workspaces                           |
| Containerisation   | Docker, nginx                                        |
| Code quality       | Husky, Prettier, ESLint, Conventional Commits        |

---

## Shared Packages

Cross-cutting concerns are extracted into workspace packages so no logic is duplicated across services.

| Package                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `@hrms/db`               | Prisma client — single source of truth for the MongoDB schema |
| `@hrms/proto`            | Protobuf definitions + generated TypeScript types             |
| `@hrms/cache`            | Redis client with per-entity TTL strategy                     |
| `@hrms/queue`            | BullMQ connection factory + job type definitions              |
| `@hrms/crypto`           | AES-256 encryption/decryption for sensitive fields            |
| `@hrms/logger`           | Winston logger (structured JSON in production)                |
| `@hrms/common`           | Standardized API response helper, status codes                |
| `@hrms/grpc-client`      | gRPC channel factory (used by the gateway)                    |
| `@hrms/grpc-server`      | gRPC server bootstrap helpers (used by each service)          |
| `@hrms/websocket`        | Socket.IO configuration shared by gateway                     |
| `@hrms/firebase`         | FCM push notification helpers                                 |
| `@hrms/schemas`          | Zod validation schemas shared between client and server       |
| `@hrms/ui`               | Shared React component library                                |
| `@hrms/auth`             | Client-side auth helpers                                      |
| `@hrms/webauthn`         | WebAuthn (passkey) client helpers                             |
| `@hrms/constants`        | Shared constants (client)                                     |
| `@hrms/shortcuts`        | Keyboard shortcut definitions                                 |
| `@hrms/validation-utils` | Reusable validation patterns                                  |

See [Shared Packages](Shared-Packages) for implementation details on each package.

---

## Repository Layout

```
hrms/
├── apps/
│   ├── web/                   # React SPA (Vite)
│   ├── api-gateway/           # Public-facing Express gateway
│   ├── auth-service/          # gRPC: auth, tokens, WebAuthn, OAuth
│   ├── user-service/          # gRPC: user accounts
│   ├── employee-service/      # gRPC: employee profiles, KYC, org
│   ├── attendance-service/    # gRPC: check-in/out, reports
│   ├── leave-service/         # gRPC: leave requests and approvals
│   ├── recruitment-service/   # gRPC: jobs, applications, interviews
│   ├── hrm-service/           # gRPC: appraisals, policies, HR activities
│   ├── salary-service/        # gRPC: salary structures, payslips
│   ├── analytics-service/     # gRPC: workforce and business analytics
│   ├── notification-service/  # gRPC: FCM tokens, push dispatch
│   └── scheduler-service/     # BullMQ workers (cron and background tasks)
│
├── packages/
│   ├── proto-definitions/     # .proto files + generated TypeScript types
│   ├── database/              # Prisma schema + client
│   └── …                      # (see shared packages above)
│
├── docker/
│   ├── base.Dockerfile        # Multi-stage build for all Node services
│   ├── web.Dockerfile         # Multi-stage build for the React frontend
│   └── nginx.conf
│
├── docker-compose.local.yml   # Full stack including MongoDB and Redis
├── docker-compose.dev.yml     # Services only (uses remote infra)
├── docker-compose.ci.yml      # CI build and smoke test
├── docker-compose.prod.yml    # Production (pulls registry images)
├── turbo.json                 # Turborepo task graph
└── pnpm-workspace.yaml
```
