/**
 * Field encryption against REAL AWS KMS. Skipped unless FIELD_KMS_REAL_KEY_ID
 * is set. Run it with credentials that can use only that key (see
 * docs/field-encryption.md, "Testing against real KMS"), against the isolated
 * containers, with synthetic data only:
 *
 *   FIELD_KMS_REAL_KEY_ID=<key arn> AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… \
 *   NODE_OPTIONS=--experimental-vm-modules \
 *   npx jest -c integration/jest.integration.config.cjs integration/fieldKmsReal.it.test.ts
 *
 * KMS_RESULTS_FILE, when set, receives the timings and error names as JSON.
 */
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  prisma,
  getClientForDb,
  kekProviderFromEnv,
  fieldKeyStore,
  FieldKeyStore,
  FieldKeyUnavailableError,
} from "@hrms/db";
import { ciphertextKeyInfo } from "@hrms/crypto";

type KekProvider = ReturnType<typeof kekProviderFromEnv>;

const KEY = process.env.FIELD_KMS_REAL_KEY_ID;
const REGION = process.env.FIELD_KMS_REGION ?? "ap-south-1";
const suite = KEY ? describe : describe.skip;

const results: Record<string, unknown> = {};

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    n: s.length,
    p50: r(at(0.5)),
    p95: r(at(0.95)),
    max: r(s[s.length - 1]),
  };
}

async function timed<T>(f: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await f();
  return [v, performance.now() - t];
}

async function failure(f: () => Promise<unknown>) {
  const t = performance.now();
  try {
    await f();
  } catch (err) {
    return { name: (err as Error).name, ms: Math.round(performance.now() - t) };
  }
  throw new Error("expected the call to fail");
}

const ctx = (scope: string, purpose = "enc") => ({
  app: "praesto-field-encryption",
  scope,
  purpose,
});

