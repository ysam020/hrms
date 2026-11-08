import crypto from "crypto";

/**
 * Field-level encryption for sensitive personal data.
 *
 * Stored format (one self-describing string):
 *
 *   enc:v1:<kid>:<iv>:<tag>:<ciphertext>
 *
 * AES-256-GCM. `kid` is a public fingerprint of the key, so a value sealed
 * under a key this process doesn't hold is reported as such rather than as
 * corruption. iv, tag and ciphertext are base64url. The field name is bound
 * as additional authenticated data, so a value can't be moved to a different
 * field and still open.
 *
 * Keys live in the environment (loaded from Secrets Manager), never with the
 * data. CRYPTO_ENCRYPTION_KEY is the active key; the key actually used is
 * derived from it with HKDF so this scheme never shares key material with
 * the older CBC helpers. Rotation: move the old key to
 * CRYPTO_ENCRYPTION_PREVIOUS_KEYS (comma separated), set the new one as
 * active, and re-seal with the migration script's --rekey mode.
 *
 * No function here ever places a plaintext or key in an error message.
 */

export type FieldCryptoErrorCode =
  | "MISSING_KEY"
  | "UNKNOWN_KEY"
  | "UNSUPPORTED_VERSION"
  | "MALFORMED"
  | "AUTH_FAILED"
  | "CIPHERTEXT_INPUT";

export class FieldCryptoError extends Error {
  constructor(public readonly code: FieldCryptoErrorCode) {
    super(`Field encryption error: ${code}`);
    this.name = "FieldCryptoError";
  }
}

interface KeyEntry {
  kid: string;
  key: Buffer;
}

interface Keyring {
  active: KeyEntry;
  byKid: Map<string, KeyEntry>;
}

const HEX_KEY = /^[a-f0-9]{64}$/i;
const CURRENT_VERSION = "v1";
const ANY_VERSION_PREFIX = /^enc:(v[0-9]+):/;
const V1_FORMAT =
  /^enc:v1:([a-f0-9]{12}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]*)$/;
const LEGACY_CBC_FORMAT = /^[a-f0-9]{32}:[a-f0-9]+$/i;

function deriveEntry(hexKey: string): KeyEntry {
  const key = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(hexKey, "hex"),
      Buffer.from("praesto-field-encryption"),
      Buffer.from(CURRENT_VERSION),
      32,
    ),
  );
  const kid = crypto
    .createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 12);
  return { kid, key };
}

let memo: { source: string; ring: Keyring } | undefined;

function keyring(): Keyring {
  const primary = process.env.CRYPTO_ENCRYPTION_KEY ?? "";
  const previous = process.env.CRYPTO_ENCRYPTION_PREVIOUS_KEYS ?? "";
  const source = `${primary}|${previous}`;
  if (memo?.source === source) return memo.ring;

  if (!HEX_KEY.test(primary)) throw new FieldCryptoError("MISSING_KEY");
  const active = deriveEntry(primary);
  const byKid = new Map<string, KeyEntry>([[active.kid, active]]);
  for (const raw of previous.split(",")) {
    const hex = raw.trim();
    if (!hex) continue;
    if (!HEX_KEY.test(hex)) throw new FieldCryptoError("MISSING_KEY");
    const entry = deriveEntry(hex);
    byKid.set(entry.kid, entry);
  }
  const ring = { active, byKid };
  memo = { source, ring };
  return ring;
}

const aadFor = (kid: string, field: string) =>
  Buffer.from(`enc:${CURRENT_VERSION}|${kid}|${field}`, "utf8");

/** True only for a structurally complete value in the current format. */
export function isFieldCiphertext(value: unknown): value is string {
  return typeof value === "string" && V1_FORMAT.test(value);
}

/** True for anything claiming to be ciphertext, valid or not. */
export function claimsFieldCiphertext(value: unknown): boolean {
  return typeof value === "string" && ANY_VERSION_PREFIX.test(value);
}

export function activeFieldKeyId(): string {
  return keyring().active.kid;
}

/** The key id of a well-formed value, or null. */
export function fieldKeyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = V1_FORMAT.exec(value);
  return match ? match[1] : null;
}

