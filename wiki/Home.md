# HRMS — Human Resource Management System

A full-stack, production-grade HRMS built as a **pnpm monorepo**. The backend is a **microservices architecture** communicating over gRPC, fronted by a single API gateway. The frontend is a React SPA served by nginx.

---

## What HRMS covers

HRMS manages the complete employee lifecycle — from onboarding (KYC, biometric registration) to exit (resignation and full-and-final settlement).

| Domain                  | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| **Employee Management** | Profiles, KYC verification, org tree, designations         |
| **Attendance**          | Daily check-in/out, corrections, shift management, reports |
| **Leave**               | Applications, approval workflow, balance tracking          |
| **Payroll**             | Salary structures, components, payslip generation          |
| **Recruitment**         | Job openings, applications, interview scheduling           |
| **HR Activities**       | Appraisals, feedback, policies, events, announcements      |
| **Analytics**           | Workforce, attendance, salary and recruitment dashboards   |
| **Notifications**       | Real-time push (Firebase FCM) and in-app (Socket.IO)       |
| **Chat**                | Direct messaging with file attachments                     |
| **Permissions**         | Role-based access control, teams, business rules           |

---

## Wiki Pages

### Getting started

- [Getting Started](Getting-Started) — prerequisites, setup, local development commands

### Architecture & design

- [Architecture Overview](Architecture-Overview) — system diagram, key design decisions, shared packages
- [Microservices](Microservices) — each gRPC service, its port, and responsibilities
- [Database Schema](Database-Schema) — all Prisma/MongoDB models and their fields
- [Shared Packages](Shared-Packages) — workspace packages and what they export

### Features

- [Authentication](Authentication) — WebAuthn, Google OAuth, JWT lifecycle, admin fallback
- [API Reference](API-Reference) — every REST endpoint grouped by domain
- [Real-time Features](Real-time-Features) — Socket.IO chat, notifications, presence
- [Background Jobs](Background-Jobs) — BullMQ queues, cron schedules, job processing

### Frontend

- [Frontend Architecture](Frontend-Architecture) — React app structure, routing, state, HTTP client

### Operations

- [Deployment](Deployment) — Docker images, compose variants, environment variables
- [Contributing](Contributing) — branch naming, commit conventions, git hooks

---

## Quick-start

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