suite("real AWS KMS", () => {
  let provider: KekProvider;
  let kms: any;
  let sdk: any;

  beforeAll(() => {
    process.env.FIELD_KMS_KEY_ID = KEY;
    process.env.FIELD_KMS_REGION = REGION;
    delete process.env.FIELD_KMS_ENDPOINT;
    provider = kekProviderFromEnv();
    // The SDK is a dependency of the database package, not of the root.
    sdk = createRequire(require.resolve("@hrms/db"))("@aws-sdk/client-kms");
    kms = new sdk.KMSClient({ region: REGION });
  });

  afterAll(() => {
    if (process.env.KMS_RESULTS_FILE) {
      writeFileSync(
        process.env.KMS_RESULTS_FILE,
        JSON.stringify(results, null, 2),
      );
    }
  });

  it("GenerateDataKey and Decrypt round-trip, with latency", async () => {
    const [first, coldMs] = await timed(() =>
      provider.generate(ctx("kms-real-test")),
    );
    results.firstGenerateDataKeyMs = Math.round(coldMs);
    expect(first.plaintext.length).toBe(32);

    const gen: number[] = [];
    const dec: number[] = [];
    for (let i = 0; i < 20; i++) {
      const [k, g] = await timed(() => provider.generate(ctx("kms-real-test")));
      const [p, d] = await timed(() =>
        provider.unwrap(k.wrapped, ctx("kms-real-test")),
      );
      expect(p.equals(k.plaintext)).toBe(true);
      gen.push(g);
      dec.push(d);
    }
    results.generateDataKeyMs = stats(gen);
    results.decryptMs = stats(dec);
    results.wrappedKeyBytes = Buffer.from(first.wrapped, "base64").length;
  });

  it("a wrapped key opens only under its own scope and purpose", async () => {
    const { wrapped } = await provider.generate(ctx("tenant-a"));
    const otherScope = await failure(() =>
      provider.unwrap(wrapped, ctx("tenant-b")),
    );
    const otherPurpose = await failure(() =>
      provider.unwrap(wrapped, ctx("tenant-a", "bidx")),
    );
    expect(otherScope.name).toBe("InvalidCiphertextException");
    expect(otherPurpose.name).toBe("InvalidCiphertextException");
    results.wrongContext = { otherScope, otherPurpose };
  });

  it("the test identity cannot step outside its policy", async () => {
    const send = (cmd: unknown) => () => kms.send(cmd);
    const denied = {
      otherApp: await failure(
        send(
          new sdk.GenerateDataKeyCommand({
            KeyId: KEY,
            KeySpec: "AES_256",
            EncryptionContext: { ...ctx("x"), app: "something-else" },
          }),
        ),
      ),
      extraContextKey: await failure(
        send(
          new sdk.GenerateDataKeyCommand({
            KeyId: KEY,
            KeySpec: "AES_256",
            EncryptionContext: { ...ctx("x"), extra: "1" },
          }),
        ),
      ),
      noContext: await failure(
        send(
          new sdk.GenerateDataKeyCommand({ KeyId: KEY, KeySpec: "AES_256" }),
        ),
      ),
      encrypt: await failure(
        send(
          new sdk.EncryptCommand({
            KeyId: KEY,
            Plaintext: Buffer.from("x"),
            EncryptionContext: ctx("x"),
          }),
        ),
      ),
      describeKey: await failure(
        send(new sdk.DescribeKeyCommand({ KeyId: KEY })),
      ),
      scheduleDeletion: await failure(
        send(
          new sdk.ScheduleKeyDeletionCommand({
            KeyId: KEY,
            PendingWindowInDays: 30,
          }),
        ),
      ),
      listKeys: await failure(send(new sdk.ListKeysCommand({}))),
    };
    for (const d of Object.values(denied)) {
      expect(d.name).toBe("AccessDeniedException");
    }
    results.denied = denied;
  });

  it("application path: a tenant's data key is created through KMS and records round-trip", async () => {
    const dbName = `hrms-it-kms-${crypto.randomBytes(4).toString("hex")}`;
    const tenant = getClientForDb(dbName);
    try {
      const [created, firstWriteMs] = await timed(() =>
        tenant.candidate.create({
          data: { name: "Kms Real", email: "kms.real@example.test" },
        }),
      );
      results.firstWriteIncludingKeyCreationMs = Math.round(firstWriteMs);

      const stored = (
        (await tenant.$runCommandRaw({
          find: "candidates",
          filter: { _id: { $oid: created.id } },
          limit: 1,
          singleBatch: true,
        })) as any
      ).cursor.firstBatch[0];
      expect(ciphertextKeyInfo(stored.name)?.scope).toBe(dbName);
      expect(JSON.stringify(stored)).not.toContain("Kms Real");
      expect(JSON.stringify(stored)).not.toContain("kms.real@example.test");

      const keys = (
        (await prisma.$runCommandRaw({
          find: "encryption_keys",
          filter: { scope: dbName },
          singleBatch: true,
          limit: 10,
        })) as any
      ).cursor.firstBatch;
      expect(keys.map((k: any) => k.purpose).sort()).toEqual(["bidx", "enc"]);
      for (const k of keys) expect(k.kekId).toBe(KEY);

      fieldKeyStore().forget(dbName);
      const [cold, coldMs] = await timed(() =>
        tenant.candidate.findUnique({ where: { id: created.id } }),
      );
      expect(cold?.name).toBe("Kms Real");
      const [, warmMs] = await timed(() =>
        tenant.candidate.findUnique({ where: { id: created.id } }),
      );
      const [byEmail] = await timed(() =>
        tenant.candidate.findFirst({
          where: { email: "kms.real@example.test" },
        }),
      );
      expect(byEmail?.id).toBe(created.id);
      results.coldReadAfterCacheDropMs = Math.round(coldMs);
      results.warmReadMs = Math.round(warmMs * 10) / 10;
    } finally {
      await tenant.$runCommandRaw({ dropDatabase: 1 });
      await prisma.$runCommandRaw({
        delete: "encryption_keys",
        deletes: [{ q: { scope: dbName }, limit: 0 }],
      });
    }
  });

  it("failure behaviour: unreachable KMS, unknown key, cached keys", async () => {
    const refused = kekProviderFromEnv({
      ...process.env,
      FIELD_KMS_ENDPOINT: "https://127.0.0.1:9",
    });
    const unknown = kekProviderFromEnv({
      ...process.env,
      FIELD_KMS_KEY_ID: "alias/praesto-does-not-exist",
    });
    const awsManaged = kekProviderFromEnv({
      ...process.env,
      FIELD_KMS_KEY_ID: "alias/aws/secretsmanager",
    });
    // A non-routable address: the connection never completes.
    const hung = kekProviderFromEnv({
      ...process.env,
      FIELD_KMS_ENDPOINT: "https://10.255.255.1",
    });
    const hungFailure = await failure(() => hung.generate(ctx("x")));
    expect(hungFailure.ms).toBeLessThan(10_000);
    results.failures = {
      unreachable: hungFailure,
      connectionRefused: await failure(() => refused.generate(ctx("x"))),
      unknownKey: await failure(() => unknown.generate(ctx("x"))),
      keyWithoutGrant: await failure(() => awsManaged.generate(ctx("x"))),
    };

    // Keys already unwrapped keep working while KMS is unreachable, until the
    // cache entry expires; then the scope fails closed.
    let current: KekProvider = provider;
    let now = 0;
    const store = new FieldKeyStore(() => prisma as any, {
      provider: () => current,
      ttlMs: 1000,
      now: () => now,
    });
    const scope = `kms-real-cache-${crypto.randomBytes(4).toString("hex")}`;
    try {
      const ring = await store.ring(scope, "enc", true);
      const sealed = ring.encrypt("cached", { model: "M", field: "f" });
      current = refused;
      const again = await store.ring(scope, "enc", false);
      expect(again.decrypt(sealed, { model: "M", field: "f" })).toBe("cached");
      now = 2000;
      const expired = await failure(() => store.ring(scope, "enc", false));
      expect(expired.name).toBe(new FieldKeyUnavailableError("x", "y").name);
      (results.failures as Record<string, unknown>).afterCacheExpiry = expired;
    } finally {
      await prisma.$runCommandRaw({
        delete: "encryption_keys",
        deletes: [{ q: { scope }, limit: 0 }],
      });
    }
  });
});
