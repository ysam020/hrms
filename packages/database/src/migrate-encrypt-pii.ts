/**
 * Seals existing protected fields in place, in every master and tenant
 * collection the registry lists. Run through migrate-encrypt-pii.cli.ts.
 *
 * Modes:
 *   dry-run   reads and counts; writes nothing (default)
 *   apply     seals plaintext, upgrades older formats, backfills blind indexes
 *   rollback  restores plaintext from ciphertext (keyed hashes stay hashed)
 *   verify    counts any value not in the sealed format; writes nothing
 *
 * Every document is changed with a compare-and-swap on the values it was read
 * with, then re-read and checked; a failed check restores the original.
 * Progress is stored per (database, collection) in pii_migration_status, so
 * an interrupted run resumes. Output is counts only, never a value.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  FieldKeyRing,
  aesDecrypt,
  ciphertextKeyInfo,
  claimsFieldCiphertext,
  decryptField,
  isEncrypted,
  isBlindIndexed,
  normalizeForIndex,
} from "@hrms/crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma, MASTER_SCOPE } from "./prismaClient";
import { getClientForDb } from "./tenantClientPool";
import { assertConfirmedWriteTarget } from "./scriptGuard";
import { sensitiveWritesAllowed } from "./fieldProtection";
import { fieldKeyStore, kekProviderFromEnv } from "./fieldKeys";
import { PII_REGISTRY, type FieldRule } from "./piiRegistry";
import {
  MASTER_PROTECTED_MODELS,
  TENANT_PROTECTED_MODELS,
  validatorFor,
} from "./fieldValidators";

export type MigrationMode = "dry-run" | "apply" | "rollback" | "verify";
export type DatabaseSelection = "master" | "tenant" | "all";

export interface MigrationOptions {
  mode: MigrationMode;
  database?: DatabaseSelection;
  /** Limit to these tenant database names. */
  tenants?: string[];
  /** Limit to these models. */
  models?: string[];
  rekey?: boolean;
  batchSize?: number;
  /** Ignore stored progress and start each collection from the beginning. */
  restart?: boolean;
  /** Test hook: stop after this many batches in total. */
  maxBatches?: number;
  /** Test hooks around each document write. */
  beforeWrite?: (collection: string, id: string) => Promise<void>;
  afterWrite?: (collection: string, id: string) => Promise<void>;
}

export interface CollectionReport {
  database: string;
  collection: string;
  documentsScanned: number;
  documentsChanged: number;
  fieldsTransformed: number;
  fieldsAlreadySealed: number;
  fieldsEmpty: number;
  fieldsUnreadable: number;
  fieldsPlaintextRemaining: number;
  fieldsSkippedConcurrentChange: number;
  documentsFailedVerification: number;
  byField: Record<string, number>;
  lastId: string | null;
  complete: boolean;
}

export interface MigrationReport {
  mode: MigrationMode;
  complete: boolean;
  collections: CollectionReport[];
  totals: Omit<
    CollectionReport,
    "database" | "collection" | "byField" | "lastId" | "complete"
  >;
}

type Raw = (cmd: Record<string, unknown>) => Promise<any>;
const rawOf =
  (client: PrismaClient): Raw =>
  (cmd) =>
    (client.$runCommandRaw as (c: unknown) => Promise<any>)(cmd);

// ─── Extended JSON (what $runCommandRaw returns) to plain values ─────────────

function fromEjson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromEjson);
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, any>;
  const keys = Object.keys(o);
  if (keys.length === 1) {
    const k = keys[0];
    if (k === "$oid") return o.$oid;
    if (k === "$date") {
      const d = o.$date;
      return new Date(typeof d === "object" ? Number(d.$numberLong) : d);
    }
    if (
      k === "$numberDouble" ||
      k === "$numberInt" ||
      k === "$numberLong" ||
      k === "$numberDecimal"
    ) {
      return Number(o[k]);
    }
  }
  return Object.fromEntries(keys.map((k) => [k, fromEjson(o[k])]));
}

function toEjson(v: unknown): unknown {
  if (v instanceof Date) return { $date: v.toISOString() };
  return v;
}

// ─── One field ───────────────────────────────────────────────────────────────

