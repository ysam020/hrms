# HRMS — Human Resource Management System

A full-stack, production-grade, **multi-tenant** HRMS built as a **pnpm monorepo**. The backend is a microservices architecture communicating over gRPC, fronted by a single API gateway. The frontend is a React SPA with offline support via IndexedDB and a service worker.

---

## What HRMS Covers

HRMS manages the complete employee lifecycle — from onboarding (KYC, biometric registration) to exit (resignation and full-and-final settlement) — across multiple organisations, each with full data isolation.

| Domain                  | What it does                                                                |
| ----------------------- | --------------------------------------------------------------------------- |
| **Multi-Tenancy**       | Database-per-tenant silo; each org gets its own MongoDB database            |
| **Employee Management** | Profiles, KYC verification, org tree, designations                          |
| **Attendance**          | Daily check-in/out, geofencing, corrections, WFH, reports                   |
| **Leave**               | Applications, approval workflow, balance tracking, custom leave types       |
| **Payroll**             | Salary structures, components, payslip generation and PDF export            |
| **Recruitment**         | Job openings, applications, AI resume scoring, interview scheduling         |
| **HR Activities**       | Appraisals, feedback, events, announcements                                 |
| **Policies**            | HR document management with PDF generation and download                     |
| **Business Rules**      | Visual rule builder, conditions/actions, dry-run testing, scheduling        |
| **Tenant Settings**     | Time-versioned leave quotas, attendance thresholds, geofence config         |
| **Analytics**           | Workforce, attendance, salary and recruitment dashboards (Protobuf)         |
| **Notifications**       | Real-time push (Firebase FCM) and in-app (Socket.IO + IndexedDB)            |
| **Chat**                | Direct messaging, file attachments, offline queue, link previews            |
| **AI Chatbot**          | HRMS-scoped assistant with tool calling (Ollama + SSE)                      |
| **AI Insights**         | On-demand analytical streaming reports per module                           |
| **Security**            | WebAuthn passkeys, login risk scoring, audit logs, AES-256 field encryption |
| **Billing**             | Razorpay subscription lifecycle with grace period handling                  |
| **Developer Mode**      | WebAuthn-verified access to live log streaming                              |

---

## Wiki Pages

### Getting started

- [Getting Started](Getting-Started) — prerequisites, setup, local development, first-time tenant setup

### Architecture & design

- [Architecture Overview](Architecture-Overview) — system diagram, multi-tenancy silo model, `prismaWithTenant`, two-tier cache, subscription lifecycle
- [Microservices](Microservices) — each gRPC service, its port, responsibilities, and gateway-direct routes
- [Database Schema](Database-Schema) — master vs tenant databases, all Prisma/MongoDB models
- [Shared Packages](Shared-Packages) — workspace packages and what they export

### Features

- [Authentication](Authentication) — WebAuthn, Google OAuth, pending setup flow, multi-tenant user context, risk scoring
- [API Reference](API-Reference) — every REST endpoint grouped by domain
- [Real-time Features](Real-time-Features) — Socket.IO chat, notifications, AI/SSE streaming
- [Background Jobs](Background-Jobs) — BullMQ queues, cron schedules, AI resume scoring, Razorpay webhook processing

### Frontend

- [Frontend Architecture](Frontend-Architecture) — React app structure, IndexedDB stores, Web Workers, PWA, HTTP client

### Operations

- [Deployment](Deployment) — Docker images, compose variants, environment variables, scaling, observability
- [Contributing](Contributing) — branch naming, commit conventions, git hooks, code style

---

## Quick Start

```bash
git clone <repo-url> && cd hrms
pnpm install
cp .env.example .env   # fill in values
pnpm setup:project     # proto:gen → db:generate → build
pnpm dev               # start all services
```

| URL                               | Purpose        |
| --------------------------------- | -------------- |
| `https://localhost:5173`          | React frontend |
| `https://localhost:9002`          | API gateway    |
| `https://localhost:9002/api-docs` | Swagger UI     |
| `http://localhost:5555`           | Prisma Studio  |

After signing in for the first time, follow the org setup wizard to create your organisation and activate a Razorpay subscription (use test mode keys for development).
