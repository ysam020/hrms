import { Prisma, type PrismaClient } from "@prisma/client";
import {
  FieldCryptoError,
  FieldKeyRing,
  claimsFieldCiphertext,
  decryptField,
  isEncrypted,
  normalizeForIndex,
  aesDecrypt,
  type FieldContext,
} from "@hrms/crypto";
import { PII_REGISTRY, type FieldRule } from "./piiRegistry";
import { fieldKeyStore, type KeyPurpose } from "./fieldKeys";
import { getTenantClient } from "./tenantContext";

const SCOPE_TAG = Symbol.for("praesto.fieldScope");

/**
 * Field protection for every Prisma client, master and tenant.
 *
 * Writes: every registered field is sealed with the connection's data key
 * before it leaves the process, in create, createMany, update, updateMany,
 * upsert and nested writes. Blind-indexed fields also get a `<field>_bidx`.
 *
 * Reads: registered fields in results are opened, at any include depth, and
 * `_bidx` fields are removed so API responses keep their existing shape.
 *
 * Queries: exact matches on blind-indexed fields are rewritten to the index.
 * Conditions the database can no longer evaluate (contains, ranges, sorting
 * on an encrypted field) run in memory on a bounded, tenant-scoped row set.
 * Anything that can't be done correctly fails instead of returning a wrong
 * answer: aggregates over encrypted values, relation filters on them, and raw
 * pipelines that match or sort on them.
 *
 * Writes that bypass Prisma are stopped by the server-side validators
 * (fieldValidators.ts), not here.
 */

export type FieldProtectionErrorCode =
  | "UNSUPPORTED_QUERY"
  | "UNSUPPORTED_OPERATION"
  | "SCAN_LIMIT"
  | "INVALID_VALUE";

export class FieldProtectionError extends Error {
  constructor(
    readonly code: FieldProtectionErrorCode,
    readonly model: string,
    readonly field?: string,
  ) {
    super(`Field protection: ${code} on ${model}${field ? `.${field}` : ""}`);
    this.name = "FieldProtectionError";
  }
}

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
 * Development shares the production database but not its keys. A value or a
 * data key created by a developer's process could never be opened by
 * production, so those processes may only write to local databases.
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

// ─── Schema metadata ─────────────────────────────────────────────────────────

interface FieldMeta {
  kind: string;
  type: string;
  isList: boolean;
}

// Built on first use: unit tests that mock @prisma/client have no DMMF.
let metaCache: Map<string, Map<string, FieldMeta>> | undefined;
function meta(): Map<string, Map<string, FieldMeta>> {
  if (!metaCache) {
    metaCache = new Map();
    for (const m of Prisma?.dmmf?.datamodel?.models ?? []) {
      metaCache.set(
        m.name,
        new Map(
          m.fields.map((f) => [
            f.name,
            { kind: f.kind, type: f.type, isList: f.isList },
          ]),
        ),
      );
    }
  }
  return metaCache;
}
const META = { get: (model: string) => meta().get(model) };

const relationTarget = (model: string, field: string): string | null => {
  const f = META.get(model)?.get(field);
  return f && f.kind === "object" && meta().has(f.type) ? f.type : null;
};

const ruleOf = (model: string, field: string): FieldRule | undefined =>
  PII_REGISTRY[model]?.[field];

export function isProtectedField(model: string, field: string): boolean {
  return !!ruleOf(model, field);
}

const BIDX_SUFFIX = "_bidx";

function bidxFieldsOf(model: string): Set<string> {
  const out = new Set<string>();
  for (const [f, r] of Object.entries(PII_REGISTRY[model] ?? {})) {
    if ("blindIndex" in r && r.blindIndex) out.add(f + BIDX_SUFFIX);
  }
  return out;
}

// ─── Keys ────────────────────────────────────────────────────────────────────

export interface ProtectionScope {
  scope: string;
  ring(purpose: KeyPurpose): Promise<FieldKeyRing>;
}

export function scopeFor(scope: string): ProtectionScope {
  return {
    scope,
    ring: (purpose) =>
      fieldKeyStore().ring(scope, purpose, sensitiveWritesAllowed()),
  };
}

// ─── Values ──────────────────────────────────────────────────────────────────

const isNullish = (v: unknown) => v === null || v === undefined;
const isPrismaNull = (v: unknown) =>
  !!Prisma &&
  (v === Prisma.JsonNull || v === Prisma.DbNull || v === Prisma.AnyNull);

function checkKind(model: string, field: string, rule: FieldRule, v: unknown) {
  const ok =
    rule.kind === "string"
      ? typeof v === "string"
      : rule.kind === "number"
        ? typeof v === "number" && Number.isFinite(v)
        : rule.kind === "boolean"
          ? typeof v === "boolean"
          : rule.kind === "date"
            ? v instanceof Date && !Number.isNaN(v.getTime())
            : true;
  if (!ok) throw new FieldProtectionError("INVALID_VALUE", model, field);
}

