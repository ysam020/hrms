import crypto from "crypto";
import { FieldCryptoError, claimsFieldCiphertext } from "./fieldEncryption";

/**
 * Envelope-encrypted field values.
 *
 * Stored format (one self-describing string):
 *
 *   enc:v2:<scope>:<dekVersion>:<iv>:<tag>:<ciphertext>
 *
 * AES-256-GCM with a fresh random 96-bit IV per value. `scope` names the data
 * key's owner ("master", or a tenant's database name). The scope, key version,
 * model and field are all bound as additional authenticated data, so a value
 * can't be replayed into another field or another tenant and still open.
 *
 * Data keys never appear here in wrapped form: this module works on an
 * already-unwrapped key ring. See packages/database/src/fieldKeys.ts for how
 * rings are produced from AWS KMS.
 */

export type FieldValueKind = "string" | "number" | "boolean" | "date" | "json";

export interface FieldContext {
  model: string;
  field: string;
}

export interface DataKey {
  version: number;
  key: Buffer;
}

const V2 =
  /^enc:v2:([A-Za-z0-9_.-]{1,64}):([0-9]{1,9}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]*)$/;

const HMAC_FORMAT = /^hmac:[0-9]{1,9}\.[A-Za-z0-9_-]{43}$/;

function aad(scope: string, version: number, ctx: FieldContext): Buffer {
  return Buffer.from(
    `enc:v2|${scope}|${version}|${ctx.model}.${ctx.field}`,
    "utf8",
  );
}

function encode(value: unknown): Buffer {
  if (typeof value === "string") return Buffer.from(`s${value}`, "utf8");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FieldCryptoError("MALFORMED");
    return Buffer.from(`n${JSON.stringify(value)}`, "utf8");
  }
  if (typeof value === "boolean") return Buffer.from(value ? "b1" : "b0");
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new FieldCryptoError("MALFORMED");
    return Buffer.from(`d${value.toISOString()}`, "utf8");
  }
  if (typeof value === "object" && value !== null) {
    return Buffer.from(`j${JSON.stringify(value)}`, "utf8");
  }
  throw new FieldCryptoError("MALFORMED");
}

function decode(buf: Buffer): unknown {
  const text = buf.toString("utf8");
  const body = text.slice(1);
  switch (text[0]) {
    case "s":
      return body;
    case "n":
      return Number(body);
    case "b":
      return body === "1";
    case "d":
      return new Date(body);
    case "j":
      return JSON.parse(body);
    default:
      throw new FieldCryptoError("MALFORMED");
  }
}

/** True only for a structurally complete value in the v2 format. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && V2.test(value);
}

export function isBlindIndexed(value: unknown): value is string {
  return typeof value === "string" && HMAC_FORMAT.test(value);
}

/** The data-key scope and version of a well-formed v2 value, or null. */
export function ciphertextKeyInfo(
  value: unknown,
): { scope: string; version: number } | null {
  if (typeof value !== "string") return null;
  const m = V2.exec(value);
  return m ? { scope: m[1], version: Number(m[2]) } : null;
}

/**
 * The unwrapped data keys of one scope. Held in memory only, and only for as
 * long as the key store's cache allows.
 */
export class FieldKeyRing {
  private readonly byVersion = new Map<number, Buffer>();
  readonly activeVersion: number;

  constructor(
    readonly scope: string,
    keys: DataKey[],
  ) {
    if (keys.length === 0) throw new FieldCryptoError("MISSING_KEY");
    for (const { version, key } of keys) {
      if (key.length !== 32) throw new FieldCryptoError("MISSING_KEY");
      this.byVersion.set(version, key);
    }
    this.activeVersion = Math.max(...this.byVersion.keys());
  }

  encrypt(value: unknown, ctx: FieldContext): string {
    if (claimsFieldCiphertext(value)) {
      throw new FieldCryptoError("CIPHERTEXT_INPUT");
    }
    const version = this.activeVersion;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.byVersion.get(version)!,
      iv,
    );
    cipher.setAAD(aad(this.scope, version, ctx));
    const body = Buffer.concat([cipher.update(encode(value)), cipher.final()]);
    return [
      "enc",
      "v2",
      this.scope,
      String(version),
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join(":");
  }

  decrypt(value: string, ctx: FieldContext): unknown {
    const m = V2.exec(value);
    if (!m) throw new FieldCryptoError("MALFORMED");
    const [, scope, versionText, iv, tag, body] = m;
    // Enforced by the caller's connection, not taken from the stored value.
    if (scope !== this.scope) throw new FieldCryptoError("AUTH_FAILED");
    const version = Number(versionText);
    const key = this.byVersion.get(version);
    if (!key) throw new FieldCryptoError("UNKNOWN_KEY");
    try {
      const d = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(iv, "base64url"),
      );
      d.setAAD(aad(scope, version, ctx));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return decode(
        Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]),
      );
    } catch {
      throw new FieldCryptoError("AUTH_FAILED");
    }
  }

  /** Encrypts every leaf of an object or array, keeping its shape. */
  encryptObject(value: unknown, ctx: FieldContext): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map((v) => this.encryptObject(v, ctx));
    }
    if (typeof value === "object" && !(value instanceof Date)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          this.encryptObject(v, ctx),
        ]),
      );
    }
    return this.encrypt(value, ctx);
  }

  /** Reverses encryptObject; values that aren't ciphertext pass through. */
  decryptObject(value: unknown, ctx: FieldContext): unknown {
    if (isEncrypted(value)) return this.decrypt(value, ctx);
    if (Array.isArray(value)) {
      return value.map((v) => this.decryptObject(v, ctx));
    }
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          this.decryptObject(v, ctx),
        ]),
      );
    }
    return value;
  }

  /**
   * Deterministic keyed index of a normalised value, for exact-match lookup.
   * Call on a ring built from a key with purpose "bidx", never an encryption
   * key. Model and field are mixed in so equal values in different fields
   * can't be correlated.
   */
  blindIndex(normalized: string, ctx: FieldContext): string {
    return this.blindIndexAt(this.activeVersion, normalized, ctx);
  }

  /** The index under every held key version, for lookups during rotation. */
  blindIndexes(normalized: string, ctx: FieldContext): string[] {
    return [...this.byVersion.keys()].map((v) =>
      this.blindIndexAt(v, normalized, ctx),
    );
  }

  private blindIndexAt(
    version: number,
    normalized: string,
    ctx: FieldContext,
  ): string {
    const mac = crypto
      .createHmac("sha256", this.byVersion.get(version)!)
      .update(`${ctx.model}.${ctx.field}\u0000${normalized}`, "utf8")
      .digest("base64url");
    return `hmac:${version}.${mac}`;
  }
}

/** Constant-time comparison for blind-index values held in memory. */
export function blindIndexEquals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export type BlindIndexNormalizer = "email" | "mobile" | "exact";

export function normalizeForIndex(
  value: string,
  how: BlindIndexNormalizer,
): string {
  const v = value.trim();
  if (how === "email") return v.toLowerCase();
  if (how === "mobile") {
    return (v.startsWith("+") ? "+" : "") + v.replace(/\D/g, "");
  }
  return v;
}

const TRANSIENT_FIELD = "transient-store";

/**
 * Seals a value for short-lived external stores (Redis cache, queue jobs).
 * Uses the process's local key, not a KMS-wrapped data key: these values
 * expire on their own and every lookup must stay synchronous and cheap.
 */
export { TRANSIENT_FIELD };
