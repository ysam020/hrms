import crypto from "crypto";
import { FieldKeyRing, FieldCryptoError, type DataKey } from "@hrms/crypto";
import { logger } from "@hrms/logger";

/**
 * Data keys for field encryption.
 *
 * One data key per scope ("master", or a tenant's database name) and purpose
 * ("enc" for encryption, "bidx" for blind indexes, which never share a key).
 * Only the wrapped form is stored, in the master collection encryption_keys.
 * The key-encryption key stays in AWS KMS, and each data key is bound to its
 * scope through the KMS encryption context.
 *
 * Unwrapped keys are cached in memory for a limited time and never written
 * or logged. When KMS is unreachable after a cache entry expires, operations
 * fail rather than continue on stale keys.
 */

export type KeyPurpose = "enc" | "bidx";

export class FieldKeyUnavailableError extends Error {
  constructor(
    readonly scope: string,
    cause: string,
  ) {
    super(`Field key unavailable for scope "${scope}": ${cause}`);
    this.name = "FieldKeyUnavailableError";
  }
}

export interface KekProvider {
  readonly kekId: string;
  generate(
    context: Record<string, string>,
  ): Promise<{ plaintext: Buffer; wrapped: string }>;
  unwrap(wrapped: string, context: Record<string, string>): Promise<Buffer>;
}

class KmsKekProvider implements KekProvider {
  private client: Promise<any> | undefined;

  constructor(
    readonly kekId: string,
    private readonly region: string | undefined,
    private readonly endpoint: string | undefined,
  ) {}

  private sdk() {
    // Loaded on first use so processes on the development key never load it.
    this.client ??= Promise.resolve().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require("@aws-sdk/client-kms");
      return {
        m,
        c: new m.KMSClient({
          region: this.region,
          ...(this.endpoint ? { endpoint: this.endpoint } : {}),
        }),
      };
    });
    return this.client;
  }

  async generate(context: Record<string, string>) {
    const { m, c } = await this.sdk();
    const out = await c.send(
      new m.GenerateDataKeyCommand({
        KeyId: this.kekId,
        KeySpec: "AES_256",
        EncryptionContext: context,
      }),
    );
    return {
      plaintext: Buffer.from(out.Plaintext),
      wrapped: Buffer.from(out.CiphertextBlob).toString("base64"),
    };
  }

  async unwrap(wrapped: string, context: Record<string, string>) {
    const { m, c } = await this.sdk();
    const out = await c.send(
      new m.DecryptCommand({
        KeyId: this.kekId,
        CiphertextBlob: Buffer.from(wrapped, "base64"),
        EncryptionContext: context,
      }),
    );
    return Buffer.from(out.Plaintext);
  }
}

/** Development and tests only: wraps data keys with a key from the environment. */
class EnvKekProvider implements KekProvider {
  readonly kekId = "env";

  constructor(private readonly kek: Buffer) {}

  private aad(context: Record<string, string>) {
    return Buffer.from(JSON.stringify(Object.entries(context).sort()));
  }

  async generate(context: Record<string, string>) {
    const plaintext = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", this.kek, iv);
    c.setAAD(this.aad(context));
    const body = Buffer.concat([c.update(plaintext), c.final()]);
    return {
      plaintext,
      wrapped: Buffer.concat([iv, c.getAuthTag(), body]).toString("base64"),
    };
  }

  async unwrap(wrapped: string, context: Record<string, string>) {
    const b = Buffer.from(wrapped, "base64");
    const d = crypto.createDecipheriv(
      "aes-256-gcm",
      this.kek,
      b.subarray(0, 12),
    );
    d.setAAD(this.aad(context));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  }
}

export function kekProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): KekProvider {
  const kmsKey = env.FIELD_KMS_KEY_ID;
  const production = env.NODE_ENV === "production";
  if (kmsKey) {
    if (production && env.FIELD_KMS_ENDPOINT) {
      throw new FieldCryptoError("MISSING_KEY");
    }
    return new KmsKekProvider(
      kmsKey,
      env.FIELD_KMS_REGION ?? env.AWS_REGION ?? "ap-south-1",
      env.FIELD_KMS_ENDPOINT,
    );
  }
  if (!production && /^[a-f0-9]{64}$/i.test(env.FIELD_KEK_HEX ?? "")) {
    return new EnvKekProvider(Buffer.from(env.FIELD_KEK_HEX!, "hex"));
  }
  throw new FieldCryptoError("MISSING_KEY");
}

interface StoredKey {
  scope: string;
  purpose: string;
  version: number;
  wrappedKey: string;
  kekId: string;
  status: string;
}