async function sealOne(
  model: string,
  field: string,
  rule: FieldRule,
  value: unknown,
  scope: ProtectionScope,
): Promise<unknown> {
  if (isNullish(value) || isPrismaNull(value)) return value;
  if (rule.kind === "hash") return value;
  if (rule.kind === "hmac") {
    if (typeof value !== "string") {
      throw new FieldProtectionError("INVALID_VALUE", model, field);
    }
    return (await scope.ring("bidx")).blindIndex(value, { model, field });
  }
  if (!sensitiveWritesAllowed()) throw new SensitiveWriteBlockedError();
  const ctx = { model, field };
  if (rule.kind === "stringArray") {
    if (!Array.isArray(value)) {
      throw new FieldProtectionError("INVALID_VALUE", model, field);
    }
    const ring = await scope.ring("enc");
    return value.map((v) => {
      if (typeof v !== "string") {
        throw new FieldProtectionError("INVALID_VALUE", model, field);
      }
      return v === "" ? v : ring.encrypt(v, ctx);
    });
  }
  if (rule.kind === "compositeList") {
    const list = Array.isArray(value) ? value : [value];
    const ring = await scope.ring("enc");
    const sealed = list.map((item) => {
      if (!item || typeof item !== "object") {
        throw new FieldProtectionError("INVALID_VALUE", model, field);
      }
      const out = { ...(item as Record<string, unknown>) };
      for (const f of rule.fields) {
        if (typeof out[f] === "string" && out[f] !== "") {
          out[f] = ring.encrypt(out[f], { model, field: `${field}.${f}` });
        }
      }
      return out;
    });
    return Array.isArray(value) ? sealed : sealed[0];
  }
  if (rule.kind === "string" && value === "") return value;
  if (claimsFieldCiphertext(value)) {
    // Accepting ciphertext from a caller would let them copy a value from
    // another record or tenant.
    throw new FieldCryptoError("CIPHERTEXT_INPUT");
  }
  let v = value;
  if (rule.kind === "date" && typeof v === "string") v = new Date(v);
  checkKind(model, field, rule, v);
  return (await scope.ring("enc")).encrypt(v, ctx);
}

async function bidxOf(
  model: string,
  field: string,
  rule: FieldRule,
  value: unknown,
  scope: ProtectionScope,
  allVersions: boolean,
): Promise<string[]> {
  if (
    !("blindIndex" in rule) ||
    !rule.blindIndex ||
    typeof value !== "string"
  ) {
    return [];
  }
  const ring = await scope.ring("bidx");
  const n = normalizeForIndex(value, rule.blindIndex);
  return allVersions
    ? ring.blindIndexes(n, { model, field })
    : [ring.blindIndex(n, { model, field })];
}

function legacyDate(v: unknown): unknown {
  if (v && typeof v === "object" && "$date" in (v as object)) {
    const d = (v as { $date: unknown }).$date;
    return new Date(
      typeof d === "object" && d && "$numberLong" in d
        ? Number((d as { $numberLong: string }).$numberLong)
        : (d as string),
    );
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))
    return new Date(v);
  return v;
}

function legacyNumber(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as Record<string, string>;
    const n =
      o.$numberDouble ?? o.$numberInt ?? o.$numberLong ?? o.$numberDecimal;
    if (n !== undefined) return Number(n);
  }
  return v;
}

function openOne(
  model: string,
  field: string,
  rule: FieldRule,
  value: unknown,
  ring: FieldKeyRing | undefined,
): unknown {
  if (isNullish(value)) return value;
  if (rule.kind === "hash" || rule.kind === "hmac") return value;
  const ctx: FieldContext = { model, field };
  if (rule.kind === "stringArray") {
    return Array.isArray(value)
      ? value.map((v) => (isEncrypted(v) ? ring!.decrypt(v, ctx) : v))
      : value;
  }
  if (rule.kind === "compositeList") {
    if (!Array.isArray(value)) return value;
    return value.map((item) => {
      if (!item || typeof item !== "object") return item;
      const out = { ...(item as Record<string, unknown>) };
      for (const f of rule.fields) {
        if (isEncrypted(out[f])) {
          out[f] = ring!.decrypt(out[f] as string, {
            model,
            field: `${field}.${f}`,
          });
        }
      }
      return out;
    });
  }
  if (isEncrypted(value)) return ring!.decrypt(value, ctx);
  if (typeof value === "string" && value.startsWith("enc:v1:")) {
    // Sealed by the earlier User-only scheme: same AES-GCM, process key.
    const opened = decryptField(value, field);
    return rule.kind === "json" ? JSON.parse(opened) : opened;
  }
  if (claimsFieldCiphertext(value))
    throw new FieldCryptoError("UNSUPPORTED_VERSION");
  // Not yet migrated.
  if ("legacyCbc" in rule && rule.legacyCbc && typeof value === "string") {
    if (/^[a-f0-9]{32}:[a-f0-9]+$/i.test(value)) {
      // These are optional credentials (a calendar refresh token). One sealed
      // under another environment's key can never be opened here; failing the
      // whole read would lock the user out (Google sign-in reads the full
      // record), so treat it as absent. The user reconnects the integration.
      try {
        return aesDecrypt(value);
      } catch {
        console.warn(
          `[fieldProtection] unreadable legacy value in ${field}; treated as empty`,
        );
        return null;
      }
    }
  }
  if (rule.kind === "date") return legacyDate(value);
  if (rule.kind === "number") return legacyNumber(value);
  return value;
}

