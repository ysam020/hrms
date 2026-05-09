# HRMS — Human Resource Management System

A full-stack, production-grade HRMS built as a **pnpm monorepo**. The backend is a **microservices architecture** communicating over gRPC, fronted by a single API gateway. The frontend is a React SPA served by nginx.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development](#development)
- [Building for Production](#building-for-production)
- [Docker](#docker)
- [Git Conventions](#git-conventions)

---

## Overview

HRMS covers the core lifecycle of an employee — from onboarding (KYC, biometric registration) to exit (resignation, feedback). Key functional areas:

- **Employee management** — profiles, KYC, org tree, designations
- **Attendance** — mark attendance, corrections, reports
- **Leave** — apply, approve/reject, leave balance tracking
- **Payroll** — salary structures, components, payslips
- **Recruitment** — job openings, applications, interview scheduling
- **HR activities** — appraisals, feedback, policies, events
- **Analytics** — workforce, attendance, salary, recruitment dashboards
- **Notifications** — real-time push (FCM) and in-app (Socket.IO)
- **Permissions** — role-based access control, teams

---

## Architecture

```
                        ┌─────────────────┐
                        │   React (web)   │  Vite + nginx
                        └────────┬────────┘
                                 │ HTTPS / REST
                        ┌────────▼────────┐
                        │   API Gateway   │  Express · JWT · Socket.IO
                        └────────┬────────┘
              gRPC (protobuf)    │
      ┌──────────────────────────┼──────────────────────────┐
      │          │          │    │    │          │           │
  ┌───▼──┐ ┌────▼───┐ ┌────▼──┐ │ ┌──▼────┐ ┌──▼─────┐ ┌──▼──────┐
  │ auth │ │  user  │ │ empl. │ │ │ leave │ │ salary │ │ recruit │  ...
  └──────┘ └────────┘ └───────┘ │ └───────┘ └────────┘ └─────────┘
                                 │
                         ┌───────▼───────┐
                         │   scheduler   │  BullMQ jobs
                         └───────────────┘

      ┌─────────────────────────────────────────────────┐
      │                 Shared Infrastructure            │
      │   MongoDB (Prisma)   Redis   Firebase (FCM)      │
      └─────────────────────────────────────────────────┘
```

### Key architectural decisions

**Microservices over gRPC**
Each domain (auth, employee, leave, etc.) is an independent service with its own gRPC server. The API gateway is the only public-facing process — all inter-service calls are internal gRPC, never exposed to the internet. Proto definitions live in `packages/proto-definitions` and are shared across all services.

**Single API gateway**
The gateway handles auth (JWT verification), request routing, audit logging, CORS, rate limiting, and WebSocket upgrades. Clients talk only to the gateway.

**Turborepo build graph**
Turborepo understands the dependency graph between workspace packages and builds/caches them in the correct order. `pnpm build` in the root builds all 30+ packages in parallel where possible.

**Shared packages**
Cross-cutting concerns are extracted into workspace packages so no logic is duplicated across services:

| Package                  | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `@hrms/db`               | Prisma client — single source of truth for MongoDB schema          |
| `@hrms/proto`            | Protobuf definitions + generated TypeScript types                  |
| `@hrms/cache`            | Redis client with per-entity TTL strategy                          |
| `@hrms/queue`            | BullMQ connection factory + job definitions                        |
| `@hrms/crypto`           | AES-256 encryption for sensitive fields                            |
| `@hrms/logger`           | Winston logger (structured JSON in prod)                           |
| `@hrms/common`           | Shared API response helpers, status codes                          |
| `@hrms/grpc-client`      | gRPC channel factory for the gateway                               |
| `@hrms/grpc-server`      | gRPC server bootstrap helpers                                      |
| `@hrms/websocket`        | Socket.IO configuration shared by gateway                          |
| `@hrms/firebase`         | FCM push notification helpers                                      |
| `@hrms/schemas`          | Zod validation schemas (shared between client + server validation) |
| `@hrms/ui`               | Shared React component library                                     |
| `@hrms/auth`             | Client-side auth helpers                                           |
| `@hrms/webauthn`         | WebAuthn (passkey) client helpers                                  |
| `@hrms/constants`        | Shared constants (client)                                          |
| `@hrms/shortcuts`        | Keyboard shortcut definitions (client)                             |
| `@hrms/validation-utils` | Reusable validation patterns                                       |

**Authentication**

- Email-first flow: user enters email → if WebAuthn credential enrolled → biometric prompt, else → Google OAuth redirect
- Access token in memory (never persisted to localStorage or cookies) — lost on page refresh, silently renewed via the httpOnly refresh token cookie
- Refresh token: `httpOnly; Secure; SameSite=Strict; Path=/api/refresh-token` — inaccessible to JavaScript, scoped to the one endpoint that needs it
- Hidden admin fallback: username + password, separate endpoint, not exposed in the UI

**Real-time**
Socket.IO is configured via `@hrms/websocket` and attached to the API gateway's HTTPS server. Chat, notifications, and presence use named rooms per user.

---

## Tech Stack

| Layer              | Technology                                           |
| ------------------ | ---------------------------------------------------- |
| Frontend           | React 18, Vite 8, TypeScript, MUI v6, PrimeReact v10 |
| State / forms      | React Context, Formik, Zod                           |
| API gateway        | Node.js, Express, gRPC-js, Socket.IO                 |
| Microservices      | Node.js, TypeScript, gRPC                            |
| ORM                | Prisma (MongoDB provider)                            |
| Database           | MongoDB                                              |
| Cache / sessions   | Redis (ioredis)                                      |
| Job queue          | BullMQ                                               |
| Push notifications | Firebase Cloud Messaging                             |
| Build system       | Turborepo, pnpm workspaces                           |
| Containerisation   | Docker, nginx                                        |
| Code quality       | Husky, Prettier, Conventional Commits                |

---

## Project Structure

```
.
├── apps/
│   ├── web/                   # React frontend (Vite)
│   ├── api-gateway/           # Public-facing Express gateway
│   ├── auth-service/          # gRPC: authentication, tokens, WebAuthn, OAuth
│   ├── user-service/          # gRPC: user accounts
│   ├── employee-service/      # gRPC: employee profiles, KYC, org
│   ├── attendance-service/    # gRPC: check-in/out, reports
│   ├── leave-service/         # gRPC: leave requests and approvals
│   ├── recruitment-service/   # gRPC: jobs, applications, interviews
│   ├── hrm-service/           # gRPC: appraisals, policies, HR activities
│   ├── salary-service/        # gRPC: salary structures, payslips
│   ├── analytics-service/     # gRPC: workforce and business analytics
│   ├── notification-service/  # gRPC: FCM tokens, push dispatch
│   └── scheduler-service/     # BullMQ workers (cron jobs, background tasks)
│
├── packages/
│   ├── proto-definitions/     # .proto files + generated TS types
│   ├── database/              # Prisma schema + client
│   ├── cache/                 # Redis client + TTL helpers
│   ├── queue/                 # BullMQ connection + job types
│   ├── crypto/                # AES-256 field encryption
│   ├── logger/                # Winston structured logger
│   ├── common/                # API response helpers
│   ├── grpc-client/           # gRPC channel factory
│   ├── grpc-server/           # gRPC server bootstrap
│   ├── websocket/             # Socket.IO config
│   ├── firebase/              # FCM helpers
│   ├── schemas/               # Zod schemas
│   ├── ui/                    # Shared React components
│   ├── auth/                  # Client auth helpers
│   ├── webauthn/              # WebAuthn client helpers
│   ├── constants/             # Shared constants
│   ├── shortcuts/             # Keyboard shortcut map
│   ├── validation-utils/      # Validation patterns
│   └── typescript-config/     # Base tsconfig presets
│
├── docker/
│   ├── base.Dockerfile        # Multi-stage build for all Node services
│   ├── web.Dockerfile         # Multi-stage build for the React frontend
│   └── nginx.conf             # nginx config for the web container
│
├── docker-compose.local.yml   # Local dev (includes MongoDB + Redis)
├── docker-compose.dev.yml     # Dev environment (no infra, uses remote)
├── docker-compose.ci.yml      # CI build and smoke test
├── docker-compose.prod.yml    # Production (pulls images from registry)
├── turbo.json                 # Turborepo task graph
├── pnpm-workspace.yaml
└── GIT_HOOKS.md               # Git hooks documentation
```

---

## Prerequisites

| Tool                             | Version                                |
| -------------------------------- | -------------------------------------- |
| Node.js                          | ≥ 18                                   |
| pnpm                             | 8.15.6 (set by `packageManager` field) |
| Docker + Docker Compose          | For containerised local dev            |
| `protoc` + `protoc-gen-ts_proto` | For regenerating gRPC types            |

Install `protoc` on macOS:

```bash
brew install protobuf
```

Install the pnpm version declared in `package.json`:

```bash
corepack enable
corepack prepare pnpm@8.15.6 --activate
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

Copy the example env file and fill in the values:

```bash
cp .env.example .env
```

Required variables are documented in `.env.example`. You will need:

- MongoDB connection string
- Redis connection details
- JWT secrets (access + refresh, separate keys)
- Google OAuth credentials (client ID + secret + callback URL)
- Firebase service account (for FCM)
- AWS credentials (for Secrets Manager in production)

### 3. Generate protobuf types

```bash
pnpm proto:gen
```

This runs `protoc` against all `.proto` files in `packages/proto-definitions/src/proto/` and outputs TypeScript bindings to `packages/proto-definitions/src/generated/`.

### 4. Set up SSL certificates for local HTTPS

The API gateway and web dev server both run on HTTPS locally. Place your certificates in `packages/certificates/`:

```
packages/certificates/
├── cert.pem
└── key.pem
```

Generate a self-signed certificate for local development:

```bash
openssl req -x509 -newkey rsa:4096 -keyout packages/certificates/key.pem \
  -out packages/certificates/cert.pem -days 365 -nodes \
  -subj "/CN=localhost"
```

### 5. One-shot project bootstrap

```bash
pnpm setup:project
```

This runs `proto:gen → db:generate → build` in dependency order.

---

## Development

Start all services and the frontend concurrently with Turborepo:

```bash
pnpm dev
```

Turborepo runs up to 20 tasks concurrently and streams logs with its TUI. Individual service URLs in development:

| Service            | URL                                            |
| ------------------ | ---------------------------------------------- |
| Web (React)        | `https://localhost:5173`                       |
| API Gateway        | `https://localhost:9002`                       |
| API Docs (Swagger) | `https://localhost:9002/api-docs`              |
| Prisma Studio      | `http://localhost:5555` (run `pnpm db:studio`) |

### Useful commands

```bash
# Build all packages
pnpm build

# Format all files with Prettier
pnpm format

# Push Prisma schema changes to MongoDB
pnpm db:push

# Run database seed
pnpm db:seed

# Open Prisma Studio
pnpm db:studio

# Build and analyze frontend bundle
cd apps/web && pnpm analyze
```

---

## Building for Production

Turborepo builds packages in topological order (dependencies first):

```bash
pnpm build
```

The frontend build pipeline (`apps/web`) runs:

1. `build:wasm` — compiles any WASM modules
2. `vite build` — bundles and splits the React app
3. `optimize-images` — generates responsive image variants with sharp
4. `workbox injectManifest` — injects the precache manifest into the service worker
5. `optimize-css-loading` — converts blocking CSS links to preloaded async links
6. `purge-css` — removes unused CSS rules from the output bundles

Output lands in `apps/web/dist/`.

---

## Docker

All Docker operations go through a single script invoked via `pnpm docker <command> [service]`.

### Commands

| Command                             | Description                                  |
| ----------------------------------- | -------------------------------------------- |
| `pnpm docker build [service]`       | Build image(s) using the layer cache         |
| `pnpm docker build:force [service]` | Build image(s) with `--no-cache`             |
| `pnpm docker up [service]`          | Start MongoDB + Redis, then container(s)     |
| `pnpm docker down [service]`        | Stop and remove all containers (or stop one) |
| `pnpm docker push [service]`        | Push image(s) to Docker Hub                  |

Omit `[service]` to target all services. When a service name is provided, only that container is affected.

### Common workflows

**First-time setup / fresh environment:**

```bash
pnpm docker build:force    # build all images from scratch
pnpm docker up             # start MongoDB + Redis, then all services
```

**Day-to-day development:**

```bash
pnpm docker up             # start everything
pnpm docker down           # stop and clean up
```

**Work on a single service:**

```bash
pnpm docker build api-gateway      # rebuild one image
pnpm docker up api-gateway         # start it
pnpm docker down api-gateway       # stop it
```

**Publish images to Docker Hub:**

```bash
pnpm docker build:force    # build fresh images
pnpm docker push           # push all to Docker Hub (ysam090/hrms-*)

pnpm docker push web       # or push a single image
```

### Service names

| Service      | Name to pass           |
| ------------ | ---------------------- |
| API Gateway  | `api-gateway`          |
| Auth         | `auth-service`         |
| User         | `user-service`         |
| Employee     | `employee-service`     |
| Attendance   | `attendance-service`   |
| Leave        | `leave-service`        |
| Recruitment  | `recruitment-service`  |
| HRM          | `hrm-service`          |
| Salary       | `salary-service`       |
| Analytics    | `analytics-service`    |
| Notification | `notification-service` |
| Scheduler    | `scheduler-service`    |
| Frontend     | `web`                  |

### How the Dockerfiles work

**`base.Dockerfile`** (all backend services):

1. `pruner` — `turbo prune --scope=<service>` produces a minimal subtree with only the files needed for that service
2. `builder` — installs pruned deps, generates protos + Prisma client, compiles TypeScript
3. `runner` — copies only the production build, drops dev deps, runs as a non-root user

**`web.Dockerfile`** (frontend):

1. `pruner` — same Turborepo pruning for the `web` scope
2. `builder` — installs deps, runs the full Vite build pipeline
3. `runner` — copies `dist/` into an nginx:alpine image, no Node.js at runtime

---

## Git Conventions

This repo enforces conventions via Husky git hooks. See [GIT_HOOKS.md](./GIT_HOOKS.md) for full details.

### Branch naming

```
<type>/<description>

feat/leave-balance-api
fix/session-expiry-on-refresh
chore/update-dependencies
```

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `hotfix`, `release`

Protected branches (no prefix required): `main`, `dev`

### Commit messages — Conventional Commits

```
<type>[optional scope]: <description>

feat: add biometric login via WebAuthn
fix(auth): clear refresh token on logout
chore: update pnpm lockfile
refactor(salary): extract component calculation helpers
```

The `pre-commit` hook auto-formats staged files with Prettier before the commit is created. No manual formatting step needed.

### Bypass (use sparingly)

```bash
HUSKY=0 git commit -m "chore: emergency fix"
```
