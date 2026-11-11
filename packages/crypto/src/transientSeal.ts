import crypto from "crypto";

/**
 * Sealing for short-lived copies outside MongoDB: cached API responses in
 * Redis and queued job payloads (BullMQ stores job data in Redis, and failed
 * jobs are copied to a dead-letter queue). AES-256-GCM under a key derived
 * from CRYPTO_ENCRYPTION_KEY, separate from field keys, so a Redis dump or a
 * Redis reader can't read them.
 *
 *   t1:<iv>:<tag>:<ciphertext>   (base64url)
 *
 * Without a key, production refuses; development and tests store plain JSON
 * so local tooling keeps working.
 */

const PREFIX = "t1:";
let memo: { source: string; key: Buffer } | undefined;

function key(): Buffer | null {
  const hex = process.env.CRYPTO_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRYPTO_ENCRYPTION_KEY is required to seal transient data",
      );
    }
    return null;
  }
  if (memo?.source !== hex) {
    memo = {
      source: hex,
      key: Buffer.from(
        crypto.hkdfSync(
          "sha256",
          Buffer.from(hex, "hex"),
          Buffer.from("praesto-transient"),
          Buffer.from("t1"),
          32,
        ),
      ),
    };
  }
  return memo.key;
}

export function isTransientSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** JSON-serialises `value` and seals it. */
export function sealTransient(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  const k = key();
  if (!k) return json;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(json, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${body.toString("base64url")}`;
}

/** Reverses sealTransient; plain JSON (older entries, development) also parses. */
export function openTransient<T = unknown>(stored: string): T {
  if (!isTransientSealed(stored)) return JSON.parse(stored) as T;
  const k = key();
  if (!k) throw new Error("transient value is sealed but no key is configured");
  const [iv, tag, body] = stored.slice(PREFIX.length).split(":");
  const d = crypto.createDecipheriv(
    "aes-256-gcm",
    k,
    Buffer.from(iv, "base64url"),
  );
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      d.update(Buffer.from(body, "base64url")),
      d.final(),
    ]).toString("utf8"),
  ) as T;
}
