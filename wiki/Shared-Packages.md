# Shared Packages

All cross-cutting concerns live in `packages/`. Each package is a pnpm workspace package with its own `package.json`, `tsconfig.json`, and build pipeline. Services import them as `@hrms/<name>`.

---

## @hrms/db

**Path:** `packages/database/`

Exports a singleton Prisma client used by every service that needs database access.

```typescript
import { prisma } from "@hrms/db";

const user = await prisma.user.findUnique({ where: { username } });
```

The Prisma schema (`src/prisma/schema.prisma`) is the single source of truth for the MongoDB schema. After any schema change:

```bash
pnpm db:generate   # regenerate Prisma client
pnpm db:push       # apply changes to the database
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
└── generated/                  ← auto-generated, do not edit
    ├── auth/auth.ts
    └── …
```

Regenerate after editing any `.proto` file:

```bash
pnpm proto:gen
```

---

## @hrms/cache

**Path:** `packages/cache/`

Wraps `ioredis` with a per-entity TTL strategy and helper functions.

```typescript
import { cache } from "@hrms/cache";

await cache.set("refresh:<userId>", token, { ex: 60 * 60 * 24 * 7 });
const token = await cache.get("refresh:<userId>");
await cache.del("refresh:<userId>");
```

Used by:

- auth-service — refresh tokens, WebAuthn challenges
- API gateway — rate limiter state, CSRF secrets

---

## @hrms/queue

**Path:** `packages/queue/`

BullMQ connection factory and job type definitions.

```typescript
import { emailQueue, notificationQueue, schedulerQueue } from "@hrms/queue";

await emailQueue.add("send-kyc-reminder", {
  to: email,
  template: "kyc-reminder",
});
```

Exports:

- `emailQueue` — BullMQ Queue instance
- `notificationQueue` — BullMQ Queue instance
- `schedulerQueue` — BullMQ Queue instance
- `SchedulerJobName` — union type of valid scheduler job names
- `createWorker(queueName, processor)` — factory for BullMQ Worker instances

---

## @hrms/crypto

**Path:** `packages/crypto/`

AES-256 encryption/decryption for sensitive fields.

```typescript
import { aesEncrypt, aesDecrypt, safeDecrypt } from "@hrms/crypto";

const ciphertext = aesEncrypt(plainMobile, process.env.FIELD_ENCRYPTION_KEY);
const plaintext = aesDecrypt(ciphertext, process.env.FIELD_ENCRYPTION_KEY);

// safeDecrypt returns plaintext as-is if decryption fails (migration safety)
const value = safeDecrypt(fieldValue, process.env.FIELD_ENCRYPTION_KEY);
```

Encrypted fields include: `mobile`, `aadhar_no`, `pan_no`, `bank_account_no`, and other PII.

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

---

## @hrms/common

**Path:** `packages/common/`

Shared API response helper and status code enum.

```typescript
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

// In an Express route handler:
return apiResponse(res, RESPONSE_STATUS.SUCCESS, { user });
return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, null);
return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, null);
```

`apiResponse` produces:

```json
{ "success": true, "data": { … } }
{ "success": false, "message": "Not Found", "status": 404 }
```

---

## @hrms/grpc-server

**Path:** `packages/grpc-server/`

Bootstrap helper used by every microservice to start its gRPC server.

```typescript
import { BaseGrpcServer } from "@hrms/grpc-server";

class MyServer extends BaseGrpcServer {
  constructor() {
    super();
    this.addService(MyServiceService, handlers);
  }
}

const server = new MyServer();
server.start(`0.0.0.0:${PORT}`); // TLS auto-configured from env vars
```

TLS is enabled automatically when `GRPC_TLS_CRT_FILE` and `GRPC_TLS_KEY_FILE` are set (or when the shared `packages/certificates/` files are present). Falls back to insecure if neither is available.

---

## @hrms/grpc-client

**Path:** `packages/grpc-client/`

gRPC channel factory used by the API gateway to connect to services.

```typescript
import { BaseGrpcClient } from "@hrms/grpc-client";

const client = new BaseGrpcClient({
  serviceName: "employee-service",
  address: "localhost:50053",
  // credentials omitted → TLS auto-configured from GRPC_TLS_CA_FILE env var
  // or packages/certificates/rootCA.pem; falls back to insecure if absent
});

const result = await client.makeCall("getEmployee", { username });
```

---

## @hrms/websocket

**Path:** `packages/websocket/`

Socket.IO server configuration with Redis adapter, JWT authentication middleware, and namespace setup.

```typescript
import { configureSocketIO } from "@hrms/websocket";

const { io } = configureSocketIO(httpsServer, [CLIENT_URL], resolveUsername);
```

---

## @hrms/firebase

**Path:** `packages/firebase/`

Firebase Admin SDK helpers for FCM push notifications.

```typescript
import { sendPushNotification } from "@hrms/firebase";

await sendPushNotification({
  token: deviceFcmToken,
  title: "Leave Approved",
  body: "Your leave application for 3 days has been approved.",
});
```

---

## @hrms/schemas

**Path:** `packages/schemas/`

Zod validation schemas shared between the React frontend and the backend services. Importing the same schema on both sides guarantees that client-side validation matches server-side validation.

```typescript
import { leaveApplicationSchema } from "@hrms/schemas";

// Server: validate request body
const parsed = leaveApplicationSchema.parse(req.body);

// Client: Formik + Zod
const formik = useFormik({
  validationSchema: toFormikValidationSchema(leaveApplicationSchema),
});
```

---

## @hrms/ui

**Path:** `packages/ui/`

Shared React component library. Components used across multiple feature modules live here to avoid duplication.

---

## @hrms/auth

**Path:** `packages/auth/`

Client-side auth helpers: token storage, `getAccessToken()`, `setAccessToken()`, and the token expiry check.

---

## @hrms/webauthn

**Path:** `packages/webauthn/`

Thin wrappers around the browser WebAuthn API (`navigator.credentials.create` and `navigator.credentials.get`) with encoding/decoding utilities for `ArrayBuffer ↔ base64url`.

---

## @hrms/constants

**Path:** `packages/constants/`

Shared constants used by both the client and server-side code: employee status values, leave types, KYC status values, role names, etc.

---

## @hrms/shortcuts

**Path:** `packages/shortcuts/`

Keyboard shortcut definitions used in the React app to register global keyboard shortcuts consistently.

---

## @hrms/validation-utils

**Path:** `packages/validation-utils/`

Reusable Zod refinements and helper validators (e.g., Indian phone number format, PAN card format, IFSC code format).

---

## @hrms/typescript-config

**Path:** `packages/typescript-config/`

Base `tsconfig.json` presets:

- `base.json` — common compiler options for all packages
- `node.json` — extends base for Node.js services
- `react.json` — extends base for React apps (JSX, DOM lib)