const JWT = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface Rings {
  enc: FieldKeyRing;
  bidx: FieldKeyRing;
}

type Outcome =
  | { kind: "empty" | "sealed" | "unreadable" | "plaintext" }
  | { kind: "change"; next: unknown; plain: unknown };

/** The plaintext of a stored value, or undefined when it can't be read. */
function plainOf(
  model: string,
  field: string,
  rule: FieldRule,
  stored: unknown,
  rings: Rings,
): { value: unknown; sealedCurrent: boolean } | undefined {
  const ctx = { model, field };
  if (isEncrypted(stored)) {
    try {
      const info = ciphertextKeyInfo(stored)!;
      return {
        value: rings.enc.decrypt(stored, ctx),
        sealedCurrent: info.version === rings.enc.activeVersion,
      };
    } catch {
      return undefined;
    }
  }
  if (typeof stored === "string" && stored.startsWith("enc:v1:")) {
    try {
      const opened = decryptField(stored, field);
      return {
        value: rule.kind === "json" ? JSON.parse(opened) : opened,
        sealedCurrent: false,
      };
    } catch {
      return undefined;
    }
  }
  if (claimsFieldCiphertext(stored)) return undefined;
  let v = fromEjson(stored);
  if (
    "legacyCbc" in rule &&
    rule.legacyCbc &&
    typeof v === "string" &&
    /^[a-f0-9]{32}:[a-f0-9]+$/i.test(v)
  ) {
    try {
      v = aesDecrypt(v);
    } catch {
      return undefined;
    }
  }
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
  return ok ? { value: v, sealedCurrent: false } : undefined;
}

function transform(
  model: string,
  field: string,
  rule: FieldRule,
  stored: unknown,
  rings: Rings,
  mode: MigrationMode,
  rekey: boolean,
): Outcome {
  if (stored === null || stored === undefined || stored === "")
    return { kind: "empty" };
  if (rule.kind === "hash") {
    // One-way already; only the raw refresh tokens of older builds need it.
    if (
      rule.format === "hex" &&
      typeof stored === "string" &&
      JWT.test(stored)
    ) {
      return mode === "rollback"
        ? { kind: "sealed" }
        : { kind: "change", next: sha256(stored), plain: null };
    }
    return { kind: "sealed" };
  }
  if (rule.kind === "hmac") {
    if (isBlindIndexed(stored)) return { kind: "sealed" };
    if (mode === "rollback") return { kind: "sealed" };
    if (typeof stored !== "string") return { kind: "unreadable" };
    return {
      kind: "change",
      next: rings.bidx.blindIndex(stored, { model, field }),
      plain: null,
    };
  }
  const ctx = { model, field };
  if (rule.kind === "stringArray" || rule.kind === "compositeList") {
    if (!Array.isArray(stored)) return { kind: "unreadable" };
    let changed = false;
    let bad = false;
    const sealOrOpen = (v: unknown, c: typeof ctx): unknown => {
      if (v === null || v === undefined || v === "") return v;
      if (mode === "rollback") {
        if (!isEncrypted(v)) return v;
        try {
          changed = true;
          return rings.enc.decrypt(v, c);
        } catch {
          bad = true;
          return v;
        }
      }
      if (
        isEncrypted(v) &&
        (!rekey || ciphertextKeyInfo(v)!.version === rings.enc.activeVersion)
      )
        return v;
      const p = plainOf(model, c.field, { kind: "string" }, v, rings);
      if (!p || typeof p.value !== "string") {
        bad = true;
        return v;
      }
      changed = true;
      return rings.enc.encrypt(p.value, c);
    };
    const next =
      rule.kind === "stringArray"
        ? stored.map((v) => sealOrOpen(v, ctx))
        : stored.map((item) => {
            if (!item || typeof item !== "object") return item;
            const o = { ...(item as Record<string, unknown>) };
            for (const f of (rule as { fields: string[] }).fields)
              o[f] = sealOrOpen(o[f], { model, field: `${field}.${f}` });
            return o;
          });
    if (bad) return { kind: "unreadable" };
    if (mode === "verify")
      return changed ? { kind: "plaintext" } : { kind: "sealed" };
    return changed ? { kind: "change", next, plain: next } : { kind: "sealed" };
  }

  if (mode === "rollback") {
    if (!isEncrypted(stored)) return { kind: "sealed" };
    try {
      return {
        kind: "change",
        next: toEjson(rings.enc.decrypt(stored, ctx)),
        plain: null,
      };
    } catch {
      return { kind: "unreadable" };
    }
  }
  const p = plainOf(model, field, rule, stored, rings);
  if (!p) return { kind: "unreadable" };
  if (isEncrypted(stored) && (p.sealedCurrent || !rekey))
    return { kind: "sealed" };
  if (mode === "verify") return { kind: "plaintext" };
  const v = rule.kind === "date" ? p.value : p.value;
  return { kind: "change", next: rings.enc.encrypt(v, ctx), plain: p.value };
}