const needsRing = (v: unknown): boolean => {
  if (typeof v === "string") return isEncrypted(v);
  if (Array.isArray(v)) return v.some(needsRing);
  if (v && typeof v === "object") return Object.values(v).some(needsRing);
  return false;
};

// ─── Results ─────────────────────────────────────────────────────────────────

/** Opens every protected field of a result, at any include depth. */
export async function openResult(
  model: string,
  result: unknown,
  scope: ProtectionScope,
): Promise<unknown> {
  if (isNullish(result) || typeof result !== "object") return result;
  if (Array.isArray(result)) {
    return Promise.all(result.map((r) => openResult(model, r, scope)));
  }
  const rec = result as Record<string, unknown>;
  let ring: FieldKeyRing | undefined;
  for (const key of Object.keys(rec)) {
    if (key.endsWith(BIDX_SUFFIX) && bidxFieldsOf(model).has(key)) {
      delete rec[key];
      continue;
    }
    const rule = ruleOf(model, key);
    if (rule) {
      if (!ring && needsRing(rec[key])) ring = await scope.ring("enc");
      rec[key] = openOne(model, key, rule, rec[key], ring);
      continue;
    }
    const target = relationTarget(model, key);
    if (target) rec[key] = await openResult(target, rec[key], scope);
  }
  return rec;
}

/**
 * Opens rows returned by aggregateRaw/findRaw: top-level fields that kept
 * their schema name. Extended-JSON wrappers are left as they are.
 */
export async function openRawRows(
  model: string,
  rows: unknown,
  scope: ProtectionScope,
): Promise<unknown> {
  if (!Array.isArray(rows)) return rows;
  return Promise.all(
    rows.map(async (row) => {
      if (!row || typeof row !== "object") return row;
      const rec = row as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        if (bidxFieldsOf(model).has(key)) delete rec[key];
        const rule = ruleOf(model, key);
        if (!rule) continue;
        const ring = needsRing(rec[key]) ? await scope.ring("enc") : undefined;
        let v = openOne(model, key, rule, rec[key], ring);
        if (rule.kind === "date" && v instanceof Date)
          v = { $date: v.toISOString() };
        rec[key] = v;
      }
      return rec;
    }),
  );
}

// ─── Writes ──────────────────────────────────────────────────────────────────

const NUMERIC_OPS = ["increment", "decrement", "multiply", "divide"];

async function sealField(
  model: string,
  field: string,
  rule: FieldRule,
  raw: unknown,
  out: Record<string, unknown>,
  scope: ProtectionScope,
): Promise<void> {
  let value = raw;
  let wrapped: "set" | "push" | null = null;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !isPrismaNull(value) &&
    rule.kind !== "json"
  ) {
    const keys = Object.keys(value as object);
    if (keys.some((k) => NUMERIC_OPS.includes(k))) {
      throw new FieldProtectionError("UNSUPPORTED_OPERATION", model, field);
    }
    if (keys.length === 1 && (keys[0] === "set" || keys[0] === "push")) {
      wrapped = keys[0] as "set" | "push";
      value = (value as Record<string, unknown>)[wrapped];
    } else if (rule.kind !== "compositeList") {
      throw new FieldProtectionError("UNSUPPORTED_OPERATION", model, field);
    }
  }
  if (
    rule.kind === "json" &&
    value &&
    typeof value === "object" &&
    "set" in (value as object) &&
    Object.keys(value as object).length === 1 &&
    META.get(model)?.get(field)?.type !== "Json"
  ) {
    wrapped = "set";
    value = (value as { set: unknown }).set;
  }
  if (
    wrapped === "push" &&
    rule.kind === "stringArray" &&
    !Array.isArray(value)
  ) {
    value = [value];
  }
  const sealed = await sealOne(model, field, rule, value, scope);
  out[field] = wrapped ? { [wrapped]: sealed } : sealed;
  if ("blindIndex" in rule && rule.blindIndex && wrapped !== "push") {
    const [idx] = await bidxOf(model, field, rule, value, scope, false);
    const bf = field + BIDX_SUFFIX;
    out[bf] = isNullish(value) || value === "" ? null : idx;
  }
}

