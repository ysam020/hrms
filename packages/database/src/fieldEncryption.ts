import type { PrismaClient } from "@prisma/client";
import {
  encryptField,
  encryptFaceDescriptor,
  claimsFieldCiphertext,
  FieldCryptoError,
  SENSITIVE_FIELDS,
  FACE_DESCRIPTOR_FIELD,
  setFieldCryptoFailureHook,
} from "@hrms/crypto";
import { logger } from "@hrms/logger";

/**
 * Every write to the User model passes through here, so a sensitive field is
 * sealed whichever handler wrote it, including ones added later. Reads stay
 * explicit: only code that needs a value opens it (@hrms/crypto
 * readSensitiveForDisplay / readSensitiveStrict).
 */

setFieldCryptoFailureHook(({ code, field }) => {
  logger.warn("sensitive field could not be opened", { code, field });
});

const ENCRYPTED_STRING_FIELDS: ReadonlySet<string> = new Set(SENSITIVE_FIELDS);
const WRITE_ACTIONS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
]);

/** Thrown when a non-production process may not write sensitive values. */
export class SensitiveWriteBlockedError extends Error {
  constructor() {
    super(
      "Sensitive fields can't be written from a non-production process connected to a shared database.",
    );
    this.name = "SensitiveWriteBlockedError";
  }
}

const hostOf = (uri: string): string =>
  uri
    .replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/i, "")
    .split(/[/:?,]/)[0]
    .toLowerCase();

/**
 * Development shares the production database but not its encryption key, so
 * a value sealed by a developer's process could never be opened in
 * production. Local databases, including the integration containers, stay
 * writable.
 */
export function sensitiveWritesAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.ALLOW_NONPROD_SENSITIVE_WRITES === "true") return true;
  const host = hostOf(env.DEV_MONGODB_URI ?? "");
  return (
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    !host.includes(".")
  );
}

function sealValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value === "object" && !Array.isArray(value) && "set" in value) {
    return { set: sealValue(field, (value as { set: unknown }).set) };
  }
  if (!sensitiveWritesAllowed()) throw new SensitiveWriteBlockedError();
  if (field === FACE_DESCRIPTOR_FIELD) {
    if (Array.isArray(value)) {
      return value.length > 0
        ? encryptFaceDescriptor(value as number[])
        : value;
    }
    // Prisma's JsonNull / DbNull sentinels clear the field.
    if (typeof value === "object") return value;
    throw new FieldCryptoError("MALFORMED");
  }
  if (typeof value !== "string") throw new FieldCryptoError("MALFORMED");
  // Rejected rather than stored or double-sealed: accepting ciphertext from a
  // caller would let them plant a value copied from another record.
  if (claimsFieldCiphertext(value)) {
    throw new FieldCryptoError("CIPHERTEXT_INPUT");
  }
  return encryptField(value, field);
}

function sealData<T>(data: T): T {
  if (Array.isArray(data)) return data.map(sealData) as unknown as T;
  if (!data || typeof data !== "object") return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (ENCRYPTED_STRING_FIELDS.has(key) || key === FACE_DESCRIPTOR_FIELD) {
      out[key] = sealValue(key, out[key]);
    }
  }
  return out as T;
}

export function sealUserWriteArgs(action: string, args: any): any {
  if (!args) return args;
  if (action === "upsert") {
    return {
      ...args,
      create: sealData(args.create),
      update: sealData(args.update),
    };
  }
  return { ...args, data: sealData(args.data) };
}

export function attachFieldEncryption(client: PrismaClient): void {
  client.$use(async (params, next) => {
    if (params.model === "User" && WRITE_ACTIONS.has(params.action)) {
      params.args = sealUserWriteArgs(params.action, params.args);
    }
    return next(params);
  });
}