// ─── One collection ──────────────────────────────────────────────────────────

/**
 * Apply creates a scope's keys on first use. A dry run or verify never
 * writes keys: if a scope has none yet, nothing in it can be sealed, so a
 * throwaway in-memory key is enough to count what would change.
 */
async function ringFor(
  scope: string,
  purpose: "enc" | "bidx",
  mode: MigrationMode,
): Promise<FieldKeyRing> {
  try {
    return await fieldKeyStore().ring(scope, purpose, mode === "apply");
  } catch (err) {
    if (
      (mode === "dry-run" || mode === "verify") &&
      (err as { code?: string }).code === "MISSING_KEY"
    ) {
      return new FieldKeyRing(scope, [{ version: 1, key: randomBytes(32) }]);
    }
    throw err;
  }
}

function emptyCollection(
  database: string,
  collection: string,
): CollectionReport {
  return {
    database,
    collection,
    documentsScanned: 0,
    documentsChanged: 0,
    fieldsTransformed: 0,
    fieldsAlreadySealed: 0,
    fieldsEmpty: 0,
    fieldsUnreadable: 0,
    fieldsPlaintextRemaining: 0,
    fieldsSkippedConcurrentChange: 0,
    documentsFailedVerification: 0,
    byField: {},
    lastId: null,
    complete: false,
  };
}

const STATUS_KEYS = [
  "documentsScanned",
  "documentsChanged",
  "fieldsTransformed",
  "fieldsAlreadySealed",
  "fieldsEmpty",
  "fieldsUnreadable",
  "fieldsPlaintextRemaining",
  "fieldsSkippedConcurrentChange",
  "documentsFailedVerification",
] as const;

async function loadStatus(
  rep: CollectionReport,
  mode: MigrationMode,
  restart: boolean,
) {
  if (restart || mode === "verify" || mode === "dry-run") return;
  const row = await prisma.piiMigrationStatus.findFirst({
    where: { database: rep.database, collection: rep.collection, mode },
  });
  if (!row || row.complete) return;
  rep.lastId = row.lastId;
  const counts = (row.counts ?? {}) as Record<string, any>;
  for (const k of STATUS_KEYS) rep[k] = Number(counts[k] ?? 0);
  rep.byField = counts.byField ?? {};
}

async function saveStatus(rep: CollectionReport, mode: MigrationMode) {
  if (mode === "verify" || mode === "dry-run") return;
  const counts = Object.fromEntries([
    ...STATUS_KEYS.map((k) => [k, rep[k]]),
    ["byField", rep.byField],
  ]);
  const where = { database: rep.database, collection: rep.collection, mode };
  const existing = await prisma.piiMigrationStatus.findFirst({
    where,
    select: { id: true },
  });
  const data = { lastId: rep.lastId, complete: rep.complete, counts };
  if (existing)
    await prisma.piiMigrationStatus.update({
      where: { id: existing.id },
      data,
    });
  else await prisma.piiMigrationStatus.create({ data: { ...where, ...data } });
}

