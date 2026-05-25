# Shared Packages

All cross-cutting concerns live in `packages/`. Each package is a pnpm workspace package with its own `package.json`, `tsconfig.json`, and build pipeline. Services import them as `@hrms/<name>`.

```
packages/
├── cache/              → @hrms/cache
├── certificates/       → dev TLS certs (not a published package)
├── common/             → @hrms/common
├── crypto/             → @hrms/crypto
├── database/           → @hrms/db
├── firebase/           → @hrms/firebase
├── grpc-client/        → @hrms/grpc-client
├── grpc-server/        → @hrms/grpc-server
├── logger/             → @hrms/logger
├── proto-definitions/  → @hrms/proto
├── queue/              → @hrms/queue
├── typescript-config/  → @hrms/typescript-config
└── websocket/          → @hrms/websocket
```

---

## @hrms/db

**Path:** `packages/database/`

The most important shared package. Exports:

- `prisma` — raw Prisma client connected to the **master** database.
- `prismaWithTenant` — federated proxy that routes queries to the correct physical database based on the current tenant context (see [Architecture Overview](Architecture-Overview)).
- `runWithTenant(tenantId, tenantClient, fn)` — sets up `AsyncLocalStorage` context for a request.
- `getClientForDb(dbName)` — returns (or lazily creates) a `PrismaClient` for a tenant's database.
- All generated Prisma types re-exported for use across services.

```typescript
import {
  prisma,
  prismaWithTenant,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";

// Master DB — direct Prisma access (use only for cross-tenant platform operations)
const tenant = await prisma.tenant.findUnique({ where: { slug } });

// Tenant DB — routes to the active tenant's database via AsyncLocalStorage
const leaves = await prismaWithTenant.leaveApplication.findMany({
  where: { status: "Pending" },
});
```

The Prisma schema (`src/prisma/schema.prisma`) is the single source of truth for the MongoDB schema. After any schema change:

```bash
pnpm db:generate   # regenerate Prisma client
pnpm db:push       # apply changes to the database
```

**`prismaWithTenant` routing table:**

| Model                                        | Routes to                           |
| -------------------------------------------- | ----------------------------------- |
| `user`                                       | Master DB (auto-injects `tenantId`) |
| `tenant`, `tenantMembership`, `tenantInvite` | Master DB (plain)                   |
| All business models                          | Tenant DB via `getClientForDb`      |

---

## @hrms/cache

**Path:** `packages/cache/`

Two-tier cache: **L1 in-process LRU** (max 1,000 entries) + **L2 Redis** (`ioredis`). Designed so Redis failures are transparent — the cache falls back to L1 and requests continue.

```typescript
import { CacheManager } from "@hrms/cache";

const cache = new CacheManager();

await cache.set("attendance:123", data, "attendance"); // uses entity TTL
const hit = await cache.get("attendance:123"); // L1 → L2 → undefined
await cache.invalidatePattern("attendance:*"); // SCAN-based, non-blocking
```

**Entity TTLs:**

| Entity         | TTL    |
| -------------- | ------ |
| `notification` | 5 min  |
| `attendance`   | 30 min |
| `leave`        | 1 h    |
| `employee`     | 2 h    |
| `salary`       | 4 h    |
| `holiday`      | 24 h   |

Also used for:

- **Refresh tokens** — keyed `refresh:<userId>`, 7-day TTL
- **WebAuthn challenges** — short TTL (5 min)
- **Razorpay plan ID cache** — in-process → Redis → Razorpay API
- **Rate limiter state** — via Express rate-limiter Redis store

---

## @hrms/queue

**Path:** `packages/queue/`

BullMQ connection factory and job type definitions.

```typescript
import { emailQueue, schedulerQueue } from "@hrms/queue";

// Add a cron job
await schedulerQueue.add(
  "reconcileAttendance",
  { jobName: "reconcileAttendance" },
  {
    repeat: { pattern: "15 0 * * *" },
    removeOnComplete: true,
  },
);

// Add an async email job
await emailQueue.add("send-kyc-reminder", {
  to: email,
  template: "kyc-reminder",
});
```

**Queues:**

| Queue               | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `emailQueue`        | Transactional email dispatch (KYC reminders, login alerts, etc.) |
| `notificationQueue` | FCM push notification dispatch                                   |
| `schedulerQueue`    | Recurring cron jobs + async background tasks                     |

Exports `SchedulerJobName` (union type of valid job names) and `createWorker(queueName, processor)` factory.

---

## @hrms/crypto

**Path:** `packages/crypto/`

AES-256 encryption/decryption for sensitive fields.

```typescript
import { aesEncrypt, aesDecrypt, safeDecrypt } from "@hrms/crypto";

const ciphertext = aesEncrypt(plainMobile, process.env.FIELD_ENCRYPTION_KEY!);
const plaintext = aesDecrypt(ciphertext, process.env.FIELD_ENCRYPTION_KEY!);

// safeDecrypt returns the value as-is if decryption fails — safe for migrating
// unencrypted legacy data
const value = safeDecrypt(fieldValue, process.env.FIELD_ENCRYPTION_KEY!);
```