/** Seals one `data` object (or array) for `model`, recursing into nested writes. */
export async function sealData(
  model: string,
  data: unknown,
  scope: ProtectionScope,
  isCreate: boolean,
): Promise<unknown> {
  if (Array.isArray(data)) {
    return Promise.all(data.map((d) => sealData(model, d, scope, isCreate)));
  }
  if (!data || typeof data !== "object") return data;
  const src = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  const bidx = bidxFieldsOf(model);
  for (const key of Object.keys(src)) {
    if (bidx.has(key)) {
      // Only this module may write an index value.
      throw new FieldProtectionError("UNSUPPORTED_OPERATION", model, key);
    }
    const rule = ruleOf(model, key);
    if (rule) {
      if (src[key] === undefined) continue;
      await sealField(model, key, rule, src[key], out, scope);
      continue;
    }
    const target = relationTarget(model, key);
    if (target && src[key] && typeof src[key] === "object") {
      out[key] = await sealNested(
        target,
        src[key] as Record<string, unknown>,
        scope,
      );
    }
  }
  if (isCreate) {
    for (const [f, rule] of Object.entries(PII_REGISTRY[model] ?? {})) {
      if (
        "default" in rule &&
        rule.default !== undefined &&
        src[f] === undefined
      ) {
        await sealField(model, f, rule, rule.default, out, scope);
      }
    }
  }
  return out;
}

async function sealNested(
  model: string,
  ops: Record<string, unknown>,
  scope: ProtectionScope,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...ops };
  for (const [op, v] of Object.entries(ops)) {
    if (op === "create") out.create = await sealData(model, v, scope, true);
    else if (op === "createMany") {
      const cm = v as { data: unknown };
      out.createMany = {
        ...cm,
        data: await sealData(model, cm.data, scope, true),
      };
    } else if (op === "connectOrCreate") {
      const list = Array.isArray(v) ? v : [v];
      const sealed = await Promise.all(
        list.map(async (c: any) => ({
          ...c,
          where: await rewriteUniqueWhere(model, c.where, scope),
          create: await sealData(model, c.create, scope, true),
        })),
      );
      out.connectOrCreate = Array.isArray(v) ? sealed : sealed[0];
    } else if (op === "update" || op === "updateMany") {
      const list = Array.isArray(v) ? v : [v];
      const sealed = await Promise.all(
        list.map(async (u: any) =>
          u && typeof u === "object" && "data" in u
            ? {
                ...u,
                where:
                  u.where && (await plainWhereOrThrow(model, u.where, scope)),
                data: await sealData(model, u.data, scope, false),
              }
            : sealData(model, u, scope, false),
        ),
      );
      out[op] = Array.isArray(v) ? sealed : sealed[0];
    } else if (op === "upsert") {
      const list = Array.isArray(v) ? v : [v];
      const sealed = await Promise.all(
        list.map(async (u: any) => ({
          ...u,
          ...(u.where
            ? { where: await plainWhereOrThrow(model, u.where, scope) }
            : {}),
          create: await sealData(model, u.create, scope, true),
          update: await sealData(model, u.update, scope, false),
        })),
      );
      out.upsert = Array.isArray(v) ? sealed : sealed[0];
    } else if (
      ["connect", "disconnect", "set", "delete", "deleteMany"].includes(op)
    ) {
      if (v && typeof v === "object") {
        out[op] = Array.isArray(v)
          ? await Promise.all(v.map((w) => plainWhereOrThrow(model, w, scope)))
          : await plainWhereOrThrow(model, v, scope);
      }
    }
  }
  return out;
}

// ─── Where clauses ───────────────────────────────────────────────────────────

/** FIELD_LEGACY_PLAINTEXT_MATCH=false once the migration is verified. */
export function legacyPlaintextMatch(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FIELD_LEGACY_PLAINTEXT_MATCH !== "false";
}

const TRUE = Symbol("no-constraint");
type Planned = {
  server: Record<string, unknown> | typeof TRUE;
  memory: boolean;
};

const SERVER_SAFE_NULL = (c: unknown): boolean => {
  if (c === null || c === "") return true;
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const keys = Object.keys(c);
  return (
    keys.length === 1 &&
    ((keys[0] === "equals" &&
      ((c as any).equals === null || (c as any).equals === "")) ||
      (keys[0] === "not" && (c as any).not === null) ||
      keys[0] === "isSet" ||
      keys[0] === "isEmpty")
  );
};