async function migrateCollection(
  raw: Raw,
  database: string,
  scope: string,
  model: string,
  options: MigrationOptions,
  budget: { batches: number },
): Promise<CollectionReport> {
  const v = validatorFor(model)!;
  const rep = emptyCollection(database, v.collection);
  await loadStatus(rep, options.mode, !!options.restart);
  const rules = PII_REGISTRY[model];
  const fields = Object.keys(rules);
  const bidxFields = fields.filter(
    (f) => "blindIndex" in rules[f] && (rules[f] as any).blindIndex,
  );
  const rings: Rings = {
    enc: await ringFor(scope, "enc", options.mode),
    bidx: await ringFor(scope, "bidx", options.mode),
  };
  const projection = Object.fromEntries(
    [...fields, ...bidxFields.map((f) => `${f}_bidx`)].map((f) => [f, 1]),
  );
  const batchSize = options.batchSize ?? 200;

  for (;;) {
    if (
      options.maxBatches !== undefined &&
      budget.batches >= options.maxBatches
    )
      return rep;
    const res = await raw({
      find: v.collection,
      filter: rep.lastId ? { _id: { $gt: { $oid: rep.lastId } } } : {},
      sort: { _id: 1 },
      limit: batchSize,
      batchSize,
      singleBatch: true,
      projection,
    });
    const docs = res.cursor.firstBatch as Record<string, any>[];
    if (docs.length === 0) {
      rep.complete = true;
      await saveStatus(rep, options.mode);
      return rep;
    }
    for (const doc of docs) {
      await migrateDoc(
        raw,
        v.collection,
        model,
        doc,
        rules,
        bidxFields,
        rings,
        options,
        rep,
      );
      rep.documentsScanned++;
      rep.lastId = doc._id.$oid;
    }
    budget.batches++;
    await saveStatus(rep, options.mode);
  }
}

