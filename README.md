# HRMS — Human Resource Management System

A full-stack, production-grade HRMS built as a **pnpm monorepo**. The backend is a **microservices architecture** communicating over gRPC, fronted by a single API gateway. The frontend is a React SPA served by nginx.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [AI Features](#ai-features)
- [Security](#security)
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

HRMS covers the core lifecycle of an employee — from onboarding (KYC, biometric registration) to exit (resignation, feedback). Key functional areas:

- **Employee management** — profiles, KYC, org tree, designations
- **Attendance** — mark attendance, corrections, reports
- **Leave** — apply, approve/reject, leave balance tracking
- **Payroll** — salary structures, components, payslips
- **Recruitment** — job openings, applications, AI resume scoring, interview scheduling
- **HR activities** — appraisals, feedback, policies, events
- **Analytics** — workforce, attendance, salary, recruitment dashboards
- **Notifications** — real-time push (FCM) and in-app (Socket.IO)
- **Permissions** — role-based access control, teams
- **AI Chatbot** — HRMS-scoped assistant powered by a local Ollama model
- **Security** — login risk scoring, impossible-travel detection, anomaly email alerts

---

## Architecture

```
                        ┌─────────────────┐
                        │   React (web)   │  Vite + nginx
                        └────────┬────────┘
                                 │ HTTPS / REST + SSE
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

      ┌─────────────────────────────────────────────────────────────┐
      │                   Shared Infrastructure                      │
      │   MongoDB (Prisma)   Redis   Firebase (FCM)   Ollama (AI)   │
      └─────────────────────────────────────────────────────────────┘

      ┌─────────────────────────────────────────────────────────────┐
      │                     Observability                            │
      │        Prometheus  ·  Grafana  ·  Loki  ·  CloudWatch       │
      └─────────────────────────────────────────────────────────────┘
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
| `@hrms/logger`           | Winston logger + prom-client metrics server (structured JSON)      |
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
- Access token stored in `localStorage` and proactively refreshed 60 seconds before expiry; also refreshed on tab `visibilitychange`
- Refresh token: `httpOnly; Secure; SameSite=Strict; Path=/api/refresh-token` — inaccessible to JavaScript, scoped to the one endpoint that needs it
- Google OAuth 2.0: gateway redirects to Google, callback issues JWT tokens and redirects the browser back into the SPA
- Hidden admin fallback: username + password, separate endpoint, not exposed in the UI
- Every login (WebAuthn or OAuth) is scored for risk and triggers an alert email if anomalous

**Real-time**
Socket.IO is configured via `@hrms/websocket` and attached to the API gateway's HTTPS server. Chat, notifications, and presence use named rooms per user.

**HTTP client (frontend)**
The axios instance in `apps/web` has a layered interceptor pipeline:

- **Token refresh** — proactively refreshes the JWT 60 s before expiry; concurrent requests share a single in-flight refresh promise
- **CSRF** — fetches a double-submit token lazily on the first mutating request; token is invalidated on logout and after a 403
- **AbortController** — every request is tracked in a registry; GET requests to the same URL supersede the previous in-flight call automatically; `cancelAllPendingRequests()` is called on logout to avoid stale callbacks
- **Idempotency keys** — POST/PUT/PATCH automatically receive a `Idempotency-Key` UUID header; the key is preserved on auth/CSRF retries so the server sees the same key for all attempts

---

## Tech Stack

| Layer              | Technology                                                    |
| ------------------ | ------------------------------------------------------------- |
| Frontend           | React 18, Vite 8, TypeScript, MUI v6, PrimeReact v10          |
| State / forms      | React Context, Formik, Zod                                    |
| API gateway        | Node.js, Express, gRPC-js, Socket.IO                          |
| Microservices      | Node.js, TypeScript, gRPC                                     |
| ORM                | Prisma (MongoDB provider)                                     |
| Database           | MongoDB                                                       |
| Cache / sessions   | Redis (ioredis)                                               |
| Job queue          | BullMQ                                                        |
| Push notifications | Firebase Cloud Messaging                                      |
| AI inference       | Ollama (local LLM server, default model: `qwen2.5-coder:14b`) |
| Observability      | Prometheus, Grafana, Loki, Winston, CloudWatch                |
| Build system       | Turborepo, pnpm workspaces                                    |
| Containerisation   | Docker, nginx                                                 |
| Code quality       | Husky, Prettier, Conventional Commits                         |

---

## AI Features

### HRMS Chatbot

An AI assistant available to every employee, powered by a locally-running Ollama instance. The chatbot is scoped exclusively to HR topics — it refuses off-topic questions.

**How it works:**

1. The frontend sends the user's message and up to 10 messages of conversation history to `POST /api/chatbot/message`.
2. The gateway runs a **tool-calling loop** (up to 5 iterations) against Ollama: if the model requests data, the gateway executes the corresponding tool against the database and feeds the result back.
3. Once the model has all the data it needs, the final answer is streamed back to the browser as **Server-Sent Events** (`text/event-stream`).

**Available tools** (all scoped to the authenticated user's own data):

| Tool                   | Data fetched                                        |
| ---------------------- | --------------------------------------------------- |
| `get_user_profile`     | Name, DOB, blood group, department, designation     |
| `get_leave_balance`    | Remaining leave by type (paid, sick, casual, etc.)  |
| `get_leave_applications` | Recent leave history with status                  |
| `get_attendance`       | Attendance records and summary for any month        |
| `get_salary_info`      | Salary components, deductions, latest payslip       |
| `get_policies`         | Company HR policies, searchable by keyword          |

Privacy rules are enforced at the prompt level: the chatbot will never reveal another employee's personal data.

**Configuration:**

```env
OLLAMA_URL=http://localhost:11434   # Ollama server address
OLLAMA_MODEL=qwen2.5-coder:14b     # Model to use
```

### AI Resume Scoring

When a candidate submits a job application via `POST /api/apply-for-job`, a BullMQ job is enqueued in the background (fire-and-forget). The `resumeParser` worker in `recruitment-service`:

1. Extracts text from the uploaded resume PDF using `pdf-parse`.
2. Sends the resume text, job title, required skills, job description, and minimum experience to Ollama.
3. Ollama returns a score (0–10) and a brief explanation.
4. The score and notes are persisted back to `JobApplication.resumeScore` / `JobApplication.aiNotes`.
5. Applications scoring below the threshold (default 7/10) are automatically moved to `Rejected`.

This runs entirely asynchronously — the candidate receives an immediate confirmation while scoring happens in the background.

---

## Security

### Google OAuth 2.0

`GET /api/auth/google` redirects the browser to Google's authorization endpoint. After the user consents, Google redirects to `GET /api/auth/google/callback`, which exchanges the code for tokens, looks up or provisions the user account, issues JWT access/refresh tokens, and redirects the browser back into the SPA.

### WebAuthn (Passkeys)

Employees can register a passkey (biometric or hardware key) as their primary login method. The registration and authentication flows follow the WebAuthn Level 2 spec. Once enrolled, the login page skips the OAuth redirect entirely and uses the passkey prompt instead.

### Login Risk Analysis

Every successful login — whether via Google OAuth or WebAuthn — is scored against the user's login history using six weighted signals:

| Signal              | Weight | Description                                              |
| ------------------- | ------ | -------------------------------------------------------- |
| Impossible travel   | 60     | >500 km displacement in under 6 hours (Haversine)        |
| New country         | 35     | First sign-in from this country                          |
| New device          | 20     | Unrecognized browser/device fingerprint                  |
| Unusual hour        | 15     | Login time falls in a rarely-used 3-hour bucket          |
| New IP subnet       | 10     | First sign-in from this /24 subnet                       |
| New auth method     | 10     | First use of this login method (OAuth vs passkey)        |

- Score ≥ 30 → notification email sent to the user with login details
- Score ≥ 50 → email is flagged as **Suspicious Sign-In Detected** with a warning banner

The first-ever login from a new account scores 0 (no baseline to compare against).

### CSRF Protection

All mutating requests (POST / PUT / PATCH / DELETE) require a `x-csrf-token` header. The token is fetched lazily from `GET /csrf-token` and cached in memory. Concurrent fetches are deduplicated so the server sets exactly one cookie per logical fetch. Tokens are invalidated on logout and automatically re-fetched on a 403 response.

---

## Observability

### Metrics (Prometheus + Grafana)

Every service in the monorepo exposes a Prometheus `/metrics` endpoint on a dedicated `METRICS_PORT` sidecar (separate from the main service port). Metrics are collected via `prom-client` in `@hrms/logger` and include:

- **`http_request_duration_ms`** — histogram of HTTP request latency by method, route, status, and service
- **`http_requests_total`** — counter of HTTP requests
- **`grpc_request_duration_ms`** — histogram of gRPC call latency by method and service
- **`grpc_requests_total`** — counter of gRPC calls
- Default Node.js process metrics (CPU, memory, event loop lag) via `collectDefaultMetrics`

Prometheus scrapes all services, and Grafana reads from Prometheus. A pre-built dashboard (`monitoring/grafana/dashboards/hrms.json`) is provisioned automatically.

### Logs (Loki + CloudWatch)

Logs are shipped in parallel to two backends depending on environment:

- **Loki** (local / dev) — when `LOKI_URL` is set, Winston sends structured JSON logs to Loki via `winston-loki`. Grafana queries Loki alongside Prometheus on the same dashboard.
- **CloudWatch** (production) — `winston-cloudwatch` ships logs to AWS CloudWatch Logs under `/hrms/<service>/<env>`. Retention is 90 days in production and 7 days in dev.

### Monitoring stack (local)

The monitoring stack (Prometheus + Loki + Grafana) runs as a separate Docker Compose file and starts automatically with `pnpm dev`:

```bash
# Start monitoring stack manually
docker compose -f docker-compose.monitoring.yml up -d

# Stop it
pnpm monitoring:stop
```

| Service    | URL                       | Credentials    |
| ---------- | ------------------------- | -------------- |
| Grafana    | `http://localhost:3000`   | admin / admin  |
| Prometheus | `http://localhost:9090`   | —              |
| Loki       | `http://localhost:3100`   | —              |

The Grafana dashboard is also accessible from within the app itself — the frontend reads from Prometheus directly via the `/prometheus` proxy path and renders live charts in the monitoring section.

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
│   ├── recruitment-service/   # gRPC: jobs, applications, AI resume scoring, interviews
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
│   ├── logger/                # Winston logger + prom-client metrics sidecar
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
├── monitoring/
│   ├── prometheus.yml             # Prometheus scrape config (Docker)
│   ├── prometheus-local.yml       # Prometheus scrape config (local dev)
│   ├── loki-config.yml            # Loki storage config
│   └── grafana/
│       ├── provisioning/          # Auto-provisioned datasources + dashboards
│       └── dashboards/hrms.json   # Pre-built HRMS Grafana dashboard
│
├── docker/
│   ├── base.Dockerfile        # Multi-stage build for all Node services
│   ├── web.Dockerfile         # Multi-stage build for the React frontend
│   └── nginx.conf             # nginx config for the web container
│
├── docker-compose.local.yml      # Local dev (includes MongoDB + Redis)
├── docker-compose.dev.yml        # Dev environment (no infra, uses remote)
├── docker-compose.ci.yml         # CI build and smoke test
├── docker-compose.prod.yml       # Production (pulls images from registry)
├── docker-compose.monitoring.yml # Prometheus + Loki + Grafana stack
├── turbo.json                    # Turborepo task graph
├── pnpm-workspace.yaml
└── GIT_HOOKS.md                  # Git hooks documentation
```

---

## Prerequisites

| Tool                             | Version                                |
| -------------------------------- | -------------------------------------- |
| Node.js                          | ≥ 18                                   |
| pnpm                             | 8.15.6 (set by `packageManager` field) |
| Docker + Docker Compose          | For containerised local dev            |
| `protoc` + `protoc-gen-ts_proto` | For regenerating gRPC types            |
| Ollama                           | For AI chatbot and resume scoring      |

Install `protoc` on macOS:

```bash
brew install protobuf
```

Install the pnpm version declared in `package.json`:

```bash
corepack enable
corepack prepare pnpm@8.15.6 --activate
```

Install and start Ollama:

```bash
# Install from https://ollama.com
ollama pull qwen2.5-coder:14b
ollama serve
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
- `OLLAMA_URL` and `OLLAMA_MODEL` (for AI chatbot and resume scoring)
- `LOKI_URL` (optional, for local log shipping to Loki)
- `METRICS_PORT` per service (for Prometheus scraping)

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
| Grafana            | `http://localhost:3000` (admin / admin)        |
| Prometheus         | `http://localhost:9090`                        |
| Loki               | `http://localhost:3100`                        |

The monitoring stack (Prometheus + Loki + Grafana) starts automatically alongside `pnpm dev`. To stop it independently:

```bash
pnpm monitoring:stop
```

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