export interface KeyStoreDb {
  encryptionKey: {
    findMany(args: unknown): Promise<StoredKey[]>;
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
}

const contextFor = (scope: string, purpose: KeyPurpose) => ({
  app: "praesto-field-encryption",
  scope,
  purpose,
});

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 256;

export interface FieldKeyStoreOptions {
  provider?: () => KekProvider;
  ttlMs?: number;
  now?: () => number;
}

export class FieldKeyStore {
  private readonly cache = new Map<
    string,
    { ring: FieldKeyRing; expiresAt: number }
  >();
  private readonly loading = new Map<string, Promise<FieldKeyRing>>();
  private readonly provider: () => KekProvider;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: () => KeyStoreDb,
    options: FieldKeyStoreOptions = {},
  ) {
    this.provider = options.provider ?? (() => kekProviderFromEnv());
    this.ttlMs =
      options.ttlMs ??
      (Number(process.env.FIELD_DEK_CACHE_TTL_MS) || DEFAULT_TTL_MS);
    this.now = options.now ?? Date.now;
  }

  private rows(scope: string, purpose: KeyPurpose): Promise<StoredKey[]> {
    return this.db().encryptionKey.findMany({ where: { scope, purpose } });
  }

  private async unwrapAll(
    scope: string,
    purpose: KeyPurpose,
    rows: StoredKey[],
  ): Promise<DataKey[]> {
    const provider = this.provider();
    return Promise.all(
      rows
        .filter((r) => r.status !== "destroyed")
        .map(async (r) => ({
          version: r.version,
          key: await provider.unwrap(r.wrappedKey, contextFor(scope, purpose)),
        })),
    );
  }

  private async createVersion(
    scope: string,
    purpose: KeyPurpose,
    version: number,
  ): Promise<void> {
    const provider = this.provider();
    const { wrapped } = await provider.generate(contextFor(scope, purpose));
    try {
      await this.db().encryptionKey.create({
        data: {
          scope,
          purpose,
          version,
          wrappedKey: wrapped,
          kekId: provider.kekId,
          status: "active",
        },
      });
    } catch (err) {
      // Another process created this version first; its key is the one used.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }

  private async load(
    scope: string,
    purpose: KeyPurpose,
    create: boolean,
  ): Promise<FieldKeyRing> {
    try {
      let rows = await this.rows(scope, purpose);
      if (rows.length === 0) {
        if (!create) throw new FieldCryptoError("MISSING_KEY");
        await this.createVersion(scope, purpose, 1);
        rows = await this.rows(scope, purpose);
      }
      const ring = new FieldKeyRing(
        scope,
        await this.unwrapAll(scope, purpose, rows),
      );
      this.remember(`${scope}|${purpose}`, ring);
      return ring;
    } catch (err) {
      const name = (err as Error).name ?? "Error";
      logger.error("field key load failed", { scope, purpose, name });
      if (err instanceof FieldCryptoError) throw err;
      throw new FieldKeyUnavailableError(scope, name);
    }
  }

  private remember(key: string, ring: FieldKeyRing): void {
    this.cache.delete(key);
    this.cache.set(key, { ring, expiresAt: this.now() + this.ttlMs });
    while (this.cache.size > MAX_ENTRIES) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
  }

  /** The ring for a scope. `create` provisions version 1 when none exists. */
  ring(
    scope: string,
    purpose: KeyPurpose,
    create = true,
  ): Promise<FieldKeyRing> {
    const key = `${scope}|${purpose}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return Promise.resolve(hit.ring);
    if (hit) this.cache.delete(key);
    const pending = this.loading.get(key);
    if (pending) return pending;
    const p = this.load(scope, purpose, create).finally(() =>
      this.loading.delete(key),
    );
    this.loading.set(key, p);
    return p;
  }

  /** Adds a new key version; new writes use it, older versions still open. */
  async rotate(scope: string, purpose: KeyPurpose): Promise<number> {
    const rows = await this.rows(scope, purpose);
    const next = Math.max(0, ...rows.map((r) => r.version)) + 1;
    await this.createVersion(scope, purpose, next);
    await this.db().encryptionKey.updateMany({
      where: { scope, purpose, version: { lt: next }, status: "active" },
      data: { status: "retired" },
    });
    this.forget(scope);
    return next;
  }

  /** Drops cached keys for a scope, or all scopes, so the next use reloads. */
  forget(scope?: string): void {
    for (const key of [...this.cache.keys()]) {
      if (!scope || key.startsWith(`${scope}|`)) this.cache.delete(key);
    }
  }
}

let shared: FieldKeyStore | undefined;
let masterDb: (() => KeyStoreDb) | undefined;

export function bindFieldKeyStore(db: () => KeyStoreDb): void {
  masterDb = db;
}

export function fieldKeyStore(): FieldKeyStore {
  if (!masterDb) throw new FieldCryptoError("MISSING_KEY");
  shared ??= new FieldKeyStore(masterDb);
  return shared;
}

/** Tests only. */
export function setFieldKeyStoreForTest(
  store: FieldKeyStore | undefined,
): void {
  shared = store;
}
