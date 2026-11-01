import { Prisma, PrismaClient } from "@prisma/client";
import { classifyField, redactSensitive } from "@hrms/logger";
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

// Fields whose churn alone never warrants an audit entry (see
// hasMeaningfulChange). Redaction itself is decided by the shared
// classifier in @hrms/logger (redaction.ts), which also covers aliases such
// as aadharNo / aadhaarNumber and drops bulky applicant content (resumes,
// cover letters, ApplicationDraft.data) from snapshots.
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

// Fields that change on every single write regardless of whether anything a
// person would recognize as "the record" actually changed — excluded when
// deciding whether an UPDATE is worth a log entry at all.
const BOOKKEEPING_FIELDS = new Set(["updatedAt"]);

// An UPDATE whose only differences are inside redacted fields (e.g. a push
// send bumping fcmTokens[].lastUsed) or bookkeeping fields would write a log
// entry with an old/new value pair that's identical after redaction — noise
// with no accountability value. Compare pre-redaction so this only
// suppresses genuine no-ops, never a real change to a sensitive field.
function hasMeaningfulChange(before: unknown, after: unknown): boolean {
  if (before === null || before === undefined) return true;
  if (after === null || after === undefined) return true;
  if (typeof before !== "object" || typeof after !== "object") {
    return before !== after;
  }
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>),
  ]);
  for (const key of keys) {
    if (BOOKKEEPING_FIELDS.has(key) || SENSITIVE_FIELDS.has(key)) continue;
    const b = (before as Record<string, unknown>)[key];
    const a = (after as Record<string, unknown>)[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) return true;
  }
  return false;
}

function writesOnlyUnauditedFields(params: Prisma.MiddlewareParams): boolean {
  const data = params.args?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const keys = Object.keys(data);
  return (
    keys.length > 0 &&
    keys.every((k) => SENSITIVE_FIELDS.has(k) || BOOKKEEPING_FIELDS.has(k))
  );
}

export function isSensitiveAuditField(key: string): boolean {
  return classifyField(key) !== null;
}

/**
 * Replace every sensitive field's value, at any depth: secrets become
 * "[REDACTED]", resumes / cover letters / oversized strings become a size
 * marker. Also applied on read (handlers/general.ts getAuditLogs), so rows
 * written before a rule existed are hidden from the API too.
 */
export function redactAuditValue(value: unknown, model?: string): unknown {
  return redactSensitive(value, model);
}

// For an UPDATE, a hidden field that actually changed is marked as such in
// newValue, so the trail still records *that* it changed without storing
// the value.
function markChangedHiddenFields(
  model: string,
  before: unknown,
  after: unknown,
  redactedAfter: unknown,
): unknown {
  if (
    !before ||
    !after ||
    !redactedAfter ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    typeof redactedAfter !== "object" ||
    Array.isArray(redactedAfter)
  ) {
    return redactedAfter;
  }
  const out = { ...(redactedAfter as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (!classifyField(key, model)) continue;
    const b = (before as Record<string, unknown>)[key];
    const a = (after as Record<string, unknown>)[key];
    if (a != null && JSON.stringify(a) !== JSON.stringify(b)) {
      out[key] = `${out[key]} (changed)`;
    }
  }
  return out;
}

function lowerFirst(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

interface AuditWriteTarget {
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export function recordAuditEntry(
  target: AuditWriteTarget | null | undefined,
  model: string,
  prismaAction: string,
  before: unknown,
  after: unknown,
): void {
  if (!target) return;

  const action = ACTION_MAP[prismaAction] ?? "UPDATE";

  // An update that only touched redacted/bookkeeping fields (e.g. a push
  // send stamping fcmTokens[].lastUsed) has nothing to show once redacted —
  // skip it rather than write a confusing "changed nothing" entry.
  if (
    action === "UPDATE" &&
    before != null &&
    after != null &&
    !hasMeaningfulChange(before, after)
  ) {
    return;
  }

  const actor = getAuditActor();

  target.auditLog
    .create({
      data: {
        tenantId: getTenantId() ?? null,
        userId: actor?.userId ?? null,
        username: actor?.username ?? null,
        action,
        entityType: model,
        oldValue: before == null ? undefined : redactSensitive(before, model),
        newValue:
          after == null
            ? undefined
            : action === "UPDATE"
              ? markChangedHiddenFields(
                  model,
                  before,
                  after,
                  redactSensitive(after, model),
                )
              : redactSensitive(after, model),
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
      // An update that only writes redacted/bookkeeping fields can never
      // produce an audit entry (recordAuditEntry drops it as a no-op), so
      // don't pay a full-document read for it. This is every refresh-token
      // rotation, which mirrors the new token hash onto the user.
      if (params.action === "update" && writesOnlyUnauditedFields(params)) {
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
