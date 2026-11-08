/**
 * Seals existing sensitive User fields in place.
 *
 * Run through migrate-encrypt-pii.cli.ts, which documents the options.
 *
 * Output is counts only. Plaintext is never printed or written to the state
 * file. Each document is updated with a compare-and-swap on the original
 * values, then re-read and verified, and restored if verification fails.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import {
  SENSITIVE_FIELDS,
  FACE_DESCRIPTOR_FIELD,
  encryptField,
  decryptField,
  claimsFieldCiphertext,
  fieldKeyId,
  activeFieldKeyId,
  readSensitiveStrict,
} from "@hrms/crypto";
import { prisma } from "./prismaClient";
import { assertConfirmedWriteTarget } from "./scriptGuard";
import { sensitiveWritesAllowed } from "./fieldEncryption";

export type MigrationMode = "dry-run" | "apply" | "rollback";

export interface MigrationOptions {
  mode: MigrationMode;
  rekey?: boolean;
  batchSize?: number;
  stateFile?: string;
  /** Test hook: stop after this many batches, as an interruption would. */
  maxBatches?: number;
  /** Test hook: alters a value between reading and writing. */
  beforeWrite?: (id: string) => Promise<void>;
  /** Test hook: runs after the write, before the verification read. */
  afterWrite?: (id: string) => Promise<void>;
}

export interface MigrationReport {
  mode: MigrationMode;
  documentsScanned: number;
  documentsChanged: number;
  fieldsTransformed: number;
  fieldsAlreadyEncrypted: number;
  fieldsEmpty: number;
  fieldsUnreadable: number;
  fieldsSkippedConcurrentChange: number;
  documentsFailedVerification: number;
  byField: Record<string, number>;
  lastId: string | null;
  complete: boolean;
}

const FIELDS = [...SENSITIVE_FIELDS, FACE_DESCRIPTOR_FIELD] as string[];
const COLLECTION = "users";

const emptyReport = (mode: MigrationMode): MigrationReport => ({
  mode,
  documentsScanned: 0,
  documentsChanged: 0,
  fieldsTransformed: 0,
  fieldsAlreadyEncrypted: 0,
  fieldsEmpty: 0,
  fieldsUnreadable: 0,
  fieldsSkippedConcurrentChange: 0,
  documentsFailedVerification: 0,
  byField: {},
  lastId: null,
  complete: false,
});

type RawDoc = Record<string, unknown> & { _id: { $oid: string } };

const plainNumber = (n: unknown): number => {
  if (typeof n === "number") return n;
  const wrapped = n as Record<string, string>;
  return Number(
    wrapped?.$numberDouble ?? wrapped?.$numberInt ?? wrapped?.$numberLong,
  );
};

async function readBatch(after: string | null, limit: number) {
  const result = (await prisma.$runCommandRaw({
    find: COLLECTION,
    filter: after ? { _id: { $gt: { $oid: after } } } : {},
    sort: { _id: 1 },
    limit,
    batchSize: limit,
    singleBatch: true,
    projection: Object.fromEntries(FIELDS.map((f) => [f, 1])),
  })) as unknown as { cursor: { firstBatch: RawDoc[] } };
  return result.cursor.firstBatch;
}

async function readDoc(id: string): Promise<RawDoc | undefined> {
  const result = (await prisma.$runCommandRaw({
    find: COLLECTION,
    filter: { _id: { $oid: id } },
    limit: 1,
    singleBatch: true,
    projection: Object.fromEntries(FIELDS.map((f) => [f, 1])),
  })) as unknown as { cursor: { firstBatch: RawDoc[] } };
  return result.cursor.firstBatch[0];
}