async function planCondition(
  model: string,
  field: string,
  rule: FieldRule,
  cond: unknown,
  scope: ProtectionScope,
): Promise<Planned> {
  if (SERVER_SAFE_NULL(cond))
    return { server: { [field]: cond }, memory: false };
  const equalsValues = (): unknown[] | null => {
    if (typeof cond === "string") return [cond];
    if (!cond || typeof cond !== "object" || Array.isArray(cond)) return null;
    const c = cond as Record<string, unknown>;
    const keys = Object.keys(c).filter((k) => k !== "mode");
    if (keys.length !== 1) return null;
    if (keys[0] === "equals" && typeof c.equals === "string") return [c.equals];
    if (keys[0] === "in" && Array.isArray(c.in)) return c.in;
    return null;
  };
  const values = equalsValues();
  // Until the migration has sealed every row, an older row still holds the
  // plaintext and has no index; match it the old way too, or lookups such as
  // login by email would miss existing accounts. Turned off once verified.
  const legacy = legacyPlaintextMatch();
  if (values && rule.kind === "hmac") {
    const ring = await scope.ring("bidx");
    const hashed = {
      [field]: {
        in: values.flatMap((v) =>
          ring.blindIndexes(String(v), { model, field }),
        ),
      },
    };
    return {
      server: legacy ? { OR: [hashed, { [field]: { in: values } }] } : hashed,
      memory: false,
    };
  }
  if (values && "blindIndex" in rule && rule.blindIndex) {
    const mode = (cond as { mode?: string })?.mode;
    // A case-insensitive match is exact only when the index folds case.
    if (mode !== "insensitive" || rule.blindIndex === "email") {
      const idx = (
        await Promise.all(
          values.map((v) => bidxOf(model, field, rule, v, scope, true)),
        )
      ).flat();
      const indexed = { [field + BIDX_SUFFIX]: { in: idx } };
      return {
        server: legacy
          ? {
              OR: [
                indexed,
                {
                  // A sealed value never equals a plaintext one, so this only
                  // matches rows not yet migrated. (Prisma's Mongo connector
                  // can't match a missing index field with null.)
                  // Emails were matched case-insensitively by their index.
                  [field]:
                    rule.blindIndex === "email"
                      ? {
                          ...(values.length === 1
                            ? { equals: String(values[0]), mode: "insensitive" }
                            : { in: values }),
                        }
                      : cond,
                },
              ],
            }
          : indexed,
        memory: false,
      };
    }
  }
  if (rule.kind === "hmac" || rule.kind === "hash") {
    throw new FieldProtectionError("UNSUPPORTED_QUERY", model, field);
  }
  return { server: TRUE, memory: true };
}

async function planWhere(
  model: string,
  where: unknown,
  scope: ProtectionScope,
): Promise<Planned> {
  if (!where || typeof where !== "object")
    return { server: TRUE, memory: false };
  const server: Record<string, unknown> = {};
  let memory = false;
  const and: unknown[] = [];
  for (const [key, cond] of Object.entries(where as Record<string, unknown>)) {
    if (cond === undefined) continue;
    if (key === "AND" || key === "OR" || key === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      const parts = await Promise.all(
        list.map((w) => planWhere(model, w, scope)),
      );
      const anyMemory = parts.some((p) => p.memory);
      memory ||= anyMemory;
      if (key === "AND") {
        for (const p of parts) if (p.server !== TRUE) and.push(p.server);
      } else if (!anyMemory) {
        // An OR/NOT can only be sent when every branch can.
        server[key] = parts.map((p) => (p.server === TRUE ? {} : p.server));
      }
      continue;
    }
    const rule = ruleOf(model, key);
    if (rule) {
      const p = await planCondition(model, key, rule, cond, scope);
      memory ||= p.memory;
      if (p.server !== TRUE) and.push(p.server);
      continue;
    }
    const target = relationTarget(model, key);
    if (target && cond && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      const relKeys = ["is", "isNot", "some", "every", "none"];
      const inner = Object.keys(c).some((k) => relKeys.includes(k))
        ? Object.fromEntries(
            await Promise.all(
              Object.entries(c).map(async ([k, w]) => [
                k,
                w === null ? null : await plainWhereOrThrow(target, w, scope),
              ]),
            ),
          )
        : await plainWhereOrThrow(target, c, scope);
      server[key] = inner;
      continue;
    }
    server[key] = cond;
  }
  if (and.length)
    server.AND = [...(Array.isArray(server.AND) ? server.AND : []), ...and];
  return {
    server: Object.keys(server).length ? server : TRUE,
    memory,
  };
}

/** A where the database must evaluate on its own (relation filters, nested writes). */
async function plainWhereOrThrow(
  model: string,
  where: unknown,
  scope: ProtectionScope,
): Promise<Record<string, unknown>> {
  const p = await planWhere(model, where, scope);
  if (p.memory) throw new FieldProtectionError("UNSUPPORTED_QUERY", model);
  return p.server === TRUE ? {} : p.server;
}

async function rewriteUniqueWhere(
  model: string,
  where: unknown,
  scope: ProtectionScope,
): Promise<unknown> {
  return plainWhereOrThrow(model, where, scope);
}

const touchesBidx = (model: string, where: unknown): boolean =>
  !!where &&
  typeof where === "object" &&
  Object.keys(where as object).some((k) => {
    const r = ruleOf(model, k);
    return !!r && (("blindIndex" in r && !!r.blindIndex) || r.kind === "hmac");
  });

// ─── In-memory evaluation ────────────────────────────────────────────────────

const cmp = (a: unknown, b: unknown): number => {
  const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v);
  const x = norm(a) as any;
  const y = norm(b) as any;
  if (x === y) return 0;
  if (x === null || x === undefined) return -1;
  if (y === null || y === undefined) return 1;
  return x < y ? -1 : 1;
};

const fold = (v: unknown, insensitive: boolean) =>
  typeof v === "string" && insensitive ? v.toLowerCase() : v;

