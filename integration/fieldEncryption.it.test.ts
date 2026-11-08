/**
 * Field encryption against a real MongoDB (local, synthetic data only):
 * the write middleware, and the migration in every mode.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encryptField,
  aesEncrypt,
  isFieldCiphertext,
  readFaceDescriptor,
  readSensitiveStrict,
  activeFieldKeyId,
} from "@hrms/crypto";

process.env.CRYPTO_ENCRYPTION_KEY = "c".repeat(64);

import { prisma } from "@hrms/db";
import {
  runPiiMigration,
  assertMigrationAllowed,
} from "../packages/database/src/migrate-encrypt-pii";
import { sensitiveWritesAllowed } from "../packages/database/src/fieldEncryption";

const AADHAAR = "111122223333";
const PAN = "ABCDE1234F";
const BANK = "000111222333";
const FACE = Array.from({ length: 128 }, (_, i) => (i + 0.5) / 128);

let seq = 0;
const nextId = () =>
  `7d00000000000000000${String(++seq).padStart(5, "0")}`.slice(-24);

async function insertRaw(fields: Record<string, unknown>): Promise<string> {
  const id = nextId();
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [
      {
        _id: { $oid: id },
        username: `syn-${id}`,
        email: `syn-${id}@example.test`,
        ...fields,
      },
    ],
  } as never);
  return id;
}

async function raw(id: string): Promise<Record<string, any>> {
  const r = (await prisma.$runCommandRaw({
    find: "users",
    filter: { _id: { $oid: id } },
    limit: 1,
    singleBatch: true,
  })) as any;
  return r.cursor.firstBatch[0];
}

async function setRaw(id: string, set: Record<string, unknown>) {
  await prisma.$runCommandRaw({
    update: "users",
    updates: [{ q: { _id: { $oid: id } }, u: { $set: set } }],
  } as never);
}

beforeEach(async () => {
  await prisma.$runCommandRaw({
    delete: "users",
    deletes: [{ q: {}, limit: 0 }],
  });
});

afterAll(() => prisma.$disconnect());

describe("write middleware", () => {
  it("seals every sensitive field on update and leaves others alone", async () => {
    const id = await insertRaw({});
    await prisma.user.update({
      where: { id },
      data: {
        aadhar_no: AADHAAR,
        pan_no: PAN,
        bank_account_no: BANK,
        mobile: "9000000000",
        bank_name: "Synthetic Bank",
      },
    });
    const doc = await raw(id);
    for (const [f, v] of [
      ["aadhar_no", AADHAAR],
      ["pan_no", PAN],
      ["bank_account_no", BANK],
    ]) {
      expect(isFieldCiphertext(doc[f])).toBe(true);
      expect(JSON.stringify(doc)).not.toContain(v);
      expect(readSensitiveStrict(doc[f], f)).toBe(v);
    }
    expect(doc.bank_name).toBe("Synthetic Bank");
  });

  it("seals on create, updateMany and upsert", async () => {
    const created = await prisma.user.create({
      data: {
        username: "syn-create",
        email: "create@example.test",
        pan_no: PAN,
      } as any,
    });
    expect(isFieldCiphertext((await raw(created.id)).pan_no)).toBe(true);

    await prisma.user.updateMany({
      where: { id: created.id },
      data: { uan_no: "100000000001" },
    });
    expect(isFieldCiphertext((await raw(created.id)).uan_no)).toBe(true);

    await prisma.user.upsert({
      where: { id: created.id },
      create: { username: "x", email: "x@example.test" } as any,
      update: { esic_no: "2000000000" },
    });
    expect(isFieldCiphertext((await raw(created.id)).esic_no)).toBe(true);
  });

  it("seals inside an interactive transaction", async () => {
    const id = await insertRaw({});
    await prisma.$transaction((tx) =>
      tx.user.update({ where: { id }, data: { pan_no: PAN } }),
    );
    expect(isFieldCiphertext((await raw(id)).pan_no)).toBe(true);
  });

  it("seals a face descriptor and reads it back", async () => {
    const id = await insertRaw({});
    await prisma.user.update({
      where: { id },
      data: { face_descriptor: FACE },
    });
    const doc = await raw(id);
    expect(typeof doc.face_descriptor).toBe("string");
    expect(readFaceDescriptor(doc.face_descriptor)).toEqual(FACE);
  });

  it("refuses a caller-supplied ciphertext", async () => {
    const id = await insertRaw({});
    await expect(
      prisma.user.update({
        where: { id },
        data: { aadhar_no: encryptField(AADHAAR, "aadhar_no") },
      }),
    ).rejects.toMatchObject({ code: "CIPHERTEXT_INPUT" });
  });

  it("lets empty values through unchanged", async () => {
    const id = await insertRaw({ pan_no: "x" });
    await prisma.user.update({ where: { id }, data: { pan_no: null } });
    expect((await raw(id)).pan_no).toBeNull();
  });
});

describe("non-production guard", () => {
  const shared = "mongodb+srv://u:p@cluster.example.mongodb.net/db";

  it("blocks shared databases outside production", () => {
    expect(sensitiveWritesAllowed({ DEV_MONGODB_URI: shared } as any)).toBe(
      false,
    );
  });

  it("allows production, local databases and an explicit override", () => {
    expect(
      sensitiveWritesAllowed({
        DEV_MONGODB_URI: shared,
        NODE_ENV: "production",
      } as any),
    ).toBe(true);
    expect(
      sensitiveWritesAllowed({
        DEV_MONGODB_URI: "mongodb://127.0.0.1:37017/x",
      } as any),
    ).toBe(true);
    expect(
      sensitiveWritesAllowed({
        DEV_MONGODB_URI: shared,
        ALLOW_NONPROD_SENSITIVE_WRITES: "true",
      } as any),
    ).toBe(true);
  });

  it("the middleware throws when blocked", async () => {
    const id = await insertRaw({});
    const original = process.env.DEV_MONGODB_URI;
    process.env.DEV_MONGODB_URI = shared;
    try {
      await expect(
        prisma.user.update({ where: { id }, data: { pan_no: PAN } }),
      ).rejects.toMatchObject({ name: "SensitiveWriteBlockedError" });
    } finally {
      process.env.DEV_MONGODB_URI = original;
    }
    expect((await raw(id)).pan_no).toBeUndefined();
  });
});

describe("migration", () => {
  async function seedMixed() {
    return {
      plain: await insertRaw({
        aadhar_no: AADHAAR,
        pan_no: PAN,
        bank_account_no: BANK,
        face_descriptor: FACE,
      }),
      none: await insertRaw({ aadhar_no: null, pan_no: "" }),
      sealed: await insertRaw({
        aadhar_no: encryptField(AADHAAR, "aadhar_no"),
      }),
      cbc: await insertRaw({ mobile: aesEncrypt("9000000001") }),
      emptyFace: await insertRaw({ face_descriptor: [] }),
    };
  }

  it("dry run changes nothing and reports counts only", async () => {
    const ids = await seedMixed();
    const before = await raw(ids.plain);
    const report = await runPiiMigration({ mode: "dry-run" });
    expect(await raw(ids.plain)).toEqual(before);
    expect(report.complete).toBe(true);
    expect(report.documentsScanned).toBe(5);
    expect(report.fieldsTransformed).toBe(5);
    const text = JSON.stringify(report);
    for (const v of [AADHAAR, PAN, BANK]) expect(text).not.toContain(v);
  });

  it("apply seals mixed records and every value still opens", async () => {
    const ids = await seedMixed();
    const report = await runPiiMigration({ mode: "apply" });
    expect(report.documentsFailedVerification).toBe(0);
    expect(report.fieldsAlreadyEncrypted).toBe(1);

    const plain = await raw(ids.plain);
    expect(readSensitiveStrict(plain.aadhar_no, "aadhar_no")).toBe(AADHAAR);
    expect(readSensitiveStrict(plain.pan_no, "pan_no")).toBe(PAN);
    expect(readFaceDescriptor(plain.face_descriptor)).toEqual(FACE);
    expect(isFieldCiphertext(plain.bank_account_no)).toBe(true);

    expect(readSensitiveStrict((await raw(ids.cbc)).mobile, "mobile")).toBe(
      "9000000001",
    );
    const none = await raw(ids.none);
    expect(none.aadhar_no).toBeNull();
    expect(none.pan_no).toBe("");
    expect((await raw(ids.emptyFace)).face_descriptor).toEqual([]);
  });

  it("is idempotent", async () => {
    const ids = await seedMixed();
    await runPiiMigration({ mode: "apply" });
    const once = await raw(ids.plain);
    const second = await runPiiMigration({ mode: "apply" });
    expect(second.fieldsTransformed).toBe(0);
    expect(await raw(ids.plain)).toEqual(once);
  });

  it("resumes after interruption from the state file", async () => {
    for (let i = 0; i < 5; i++) await insertRaw({ pan_no: PAN });
    const dir = mkdtempSync(join(tmpdir(), "pii-migration-"));
    const stateFile = join(dir, "state.json");
    const partial = await runPiiMigration({
      mode: "apply",
      batchSize: 2,
      stateFile,
      maxBatches: 1,
    });
    expect(partial.complete).toBe(false);
    expect(partial.documentsChanged).toBe(2);

    const finished = await runPiiMigration({
      mode: "apply",
      batchSize: 2,
      stateFile,
    });
    expect(finished.complete).toBe(true);
    expect(finished.documentsScanned).toBe(5);
    expect(finished.documentsChanged).toBe(5);
    expect(readFileSync(stateFile, "utf8")).not.toContain(PAN);
  });

  it("leaves a record alone if it changed after being read", async () => {
    const id = await insertRaw({ pan_no: PAN });
    const report = await runPiiMigration({
      mode: "apply",
      beforeWrite: async (target) => {
        await setRaw(target, { pan_no: "ZZZZZ9999Z" });
      },
    });
    expect(report.fieldsSkippedConcurrentChange).toBe(1);
    expect((await raw(id)).pan_no).toBe("ZZZZZ9999Z");
  });

  it("reports failed verification and never overwrites a value it no longer recognises", async () => {
    const id = await insertRaw({ pan_no: PAN });
    let sabotaged = "";
    const report = await runPiiMigration({
      mode: "apply",
      afterWrite: async (target) => {
        const doc = await raw(target);
        // A valid ciphertext of the wrong value, in place of the right one.
        sabotaged = encryptField("WRONG", "pan_no");
        await setRaw(target, { pan_no: sabotaged });
        expect(doc.pan_no).not.toBe(sabotaged);
      },
    });
    expect(report.documentsFailedVerification).toBe(1);
    expect(report.documentsChanged).toBe(0);
    expect((await raw(id)).pan_no).toBe(sabotaged);
  });

  it("counts damaged ciphertext and leaves it in place", async () => {
    const damaged = encryptField(AADHAAR, "aadhar_no").slice(0, -2) + "AA";
    const id = await insertRaw({ aadhar_no: damaged });
    const report = await runPiiMigration({ mode: "apply" });
    expect(report.fieldsUnreadable).toBe(1);
    expect((await raw(id)).aadhar_no).toBe(damaged);
  });

  it("rollback restores the original values", async () => {
    const ids = await seedMixed();
    await runPiiMigration({ mode: "apply" });
    const report = await runPiiMigration({ mode: "rollback" });
    expect(report.complete).toBe(true);
    const plain = await raw(ids.plain);
    expect(plain.aadhar_no).toBe(AADHAAR);
    expect(plain.pan_no).toBe(PAN);
    expect(plain.face_descriptor).toEqual(FACE);
  });

  it("re-seals values under a new key with --rekey", async () => {
    const id = await insertRaw({ pan_no: PAN });
    await runPiiMigration({ mode: "apply" });
    const oldKid = activeFieldKeyId();
    const original = process.env.CRYPTO_ENCRYPTION_KEY!;
    process.env.CRYPTO_ENCRYPTION_KEY = "d".repeat(64);
    process.env.CRYPTO_ENCRYPTION_PREVIOUS_KEYS = original;
    try {
      const report = await runPiiMigration({ mode: "apply", rekey: true });
      expect(report.fieldsTransformed).toBe(1);
      const doc = await raw(id);
      expect(doc.pan_no).not.toContain(oldKid);
      expect(readSensitiveStrict(doc.pan_no, "pan_no")).toBe(PAN);
    } finally {
      process.env.CRYPTO_ENCRYPTION_KEY = original;
      delete process.env.CRYPTO_ENCRYPTION_PREVIOUS_KEYS;
    }
  });

  describe("guards", () => {
    const realHost = process.env.CONFIRM_DB_WRITE_HOST;
    afterEach(() => {
      process.env.CONFIRM_DB_WRITE_HOST = realHost;
      delete process.env.EXPECTED_FIELD_KEY_ID;
    });

    it("allows a dry run without confirmation", () => {
      expect(() => assertMigrationAllowed("dry-run")).not.toThrow();
    });

    it("refuses apply without host confirmation", () => {
      delete process.env.CONFIRM_DB_WRITE_HOST;
      expect(() => assertMigrationAllowed("apply")).toThrow(/refused/);
    });

    it("refuses apply when the key fingerprint does not match", () => {
      process.env.CONFIRM_DB_WRITE_HOST = "127.0.0.1:37017";
      process.env.EXPECTED_FIELD_KEY_ID = "000000000000";
      expect(() => assertMigrationAllowed("apply")).toThrow(/active key/);
    });

    it("allows apply with both confirmations", () => {
      process.env.CONFIRM_DB_WRITE_HOST = "127.0.0.1:37017";
      process.env.EXPECTED_FIELD_KEY_ID = activeFieldKeyId();
      expect(() => assertMigrationAllowed("apply")).not.toThrow();
    });
  });
});