async function compareAndSet(
  id: string,
  expected: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<boolean> {
  const result = (await prisma.$runCommandRaw({
    update: COLLECTION,
    updates: [
      {
        q: { _id: { $oid: id }, ...expected },
        u: { $set: next },
        multi: false,
      },
    ],
  } as never)) as unknown as { nModified?: number; n?: number };
  return (result.nModified ?? 0) === 1;
}

const isFace = (field: string) => field === FACE_DESCRIPTOR_FIELD;

/** Computes the sealed form of one stored value, or null to leave it alone. */
function transformForApply(
  field: string,
  stored: unknown,
  rekey: boolean,
  report: MigrationReport,
): { sealed: string; plaintext: string } | null {
  if (
    stored === null ||
    stored === undefined ||
    stored === "" ||
    (Array.isArray(stored) && stored.length === 0)
  ) {
    report.fieldsEmpty++;
    return null;
  }

  let plaintext: string;
  if (claimsFieldCiphertext(stored)) {
    try {
      plaintext = decryptField(stored as string, field);
    } catch {
      report.fieldsUnreadable++;
      return null;
    }
    if (!rekey || fieldKeyId(stored) === activeFieldKeyId()) {
      report.fieldsAlreadyEncrypted++;
      return null;
    }
  } else if (isFace(field)) {
    if (!Array.isArray(stored)) {
      report.fieldsUnreadable++;
      return null;
    }
    plaintext = JSON.stringify(stored.map(plainNumber));
  } else if (typeof stored === "string") {
    plaintext = readSensitiveStrict(stored, field);
  } else {
    report.fieldsUnreadable++;
    return null;
  }

  const sealed = encryptField(plaintext, field);
  // Verified before anything is written.
  if (decryptField(sealed, field) !== plaintext) {
    report.fieldsUnreadable++;
    return null;
  }
  return { sealed, plaintext };
}

function transformForRollback(
  field: string,
  stored: unknown,
  report: MigrationReport,
): { value: unknown } | null {
  if (stored === null || stored === undefined || stored === "") {
    report.fieldsEmpty++;
    return null;
  }
  if (!claimsFieldCiphertext(stored)) {
    report.fieldsAlreadyEncrypted++;
    return null;
  }
  try {
    const opened = decryptField(stored as string, field);
    return { value: isFace(field) ? JSON.parse(opened) : opened };
  } catch {
    report.fieldsUnreadable++;
    return null;
  }
}

function matches(field: string, stored: unknown, plaintext: string): boolean {
  if (!claimsFieldCiphertext(stored)) return false;
  try {
    return decryptField(stored as string, field) === plaintext;
  } catch {
    return false;
  }
}

async function migrateDoc(
  doc: RawDoc,
  options: MigrationOptions,
  report: MigrationReport,
): Promise<void> {
  const id = doc._id.$oid;
  const expected: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  const plaintexts: Record<string, string> = {};

  for (const field of FIELDS) {
    if (options.mode === "rollback") {
      const out = transformForRollback(field, doc[field], report);
      if (out) {
        expected[field] = doc[field];
        next[field] = out.value;
      }
    } else {
      const out = transformForApply(field, doc[field], !!options.rekey, report);
      if (out) {
        expected[field] = doc[field];
        next[field] = out.sealed;
        plaintexts[field] = out.plaintext;
      }
    }
  }

  const fields = Object.keys(next);
  if (fields.length === 0) return;

  const count = () => {
    report.documentsChanged++;
    report.fieldsTransformed += fields.length;
    for (const f of fields) report.byField[f] = (report.byField[f] ?? 0) + 1;
  };

  if (options.mode === "dry-run") {
    count();
    return;
  }

  await options.beforeWrite?.(id);
  if (!(await compareAndSet(id, expected, next))) {
    // Someone changed the record after it was read. A later run picks it up.
    report.fieldsSkippedConcurrentChange += fields.length;
    return;
  }
  await options.afterWrite?.(id);

  if (options.mode === "apply") {
    const stored = await readDoc(id);
    const verified =
      !!stored && fields.every((f) => matches(f, stored[f], plaintexts[f]));
    if (!verified) {
      report.documentsFailedVerification++;
      await compareAndSet(id, next, expected);
      return;
    }
  }
  count();
}

function loadState(path: string | undefined, report: MigrationReport) {
  if (!path) return report;
  try {
    return { ...report, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return report;
    throw err;
  }
}

function saveState(path: string | undefined, report: MigrationReport) {
  if (!path) return;
  writeFileSync(`${path}.tmp`, JSON.stringify(report), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

export async function runPiiMigration(
  options: MigrationOptions,
): Promise<MigrationReport> {
  const batchSize = options.batchSize ?? 200;
  const report = loadState(options.stateFile, emptyReport(options.mode));
  if (report.mode !== options.mode) {
    throw new Error("State file belongs to a different migration mode.");
  }
  report.complete = false;

  let batches = 0;
  for (;;) {
    if (options.maxBatches !== undefined && batches >= options.maxBatches) {
      return report;
    }
    const docs = await readBatch(report.lastId, batchSize);
    if (docs.length === 0) {
      report.complete = true;
      saveState(options.stateFile, report);
      return report;
    }
    for (const doc of docs) {
      await migrateDoc(doc, options, report);
      report.documentsScanned++;
      report.lastId = doc._id.$oid;
    }
    saveState(options.stateFile, report);
    batches++;
  }
}

export function assertMigrationAllowed(
  mode: MigrationMode,
  env: NodeJS.ProcessEnv = process.env,
): void {
  activeFieldKeyId();
  if (mode === "dry-run") return;
  assertConfirmedWriteTarget("migrate-encrypt-pii");
  if (!sensitiveWritesAllowed(env)) {
    throw new Error(
      "migrate-encrypt-pii refused: this process may not write sensitive fields to a shared database.",
    );
  }
  // Development holds a different key from production and shares its
  // database, so the operator must state which key the data will be sealed
  // under.
  if (env.EXPECTED_FIELD_KEY_ID !== activeFieldKeyId()) {
    throw new Error(
      "migrate-encrypt-pii refused: EXPECTED_FIELD_KEY_ID does not match this process's active key.",
    );
  }
}