function matchScalar(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== "object" || cond instanceof Date || Array.isArray(cond)) {
    return cmp(value, cond) === 0;
  }
  const c = cond as Record<string, any>;
  const ins = c.mode === "insensitive";
  const v = fold(value, ins);
  for (const [op, arg] of Object.entries(c)) {
    const a = fold(arg, ins);
    switch (op) {
      case "mode":
        break;
      case "equals":
        if (
          arg === null
            ? !(value === null || value === undefined)
            : cmp(v, a) !== 0
        )
          return false;
        break;
      case "not":
        if (arg !== null && typeof arg === "object" && !(arg instanceof Date)) {
          if (matchScalar(value, { ...arg, mode: c.mode })) return false;
        } else if (
          arg === null ? value === null || value === undefined : cmp(v, a) === 0
        )
          return false;
        break;
      case "in":
        if (!(arg as unknown[]).some((x) => cmp(v, fold(x, ins)) === 0))
          return false;
        break;
      case "notIn":
        if ((arg as unknown[]).some((x) => cmp(v, fold(x, ins)) === 0))
          return false;
        break;
      case "lt":
        if (!(value != null && cmp(v, a) < 0)) return false;
        break;
      case "lte":
        if (!(value != null && cmp(v, a) <= 0)) return false;
        break;
      case "gt":
        if (!(value != null && cmp(v, a) > 0)) return false;
        break;
      case "gte":
        if (!(value != null && cmp(v, a) >= 0)) return false;
        break;
      case "contains":
        if (typeof v !== "string" || !v.includes(String(a))) return false;
        break;
      case "startsWith":
        if (typeof v !== "string" || !v.startsWith(String(a))) return false;
        break;
      case "endsWith":
        if (typeof v !== "string" || !v.endsWith(String(a))) return false;
        break;
      case "isSet":
        if ((value !== undefined) !== arg) return false;
        break;
      case "has":
        if (!Array.isArray(value) || !value.some((x) => cmp(x, arg) === 0))
          return false;
        break;
      case "hasSome":
        if (
          !Array.isArray(value) ||
          !value.some((x) => (arg as unknown[]).some((y) => cmp(x, y) === 0))
        )
          return false;
        break;
      case "hasEvery":
        if (
          !Array.isArray(value) ||
          !(arg as unknown[]).every((y) => value.some((x) => cmp(x, y) === 0))
        )
          return false;
        break;
      case "isEmpty":
        if (!Array.isArray(value) || (value.length === 0) !== arg) return false;
        break;
      default:
        throw new FieldProtectionError("UNSUPPORTED_QUERY", "memory", op);
    }
  }
  return true;
}

function matches(
  model: string,
  row: Record<string, unknown>,
  where: unknown,
): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [key, cond] of Object.entries(where as Record<string, unknown>)) {
    if (cond === undefined) continue;
    if (key === "AND") {
      const l = Array.isArray(cond) ? cond : [cond];
      if (!l.every((w) => matches(model, row, w))) return false;
    } else if (key === "OR") {
      const l = cond as unknown[];
      if (!l.some((w) => matches(model, row, w))) return false;
    } else if (key === "NOT") {
      const l = Array.isArray(cond) ? cond : [cond];
      if (l.some((w) => matches(model, row, w))) return false;
    } else if (relationTarget(model, key)) {
      // Relation filters never contain encrypted conditions (planWhere
      // refuses them), so the database has already applied them.
      continue;
    } else if (!matchScalar(row[key], cond)) return false;
  }
  return true;
}

type Order = { field: string; dir: 1 | -1 };

function memoryOrder(model: string, orderBy: unknown): Order[] | null {
  if (!orderBy) return null;
  const list = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<
    string,
    unknown
  >[];
  const out: Order[] = [];
  let encrypted = false;
  let complex = false;
  for (const o of list) {
    for (const [field, d] of Object.entries(o)) {
      const dir = typeof d === "string" ? d : (d as { sort?: unknown })?.sort;
      const target = relationTarget(model, field);
      if (target) {
        const refs = JSON.stringify(d).match(/"(\w+)"/g) ?? [];
        if (refs.some((k) => ruleOf(target, k.slice(1, -1)))) {
          throw new FieldProtectionError("UNSUPPORTED_QUERY", model, field);
        }
      }
      if (typeof dir !== "string") {
        complex = true;
        continue;
      }
      if (ruleOf(model, field)) encrypted = true;
      out.push({ field, dir: dir === "desc" ? -1 : 1 });
    }
  }
  if (!encrypted) return null;
  if (complex)
    throw new FieldProtectionError("UNSUPPORTED_QUERY", model, "orderBy");
  return out;
}

const SCAN_LIMIT = () => Number(process.env.FIELD_MEMORY_SCAN_LIMIT) || 10000;

function fieldsReferenced(where: unknown, into: Set<string>): void {
  if (!where || typeof where !== "object") return;
  for (const [k, v] of Object.entries(where as Record<string, unknown>)) {
    if (k === "AND" || k === "OR" || k === "NOT") {
      for (const w of Array.isArray(v) ? v : [v]) fieldsReferenced(w, into);
    } else into.add(k);
  }
}

/**
 * Runs a read whose filter or order needs decrypted values: fetches the rows
 * the database can narrow to, opens them, then filters, sorts and pages here.
 */