**Encrypted fields:** `mobile`, `aadhar_no`, `pan_no`, `bank_account_no`, and related PII on `User`. Any new PII field must be added here — see [Contributing](Contributing).

---

## @hrms/logger

**Path:** `packages/logger/`

Winston logger with structured JSON output in production and pretty-print in development.

```typescript
import { logger, apiRequestLogger } from "@hrms/logger";

logger.info("User logged in", { username, ip });
logger.error("gRPC call failed", { service: "employee-service", error });

// Express middleware — logs all incoming requests
app.use(apiRequestLogger);
```

Log output format: `{ level, message, timestamp, service, ...context }`. In production, logs are shipped to AWS CloudWatch or Loki depending on the deployment target.

---

## @hrms/common

**Path:** `packages/common/`

Standardised API response helper and status code enum.

```typescript
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

return apiResponse(res, RESPONSE_STATUS.SUCCESS, { user });
return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, null);
return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, null);
```

Response envelope:

```json
{ "success": true, "data": { … } }
{ "success": false, "message": "Not Found", "status": 404 }
```

Also exports `handleError(res, err)` — maps Prisma error codes to HTTP responses:

| Prisma code | HTTP status | Description                |
| ----------- | ----------- | -------------------------- |
| `P2002`     | 409         | Unique constraint violated |
| `P2025`     | 404         | Record not found           |
| `P2003`     | 400         | Invalid reference          |

All gateway handler `catch` blocks must call `handleError` rather than constructing responses inline.

---

## @hrms/grpc-server

**Path:** `packages/grpc-server/`

Bootstrap helper used by every microservice to start its gRPC server.

```typescript
import { BaseGrpcServer } from "@hrms/grpc-server";

class EmployeeServer extends BaseGrpcServer {
  constructor() {
    super();
    this.addService(EmployeeServiceService, handlers);
  }
}

const server = new EmployeeServer();
server.start(`0.0.0.0:${PORT}`);
```

TLS is enabled automatically when `GRPC_TLS_CRT_FILE` and `GRPC_TLS_KEY_FILE` are set (or when `packages/certificates/` files are present). Falls back to insecure if neither is available.

---

## @hrms/grpc-client

**Path:** `packages/grpc-client/`

gRPC channel factory used by the API gateway to connect to microservices.

```typescript
import { BaseGrpcClient } from "@hrms/grpc-client";

const client = new BaseGrpcClient({
  serviceName: "employee-service",
  address: `localhost:${process.env.EMPLOYEE_SERVICE_PORT}`,
});

const result = await client.makeCall("getEmployee", { username });
```

TLS credentials are auto-configured from `GRPC_TLS_CA_FILE` or `packages/certificates/rootCA.pem`. Falls back to insecure if absent.

The gateway also forwards tenant context to microservices via gRPC metadata headers — `x-tenant-id` and `x-db-name` — extracted from `gatewayTenantStorage` (the `AsyncLocalStorage` store set up by the `authenticate` middleware).

---

## @hrms/websocket

**Path:** `packages/websocket/`

Socket.IO server configuration with Redis adapter, JWT authentication middleware, and namespace setup.

```typescript
import { configureSocketIO } from "@hrms/websocket";

const { io } = configureSocketIO(httpsServer, [CLIENT_URL], resolveUsername);
```

Sets up:

- **Redis adapter** (`@socket.io/redis-adapter`) for multi-instance state sharing.
- **Auth middleware** — verifies JWT in `socket.handshake.auth.token`; rejects on failure.
- **Namespaces** — `chat` and `notifications`.
- **Rooms** — each user auto-joins `user:<username>` on connect.

---

## @hrms/firebase

**Path:** `packages/firebase/`

Firebase Admin SDK helpers for FCM push notifications.

```typescript
import { sendPushNotification } from "@hrms/firebase";

await sendPushNotification({
  token: deviceFcmToken,
  title: "Leave Approved",
  body: "Your leave application has been approved.",
});
```

---

## @hrms/proto

**Path:** `packages/proto-definitions/`

Contains `.proto` files and the TypeScript types/service stubs generated from them.

```
packages/proto-definitions/src/
├── proto/
│   ├── auth/auth.proto
│   ├── employee/employee.proto
│   ├── attendance/attendance.proto
│   └── … (one directory per service)
└── generated/             ← auto-generated — do not edit manually
    ├── auth/auth.ts
    └── …
```

Regenerate after editing any `.proto` file:

```bash
pnpm proto:gen
```

---

## @hrms/typescript-config

**Path:** `packages/typescript-config/`

Base `tsconfig.json` presets shared across all packages:

| File         | Extends | Target env       |
| ------------ | ------- | ---------------- |
| `base.json`  | —       | Common options   |
| `node.json`  | base    | Node.js services |
| `react.json` | base    | React/Vite apps  |

---

## packages/certificates

**Path:** `packages/certificates/`

Self-signed TLS certificates for local development. Not a published npm package — referenced by file path in the service startup scripts.

```
packages/certificates/
├── cert.pem     ← server certificate
├── key.pem      ← private key
└── rootCA.pem   ← root CA (imported by grpc-client for mTLS)
```

In production, replace with certificates from a trusted CA or use AWS ACM / Let's Encrypt.
