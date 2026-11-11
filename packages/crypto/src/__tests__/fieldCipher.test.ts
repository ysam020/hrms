import crypto from "crypto";
import {
  FieldKeyRing,
  FieldCryptoError,
  isEncrypted,
  ciphertextKeyInfo,
  blindIndexEquals,
  normalizeForIndex,
  encryptField,
} from "../index";

process.env.CRYPTO_ENCRYPTION_KEY = "c".repeat(64);
const key = () => crypto.randomBytes(32);
const ctx = { model: "User", field: "aadhar_no" };

describe("FieldKeyRing", () => {
  const ring = new FieldKeyRing("master", [{ version: 1, key: key() }]);

  it.each([
    ["string", "999900001111"],
    ["empty-ish unicode", "नमस्ते ✓"],
    ["number", 12345.67],
    ["zero", 0],
    ["negative", -4.5],
    ["boolean true", true],
    ["boolean false", false],
    ["date", new Date("1990-05-17T00:00:00.000Z")],
    ["array", [0.1, 0.2, 0.3]],
    ["object", { city: "Pune", nested: { a: [1, "b"] } }],
  ])("round-trips a %s with its type", (_n, value) => {
    const sealed = ring.encrypt(value, ctx);
    expect(isEncrypted(sealed)).toBe(true);
    if (String(value).length > 4) expect(sealed).not.toContain(String(value));
    const opened = ring.decrypt(sealed, ctx);
    expect(opened).toEqual(value);
    expect(typeof opened).toBe(typeof value);
    if (value instanceof Date) expect(opened).toBeInstanceOf(Date);
  });

  it("uses a fresh IV every time", () => {
    const ivs = new Set(
      Array.from(
        { length: 200 },
        () => ring.encrypt("same", ctx).split(":")[4],
      ),
    );
    expect(ivs.size).toBe(200);
  });

  it("records scope and key version", () => {
    expect(ciphertextKeyInfo(ring.encrypt("x", ctx))).toEqual({
      scope: "master",
      version: 1,
    });
  });

  it("rejects a tampered tag, body or IV", () => {
    const sealed = ring.encrypt("secret", ctx);
    const parts = sealed.split(":");
    for (const i of [4, 5, 6]) {
      const p = [...parts];
      const b = Buffer.from(p[i], "base64url");
      b[0] ^= 1;
      p[i] = b.toString("base64url");
      expect(() => ring.decrypt(p.join(":"), ctx)).toThrow(FieldCryptoError);
    }
  });

  it("rejects a value moved to another field, model or scope", () => {
    const sealed = ring.encrypt("secret", ctx);
    expect(() => ring.decrypt(sealed, { ...ctx, field: "pan_no" })).toThrow(
      /AUTH_FAILED/,
    );
    expect(() => ring.decrypt(sealed, { ...ctx, model: "Candidate" })).toThrow(
      /AUTH_FAILED/,
    );
    const other = new FieldKeyRing("hrms-acme", [{ version: 1, key: key() }]);
    expect(() => other.decrypt(sealed, ctx)).toThrow(/AUTH_FAILED/);
    const forged = sealed.replace("enc:v2:master:", "enc:v2:hrms-acme:");
    expect(() => other.decrypt(forged, ctx)).toThrow(/AUTH_FAILED/);
  });

  it("fails with the wrong key and with an unknown version", () => {
    const sealed = ring.encrypt("secret", ctx);
    const wrong = new FieldKeyRing("master", [{ version: 1, key: key() }]);
    expect(() => wrong.decrypt(sealed, ctx)).toThrow(/AUTH_FAILED/);
    const v2only = new FieldKeyRing("master", [{ version: 2, key: key() }]);
    expect(() => v2only.decrypt(sealed, ctx)).toThrow(/UNKNOWN_KEY/);
  });

  it("refuses malformed input and any ciphertext as plaintext", () => {
    expect(() => ring.decrypt("enc:v2:master:1:short", ctx)).toThrow(
      /MALFORMED/,
    );
    expect(() => ring.encrypt(ring.encrypt("x", ctx), ctx)).toThrow(
      /CIPHERTEXT_INPUT/,
    );
    expect(() => ring.encrypt(encryptField("x", "f"), ctx)).toThrow(
      /CIPHERTEXT_INPUT/,
    );
    expect(() => ring.encrypt(Number.NaN, ctx)).toThrow(/MALFORMED/);
    expect(() => ring.encrypt(undefined, ctx)).toThrow(/MALFORMED/);
  });

  it("requires a 32-byte key", () => {
    expect(
      () => new FieldKeyRing("m", [{ version: 1, key: Buffer.alloc(16) }]),
    ).toThrow(/MISSING_KEY/);
    expect(() => new FieldKeyRing("m", [])).toThrow(/MISSING_KEY/);
  });

  it("rotation: new values use the newest version, older ones still open", () => {
    const k1 = key();
    const old = new FieldKeyRing("master", [{ version: 1, key: k1 }]).encrypt(
      "a",
      ctx,
    );
    const both = new FieldKeyRing("master", [
      { version: 1, key: k1 },
      { version: 2, key: key() },
    ]);
    expect(ciphertextKeyInfo(both.encrypt("b", ctx))!.version).toBe(2);
    expect(both.decrypt(old, ctx)).toBe("a");
  });

  it("encryptObject/decryptObject keep shape and leave null alone", () => {
    const value = { a: "x", b: [1, null, { c: true }], d: null, e: undefined };
    const sealed = ring.encryptObject(value, ctx) as any;
    expect(sealed.d).toBeNull();
    expect(sealed.e).toBeUndefined();
    expect(isEncrypted(sealed.a)).toBe(true);
    expect(sealed.b[1]).toBeNull();
    expect(ring.decryptObject(sealed, ctx)).toEqual(value);
    expect(ring.encryptObject(null, ctx)).toBeNull();
  });
});

describe("blind indexes", () => {
  const bidx = new FieldKeyRing("master", [{ version: 1, key: key() }]);
  const ectx = { model: "User", field: "email" };

  it("is deterministic per key and field, and separate across fields", () => {
    const a = bidx.blindIndex(
      normalizeForIndex(" Asha@Example.COM ", "email"),
      ectx,
    );
    const b = bidx.blindIndex(
      normalizeForIndex("asha@example.com", "email"),
      ectx,
    );
    expect(blindIndexEquals(a, b)).toBe(true);
    expect(a).not.toBe(
      bidx.blindIndex("asha@example.com", { model: "Lead", field: "email" }),
    );
    const other = new FieldKeyRing("master", [{ version: 1, key: key() }]);
    expect(a).not.toBe(other.blindIndex("asha@example.com", ectx));
    expect(a).not.toContain("asha");
  });

  it("normalises mobile numbers", () => {
    expect(normalizeForIndex("+91 98765-43210", "mobile")).toBe(
      "+919876543210",
    );
    expect(normalizeForIndex("98765 43210", "mobile")).toBe("9876543210");
  });

  it("returns one index per held key version during rotation", () => {
    const r = new FieldKeyRing("m", [
      { version: 1, key: key() },
      { version: 2, key: key() },
    ]);
    const all = r.blindIndexes("x", ectx);
    expect(all).toHaveLength(2);
    expect(all).toContain(r.blindIndex("x", ectx));
  });

  it("compares in constant time and handles length mismatch", () => {
    expect(blindIndexEquals("hmac:1.aaa", "hmac:1.aab")).toBe(false);
    expect(blindIndexEquals("hmac:1.aaa", "hmac:1.aaaa")).toBe(false);
  });
});