async function readInMemory(
  model: string,
  action: string,
  args: any,
  server: Record<string, unknown>,
  order: Order[] | null,
  scope: ProtectionScope,
  next: (a: any) => Promise<any>,
): Promise<{ rows: Record<string, unknown>[]; added: string[] }> {
  if (args.cursor || args.distinct) {
    throw new FieldProtectionError("UNSUPPORTED_QUERY", model);
  }
  const needed = new Set<string>(["id"]);
  fieldsReferenced(args.where, needed);
  for (const o of order ?? []) needed.add(o.field);
  let select = args.select;
  const added: string[] = [];
  if (action === "count") {
    select = Object.fromEntries(
      [...needed]
        .filter((f) => META.get(model)?.has(f) && !relationTarget(model, f))
        .map((f) => [f, true]),
    );
  } else if (select) {
    select = { ...select };
    for (const f of needed) {
      if (!select[f] && META.get(model)?.has(f) && !relationTarget(model, f)) {
        select[f] = true;
        added.push(f);
      }
    }
  }
  const limit = SCAN_LIMIT();
  const fetchArgs: any = {
    where: server,
    ...(select ? { select } : {}),
    ...(args.include && action !== "count" ? { include: args.include } : {}),
    ...(!order && args.orderBy ? { orderBy: args.orderBy } : {}),
    take: limit + 1,
  };
  const raw = (await next(fetchArgs)) as Record<string, unknown>[];
  if (raw.length > limit) {
    throw new FieldProtectionError("SCAN_LIMIT", model);
  }
  const opened = (await openResult(model, raw, scope)) as Record<
    string,
    unknown
  >[];
  let rows = opened.filter((r) => matches(model, r, args.where));
  if (order) {
    rows = [...rows].sort((a, b) => {
      for (const o of order) {
        const c = cmp(a[o.field], b[o.field]);
        if (c) return c * o.dir;
      }
      return 0;
    });
  }
  return { rows, added };
}

// ─── Middleware ──────────────────────────────────────────────────────────────

const WRITE_DATA = new Set(["create", "update", "updateMany", "createMany"]);
const MEMORY_READS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "findUnique",
  "findUniqueOrThrow",
]);

function checkNoEncryptedRefs(model: string, args: any, action: string): void {
  const refs = new Set<string>();
  for (const k of [
    "by",
    "_sum",
    "_avg",
    "_min",
    "_max",
    "_count",
    "having",
    "distinct",
    "orderBy",
  ]) {
    const v = args?.[k];
    if (!v) continue;
    const s = JSON.stringify(v);
    for (const f of Object.keys(PII_REGISTRY[model] ?? {})) {
      if (s.includes(`"${f}"`)) refs.add(f);
    }
  }
  if (refs.size) {
    throw new FieldProtectionError(
      "UNSUPPORTED_QUERY",
      model,
      [...refs][0] + ` (${action})`,
    );
  }
}

/** Raw pipeline stages that compare, group or sort on a field's value. */
const VALUE_STAGES = [
  "$match",
  "$sort",
  "$group",
  "$bucket",
  "$bucketAuto",
  "$sortByCount",
  "$lookup",
  "$graphLookup",
  "$facet",
  "$setWindowFields",
];

export function assertRawPipelineSafe(model: string, pipeline: unknown): void {
  if (!Array.isArray(pipeline)) return;
  const fields = Object.keys(PII_REGISTRY[model] ?? {});
  for (const stage of pipeline) {
    for (const [op, body] of Object.entries(stage as Record<string, unknown>)) {
      const s = JSON.stringify(body);
      for (const f of fields) {
        const asPath = s.includes(`"$${f}"`) || s.includes(`"$${f}.`);
        const asKey = s.includes(`"${f}":`) || s.includes(`"${f}.`);
        if (
          VALUE_STAGES.includes(op)
            ? asPath || asKey
            : asPath && op !== "$project"
        ) {
          throw new FieldProtectionError(
            "UNSUPPORTED_QUERY",
            model,
            `${f} (${op})`,
          );
        }
      }
    }
  }
}

/**
 * Opens rows from a raw aggregation run on the current request's database
 * (the bound tenant, or master when none is bound).
 */
export function openRawForCurrentDb(
  model: string,
  rows: unknown,
): Promise<unknown> {
  const tenant = getTenantClient() as unknown as Record<symbol, string> | null;
  return openRawRows(model, rows, scopeFor(tenant?.[SCOPE_TAG] ?? "master"));
}

const delegateOf = (client: PrismaClient, model: string) =>
  (client as any)[model[0].toLowerCase() + model.slice(1)];

