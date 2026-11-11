import { Prisma, type PrismaClient } from "@prisma/client";
import { PII_REGISTRY, type FieldRule } from "./piiRegistry";
import { sensitiveWritesAllowed } from "./fieldProtection";

/**
 * Server-side $jsonSchema validators for every collection with protected
 * fields, generated from the same registry as the encryption itself.
 *
 * They check shape only: a protected field must be absent, null, empty, or
 * a string in the sealed format. That stops plaintext arriving through any
 * path that skips the Prisma hook (raw commands, scripts, another driver, an
 * older build). They can't tell real ciphertext from a forged string; the
 * GCM tag does that when the value is opened.
 *
 * validationLevel:
 *   moderate: checks inserts, and updates to documents that already pass.
 *             Used while existing rows are still being migrated.
 *   strict:   checks every write. Set once the migration is verified.
 */

export type ValidationLevel = "off" | "moderate" | "strict";

const SEALED = { bsonType: "string", pattern: "^enc:v2:" };
const HMAC = { bsonType: "string", pattern: "^hmac:[0-9]+\\." };
const NULL = { bsonType: "null" };
const EMPTY = { enum: [""] };
const HEX64 = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };

function schemaFor(rule: FieldRule): Record<string, unknown> {
  switch (rule.kind) {
    case "string":
      return { anyOf: [NULL, EMPTY, SEALED] };
    case "stringArray":
      return {
        anyOf: [NULL, { bsonType: "array", items: { anyOf: [EMPTY, SEALED] } }],
      };
    case "compositeList":
      return {
        anyOf: [
          NULL,
          {
            bsonType: "array",
            items: {
              bsonType: "object",
              properties: Object.fromEntries(
                rule.fields.map((f) => [f, { anyOf: [NULL, EMPTY, SEALED] }]),
              ),
            },
          },
        ],
      };
    case "hmac":
      return { anyOf: [NULL, HMAC] };
    case "hash":
      return rule.format === "bcrypt"
        ? { anyOf: [NULL, { bsonType: "string", pattern: "^\\$2[aby]\\$" }] }
        : rule.format === "hex"
          ? { anyOf: [NULL, HEX64] }
          : { anyOf: [NULL, { bsonType: "array", items: HEX64 }] };
    default:
      return { anyOf: [NULL, SEALED] };
  }
}

interface ModelInfo {
  collection: string;
  dbNames: Map<string, string>;
}

let modelsCache: Map<string, ModelInfo> | undefined;
const MODELS = {
  get(model: string): ModelInfo | undefined {
    modelsCache ??= new Map(
      (Prisma?.dmmf?.datamodel?.models ?? []).map((m) => [
        m.name,
        {
          collection: m.dbName ?? m.name,
          dbNames: new Map(m.fields.map((f) => [f.name, f.dbName ?? f.name])),
        },
      ]),
    );
    return modelsCache.get(model);
  },
};

export function validatorFor(model: string): {
  collection: string;
  validator: Record<string, unknown>;
} | null {
  const rules = PII_REGISTRY[model];
  const info = MODELS.get(model);
  if (!rules || !info) return null;
  const properties: Record<string, unknown> = {};
  for (const [field, rule] of Object.entries(rules)) {
    properties[info.dbNames.get(field) ?? field] = schemaFor(rule);
    if ("blindIndex" in rule && rule.blindIndex) {
      properties[`${field}_bidx`] = { anyOf: [NULL, HMAC] };
    }
  }
  return {
    collection: info.collection,
    validator: { $jsonSchema: { bsonType: "object", properties } },
  };
}

export const MASTER_PROTECTED_MODELS = [
  "User",
  "Tenant",
  "TrialClaim",
  "TenantJoinRequest",
  "LoginEvent",
  "McpGrant",
  "SupportTicket",
  "SupportMessage",
  "SupportAttachment",
  "SupportActivity",
  "BillingPayment",
  "WebhookInboxEvent",
  "Lead",
];

export const TENANT_PROTECTED_MODELS = Object.keys(PII_REGISTRY).filter(
  (m) => !MASTER_PROTECTED_MODELS.includes(m),
);

/**
 * Off unless explicitly enabled. Validators reject plaintext, so they must
 * not be installed while any process on an older build still writes to the
 * database: they are turned on deliberately, once every service runs this
 * code (docs/field-encryption.md, rollout).
 */
export function validationLevelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ValidationLevel {
  const v = env.FIELD_VALIDATION_LEVEL;
  return v === "moderate" || v === "strict" ? v : "off";
}

/**
 * Applies the validators to one database. Idempotent; a missing collection
 * is created with its validator, so a new tenant is protected from its first
 * write. Returns the collections changed.
 */
export async function ensureFieldValidators(
  client: PrismaClient,
  models: string[],
  level: ValidationLevel = validationLevelFromEnv(),
): Promise<string[]> {
  if (level === "off") return [];
  // A development process sharing the production database must never
  // change that database's collection rules.
  if (!sensitiveWritesAllowed()) return [];
  const raw = (cmd: Record<string, unknown>) =>
    (client.$runCommandRaw as (c: unknown) => Promise<any>)(cmd);
  const existing = new Set<string>(
    (
      (await raw({ listCollections: 1, nameOnly: true })) as any
    ).cursor.firstBatch.map((c: { name: string }) => c.name),
  );
  const done: string[] = [];
  for (const model of models) {
    const v = validatorFor(model);
    if (!v) continue;
    const opts = {
      validator: v.validator,
      validationLevel: level,
      validationAction: "error",
    };
    if (existing.has(v.collection)) {
      await raw({ collMod: v.collection, ...opts });
    } else {
      await raw({ create: v.collection, ...opts });
    }
    done.push(v.collection);
  }
  return done;
}

/**
 * Applies the validators to master and every registered tenant database.
 * Called once at gateway start; a failure is logged, never thrown, so a
 * missing permission can't keep the service down.
 */
export async function ensureAllFieldValidators(
  level: ValidationLevel = validationLevelFromEnv(),
): Promise<void> {
  if (level === "off") return;
  const { prisma } = await import("./prismaClient");
  const { getClientForDb } = await import("./tenantClientPool");
  const { logger } = await import("@hrms/logger");
  try {
    await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, level);
  } catch (error) {
    logger.error("field validators: master failed", { error });
  }
  const tenants = await prisma.tenant.findMany({
    where: { dbName: { not: null } },
    select: { dbName: true },
  });
  for (const t of tenants) {
    try {
      await ensureFieldValidators(
        getClientForDb(t.dbName!),
        TENANT_PROTECTED_MODELS,
        level,
      );
    } catch (error) {
      logger.error("field validators: tenant database failed", {
        dbName: t.dbName,
        error,
      });
    }
  }
}