export function encryptField(plaintext: string, field: string): string {
  if (claimsFieldCiphertext(plaintext)) {
    throw new FieldCryptoError("CIPHERTEXT_INPUT");
  }
  const { active } = keyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", active.key, iv);
  cipher.setAAD(aadFor(active.kid, field));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    "enc",
    CURRENT_VERSION,
    active.kid,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/** Decrypts a value in the current format; throws FieldCryptoError otherwise. */
export function decryptField(value: string, field: string): string {
  const version = ANY_VERSION_PREFIX.exec(value)?.[1];
  if (!version) throw new FieldCryptoError("MALFORMED");
  if (version !== CURRENT_VERSION) {
    throw new FieldCryptoError("UNSUPPORTED_VERSION");
  }
  const match = V1_FORMAT.exec(value);
  if (!match) throw new FieldCryptoError("MALFORMED");
  const [, kid, iv, tag, ciphertext] = match;

  const entry = keyring().byKid.get(kid);
  if (!entry) throw new FieldCryptoError("UNKNOWN_KEY");
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      entry.key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(aadFor(kid, field));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new FieldCryptoError("AUTH_FAILED");
  }
}

function openLegacyCbc(value: string): string | null {
  const hex = process.env.CRYPTO_ENCRYPTION_KEY ?? "";
  if (!HEX_KEY.test(hex)) return null;
  try {
    const [iv, body] = value.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(hex, "hex"),
      Buffer.from(iv, "hex"),
    );
    return decipher.update(body, "hex", "utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

export type SensitiveValueKind = "empty" | "encrypted" | "legacy-plaintext";

/** How a stored value should be treated, without opening it. */
export function classifySensitiveValue(value: unknown): SensitiveValueKind {
  if (value === null || value === undefined || value === "") return "empty";
  return claimsFieldCiphertext(value) ? "encrypted" : "legacy-plaintext";
}

/**
 * Opens a stored value for a path that cannot proceed without the real value
 * (a bank transfer, a PDF password). Legacy plaintext is returned unchanged
 * so mixed data keeps working during migration; a value that claims to be
 * ciphertext and won't open always throws.
 */
export function readSensitiveStrict(
  value: string | null | undefined,
  field: string,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (claimsFieldCiphertext(value)) return decryptField(value, field);
  if (LEGACY_CBC_FORMAT.test(value)) return openLegacyCbc(value) ?? value;
  return value;
}

type FailureHook = (info: {
  code: FieldCryptoErrorCode | "UNKNOWN";
  field: string;
}) => void;

let failureHook: FailureHook = () => {};

/** Lets the host report display-time failures. Receives no value. */
export function setFieldCryptoFailureHook(hook: FailureHook): void {
  failureHook = hook;
}

/**
 * Opens a stored value for display. A value that won't open comes back as ""
 * so one damaged field doesn't take down a whole profile, and ciphertext is
 * never shown to a user. The failure is reported through the hook.
 */
export function readSensitiveForDisplay(
  value: string | null | undefined,
  field: string,
): string {
  try {
    return readSensitiveStrict(value, field);
  } catch (err) {
    failureHook({
      code: err instanceof FieldCryptoError ? err.code : "UNKNOWN",
      field,
    });
    return "";
  }
}

export const FACE_DESCRIPTOR_FIELD = "face_descriptor";

/** Seals a face descriptor. Null and empty values are left for the caller. */
export function encryptFaceDescriptor(descriptor: number[]): string {
  return encryptField(JSON.stringify(descriptor), FACE_DESCRIPTOR_FIELD);
}

/**
 * Accepts a stored descriptor in either form: a sealed string, or the legacy
 * plain array. Returns null when absent or unusable.
 */
export function readFaceDescriptor(stored: unknown): number[] | null {
  if (Array.isArray(stored)) return stored as number[];
  if (typeof stored !== "string" || !stored) return null;
  const opened = readSensitiveForDisplay(stored, FACE_DESCRIPTOR_FIELD);
  if (!opened) return null;
  try {
    const parsed: unknown = JSON.parse(opened);
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}