async function migrateDoc(
  raw: Raw,
  collection: string,
  model: string,
  doc: Record<string, any>,
  rules: Record<string, FieldRule>,
  bidxFields: string[],
  rings: Rings,
  options: MigrationOptions,
  rep: CollectionReport,
): Promise<void> {
  const id = doc._id.$oid as string;
  const expected: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  const plains: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};

  for (const [field, rule] of Object.entries(rules)) {
    const out = transform(
      model,
      field,
      rule,
      doc[field],
      rings,
      options.mode,
      !!options.rekey,
    );
    if (out.kind === "empty") rep.fieldsEmpty++;
    else if (out.kind === "sealed") rep.fieldsAlreadySealed++;
    else if (out.kind === "unreadable") rep.fieldsUnreadable++;
    else if (out.kind === "plaintext") rep.fieldsPlaintextRemaining++;
    else if ("next" in out) {
      expected[field] = doc[field];
      next[field] = out.next;
      plains[field] = out.plain;
    }
  }
  // Blind indexes follow the plaintext, whether or not the value changed.
  for (const field of bidxFields) {
    const rule = rules[field] as Extract<FieldRule, { blindIndex?: unknown }>;
    const bf = `${field}_bidx`;
    if (options.mode === "rollback") {
      if (doc[bf] !== undefined) {
        expected[bf] = doc[bf];
        unset[bf] = "";
      }
      continue;
    }
    const p = plainOf(model, field, rule, doc[field], rings);
    const want =
      p && typeof p.value === "string" && p.value !== ""
        ? rings.bidx.blindIndex(normalizeForIndex(p.value, rule.blindIndex!), {
            model,
            field,
          })
        : null;
    if ((doc[bf] ?? null) !== want) {
      if (options.mode === "verify") rep.fieldsPlaintextRemaining++;
      else {
        expected[bf] = doc[bf] ?? null;
        next[bf] = want;
      }
    }
  }

  const changed = [...Object.keys(next), ...Object.keys(unset)];
  if (changed.length === 0) return;
  const count = () => {
    rep.documentsChanged++;
    rep.fieldsTransformed += changed.length;
    for (const f of changed) rep.byField[f] = (rep.byField[f] ?? 0) + 1;
  };
  if (options.mode === "dry-run" || options.mode === "verify") {
    count();
    return;
  }

  await options.beforeWrite?.(collection, id);
  // A field absent from the document matches null in the filter, which is
  // what was read.
  const res = await raw({
    update: collection,
    updates: [
      {
        q: { _id: { $oid: id }, ...expected },
        u: {
          ...(Object.keys(next).length ? { $set: next } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        multi: false,
      },
    ],
  });
  if (res.writeErrors?.length) {
    rep.documentsFailedVerification++;
    return;
  }
  if ((res.nModified ?? 0) !== 1) {
    rep.fieldsSkippedConcurrentChange += changed.length;
    return;
  }
  await options.afterWrite?.(collection, id);

  if (options.mode === "apply") {
    const back = (
      await raw({
        find: collection,
        filter: { _id: { $oid: id } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    const ok =
      !!back &&
      Object.entries(next).every(([f, v]) => {
        if (!(f in plains))
          return JSON.stringify(back[f] ?? null) === JSON.stringify(v);
        if (plains[f] === null) return back[f] === v;
        const rule = rules[f];
        if (rule.kind === "stringArray" || rule.kind === "compositeList")
          return JSON.stringify(back[f]) === JSON.stringify(v);
        try {
          const opened = rings.enc.decrypt(back[f], { model, field: f });
          return JSON.stringify(opened) === JSON.stringify(plains[f]);
        } catch {
          return false;
        }
      });
    if (!ok) {
      rep.documentsFailedVerification++;
      // Put the original back, but only if what is stored is still ours.
      await raw({
        update: collection,
        updates: [
          {
            q: { _id: { $oid: id }, ...next },
            u: { $set: expected },
            multi: false,
          },
        ],
      });
      return;
    }
  }
  count();
}

// ─── Databases ───────────────────────────────────────────────────────────────

export async function discoverTenantDatabases(
  only?: string[],
): Promise<string[]> {
  const tenants = await prisma.tenant.findMany({
    where: { dbName: { not: null } },
    select: { dbName: true },
  });
  const names = tenants.map((t) => t.dbName!).sort();
  return only?.length ? names.filter((n) => only.includes(n)) : names;
}

const sum = (rows: CollectionReport[], k: (typeof STATUS_KEYS)[number]) =>
  rows.reduce((a, r) => a + r[k], 0);

export async function runPiiMigration(
  options: MigrationOptions,
): Promise<MigrationReport> {
  const selection = options.database ?? "all";
  const targets: {
    database: string;
    scope: string;
    client: PrismaClient;
    models: string[];
  }[] = [];
  const pick = (models: string[]) =>
    options.models?.length
      ? models.filter((m) => options.models!.includes(m))
      : models;
  if (selection !== "tenant") {
    const name = (await rawOf(prisma)({ dbStats: 1 })).db as string;
    targets.push({
      database: name,
      scope: MASTER_SCOPE,
      client: prisma,
      models: pick(MASTER_PROTECTED_MODELS),
    });
  }
  if (selection !== "master") {
    for (const db of await discoverTenantDatabases(options.tenants)) {
      targets.push({
        database: db,
        scope: db,
        client: getClientForDb(db),
        models: pick(TENANT_PROTECTED_MODELS),
      });
    }
  }
  const budget = { batches: 0 };
  const collections: CollectionReport[] = [];
  let complete = true;
  for (const t of targets) {
    for (const model of t.models) {
      const rep = await migrateCollection(
        rawOf(t.client),
        t.database,
        t.scope,
        model,
        options,
        budget,
      );
      collections.push(rep);
      if (!rep.complete) {
        complete = false;
        break;
      }
    }
    if (!complete) break;
  }
  const totals = Object.fromEntries(
    STATUS_KEYS.map((k) => [k, sum(collections, k)]),
  ) as MigrationReport["totals"];
  return { mode: options.mode, complete, collections, totals };
}

export function assertMigrationAllowed(
  mode: MigrationMode,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const kek = kekProviderFromEnv(env).kekId;
  if (mode === "dry-run" || mode === "verify") return;
  assertConfirmedWriteTarget("migrate-encrypt-pii");
  if (!sensitiveWritesAllowed(env)) {
    throw new Error(
      "migrate-encrypt-pii refused: this process may not write sensitive fields to a shared database.",
    );
  }
  // The operator states which key-encryption key the data will be sealed
  // under, so a development key can never be used against production data.
  if (env.EXPECTED_KEK_ID !== kek) {
    throw new Error(
      "migrate-encrypt-pii refused: EXPECTED_KEK_ID does not match this process's key-encryption key.",
    );
  }
}
