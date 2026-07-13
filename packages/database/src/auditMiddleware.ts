import { Prisma, PrismaClient } from "@prisma/client";
import { getAuditActor, getTenantClient, getTenantId } from "./tenantContext";

// Models with no business meaning to audit, or that would recurse /
// generate excessive noise if instrumented.
const SKIP_MODELS = new Set([
  "AuditLog",
  "LoginEvent",
  "Notification",
  "NotificationRecipient",
]);

const ACTION_MAP: Record<string, "CREATE" | "UPDATE" | "DELETE"> = {
  create: "CREATE",
  createMany: "CREATE",
  update: "UPDATE",
  updateMany: "UPDATE",
  upsert: "UPDATE",
  delete: "DELETE",
  deleteMany: "DELETE",
};

// Only these carry a single, unambiguous `where` we can safely snapshot
// with findUnique before the mutation runs. updateMany/deleteMany can touch
// an unbounded number of records, so we log the action but skip the diff.
const SINGLE_RECORD_ACTIONS = new Set(["update", "upsert", "delete"]);

// Field names that must never be written to the audit trail in the clear —
// credentials, tokens, biometric data, and government ID numbers/documents.
// Business data (salary figures, leave balances, designation, etc.) is
// deliberately left untouched — that's the whole point of an accountability
// trail, and none of it is a credential.
const SENSITIVE_FIELDS = new Set([
  "password",
  "refreshToken",
  "webAuthnCredentials",
  "fcmTokens",
  "face_descriptor",
  "aadhar_no",
  "aadhar_photo_front",
  "aadhar_photo_back",
  "pan_no",
  "pan_photo",
  "bank_account_no",
  "ifsc_code",
  "electricity_bill",
  "education_certificates",
  "experience_certificate",
  "signingSecret",
  "webhookSecret",
  "otp",
  "otpHash",
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_FIELDS.has(key) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

function lowerFirst(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

interface AuditWriteTarget {
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

function recordAuditEntry(
  target: AuditWriteTarget | null | undefined,
  model: string,
  prismaAction: string,
  before: unknown,
  after: unknown,
): void {
  if (!target) return;

  const actor = getAuditActor();
  const action = ACTION_MAP[prismaAction] ?? "UPDATE";

  target.auditLog
    .create({
      data: {
        tenantId: getTenantId() ?? null,
        userId: actor?.userId ?? null,
        username: actor?.username ?? null,
        action,
        entityType: model,
        oldValue: before == null ? undefined : redact(before),
        newValue: after == null ? undefined : redact(after),
        description: `${action} ${model}`,
        ipAddress: actor?.ipAddress ?? "",
        userAgent: actor?.userAgent ?? "",
      },
    })
    .catch(() => {
      // Never let audit-log persistence break the underlying request.
    });
}

// Attach to a tenant-specific PrismaClient (one physical database per
// tenant, from tenantClientPool.ts): every mutation on every model in that
// database is captured, with the audit row written into that same
// database — no per-module wiring needed as new modules are added.
export function attachAuditLogging(client: PrismaClient): void {
  (client as any).$use(
    async (
      params: Prisma.MiddlewareParams,
      next: (p: Prisma.MiddlewareParams) => Promise<unknown>,
    ) => {
      const model = params.model;
      const action = ACTION_MAP[params.action];
      if (!model || !action || SKIP_MODELS.has(model)) {
        return next(params);
      }

      let before: unknown = null;
      if (SINGLE_RECORD_ACTIONS.has(params.action) && params.args?.where) {
        const delegate = (client as any)[lowerFirst(model)];
        before = await delegate
          ?.findUnique({ where: params.args.where })
          .catch(() => null);
      }

      const result = await next(params);
      const after =
        params.action === "delete" || params.action === "deleteMany"
          ? null
          : result;

      recordAuditEntry(
        client as unknown as AuditWriteTarget,
        model,
        params.action,
        before,
        after,
      );
      return result;
    },
  );
}

// Attach to the master PrismaClient for the `User` model, which — unlike
// every other business model — lives in the shared master database
// (tenant-filtered), not a per-tenant one (see prismaWithTenant.ts). The
// audit row still needs to land in THAT user's own tenant database, so we
// resolve the write target from the request-scoped tenant context rather
// than writing to the master client itself.
export function attachMasterAuditLogging(client: PrismaClient): void {
  (client as any).$use(
    async (
      params: Prisma.MiddlewareParams,
      next: (p: Prisma.MiddlewareParams) => Promise<unknown>,
    ) => {
      const action = ACTION_MAP[params.action];
      if (params.model !== "User" || !action) {
        return next(params);
      }

      let before: unknown = null;
      if (SINGLE_RECORD_ACTIONS.has(params.action) && params.args?.where) {
        before = await (client as any).user
          .findUnique({ where: params.args.where })
          .catch(() => null);
      }

      const result = await next(params);
      const after =
        params.action === "delete" || params.action === "deleteMany"
          ? null
          : result;

      recordAuditEntry(
        getTenantClient() as unknown as AuditWriteTarget,
        "User",
        params.action,
        before,
        after,
      );
      return result;
    },
  );
}