export function attachFieldProtection(
  client: PrismaClient,
  scopeName: string,
): void {
  const scope = scopeFor(scopeName);
  (client as unknown as Record<symbol, string>)[SCOPE_TAG] = scopeName;
  (client as any).$use(async (params: any, next: (p: any) => Promise<any>) => {
    const model: string | undefined = params.model;
    if (!model) return next(params);
    // Models with no protected field of their own still pass through: they
    // can include, filter on or nested-write a protected relation.
    if (
      !PII_REGISTRY[model] &&
      (params.action === "aggregateRaw" ||
        params.action === "findRaw" ||
        params.action === "runCommandRaw")
    ) {
      return next(params);
    }
    const action: string = params.action;
    let args: any = params.args ?? {};

    if (action === "aggregateRaw") {
      assertRawPipelineSafe(model, args.pipeline);
      return openRawRows(model, await next(params), scope);
    }
    if (action === "findRaw") {
      if (
        args.filter &&
        Object.keys(PII_REGISTRY[model] ?? {}).some((f) =>
          JSON.stringify(args.filter).includes(`"${f}"`),
        )
      ) {
        throw new FieldProtectionError("UNSUPPORTED_QUERY", model);
      }
      return openRawRows(model, await next(params), scope);
    }
    if (action === "aggregate" || action === "groupBy") {
      checkNoEncryptedRefs(model, args, action);
      const p = await planWhere(model, args.where, scope);
      if (p.memory)
        throw new FieldProtectionError("UNSUPPORTED_QUERY", model, action);
      return next({
        ...params,
        args: { ...args, where: p.server === TRUE ? undefined : p.server },
      });
    }

    // Writes: seal data first.
    if (WRITE_DATA.has(action)) {
      args = {
        ...args,
        data: await sealData(
          model,
          args.data,
          scope,
          action.startsWith("create"),
        ),
      };
    } else if (action === "upsert") {
      args = {
        ...args,
        create: await sealData(model, args.create, scope, true),
        update: await sealData(model, args.update, scope, false),
      };
    }

    // Where: rewrite, or resolve in memory.
    if (
      args.where !== undefined ||
      params.action === "findMany" ||
      action === "count"
    ) {
      const order = MEMORY_READS.has(action)
        ? memoryOrder(model, args.orderBy)
        : null;
      const p = await planWhere(model, args.where, scope);
      const server = p.server === TRUE ? {} : p.server;

      if ((p.memory || order) && MEMORY_READS.has(action)) {
        // Prisma ignores a changed action for count, so non-findMany reads
        // fetch through the client (the hook passes that plain query through).
        const fetchRows = (a: any) =>
          action === "findMany"
            ? next({ ...params, args: a })
            : delegateOf(client, model).findMany(a);
        const { rows, added } = await readInMemory(
          model,
          action,
          args,
          server,
          order,
          scope,
          fetchRows,
        );
        if (action === "count") return rows.length;
        const skip = args.skip ?? 0;
        const page = rows.slice(
          skip,
          args.take !== undefined ? skip + Math.abs(args.take) : undefined,
        );
        for (const r of page) for (const f of added) delete r[f];
        if (action === "findMany") return page;
        if (!page[0] && action.endsWith("OrThrow")) {
          throw new Prisma.PrismaClientKnownRequestError(
            "No record was found for a query.",
            { code: "P2025", clientVersion: Prisma.prismaVersion.client },
          );
        }
        return page[0] ?? null;
      }

      if (p.memory && (action === "updateMany" || action === "deleteMany")) {
        const { rows } = await readInMemory(
          model,
          "findMany",
          { where: args.where, select: { id: true } },
          server,
          null,
          scope,
          (a) => delegateOf(client, model).findMany(a),
        );
        args = { ...args, where: { id: { in: rows.map((r) => r.id) } } };
      } else if (p.memory) {
        throw new FieldProtectionError("UNSUPPORTED_QUERY", model, action);
      } else if (
        touchesBidx(model, args.where) &&
        [
          "update",
          "upsert",
          "delete",
          "findUnique",
          "findUniqueOrThrow",
        ].includes(action)
      ) {
        // Unique lookups on an indexed field: resolve the id, then act on it.
        const found = await delegateOf(client, model).findFirst({
          where: server,
          select: { id: true },
        });
        if (action === "findUnique" || action === "findUniqueOrThrow") {
          if (!found) {
            if (action === "findUnique") return null;
            throw new Prisma.PrismaClientKnownRequestError(
              "No record was found for a query.",
              { code: "P2025", clientVersion: Prisma.prismaVersion.client },
            );
          }
        }
        args = {
          ...args,
          where: { id: found?.id ?? "000000000000000000000000" },
        };
        if (action === "upsert" && !found) {
          const res = await next({
            ...params,
            action: "create",
            args: {
              data: args.create,
              select: args.select,
              include: args.include,
            },
          });
          return openResult(model, res, scope);
        }
      } else if (args.where !== undefined || p.server !== TRUE) {
        args = {
          ...args,
          where:
            p.server === TRUE
              ? args.where === undefined
                ? undefined
                : {}
              : p.server,
        };
      }
    }
    if (args.distinct)
      checkNoEncryptedRefs(model, { distinct: args.distinct }, action);
    if (!MEMORY_READS.has(action) && args.orderBy)
      checkNoEncryptedRefs(model, { orderBy: args.orderBy }, action);

    const res = await next({ ...params, args });
    return openResult(model, res, scope);
  });
}
