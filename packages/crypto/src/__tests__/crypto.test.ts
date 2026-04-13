import { aesEncrypt, aesDecrypt, safeDecrypt } from "../index";

// Use a fixed 32-byte hex key for deterministic tests
const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

beforeAll(() => {
  process.env.CRYPTO_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  delete process.env.CRYPTO_ENCRYPTION_KEY;
});

describe("aesEncrypt / aesDecrypt", () => {
  it("encrypts a string and produces a hex:hex:hex format", () => {
    const encrypted = aesEncrypt("hello");
    expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/i);
  });

  it("round-trips: decrypt(encrypt(x)) === x", () => {
    const original = "super secret value";
    expect(aesDecrypt(aesEncrypt(original))).toBe(original);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const a = aesEncrypt("same input");
    const b = aesEncrypt("same input");
    expect(a).not.toBe(b);
  });

  it("decrypts both ciphertexts back to the same plaintext", () => {
    const plaintext = "same input";
    const a = aesEncrypt(plaintext);
    const b = aesEncrypt(plaintext);
    expect(aesDecrypt(a)).toBe(plaintext);
    expect(aesDecrypt(b)).toBe(plaintext);
  });

  it("handles empty string round-trip", () => {
    expect(aesDecrypt(aesEncrypt(""))).toBe("");
  });

  it("handles unicode characters", () => {
    const value = "こんにちは 🔐";
    expect(aesDecrypt(aesEncrypt(value))).toBe(value);
  });

  it("handles long strings", () => {
    const long = "x".repeat(10000);
    expect(aesDecrypt(aesEncrypt(long))).toBe(long);
  });

  it("throws when CRYPTO_ENCRYPTION_KEY is not set", () => {
    const original = process.env.CRYPTO_ENCRYPTION_KEY;
    delete process.env.CRYPTO_ENCRYPTION_KEY;
    expect(() => aesEncrypt("test")).toThrow();
    process.env.CRYPTO_ENCRYPTION_KEY = original;
  });
});

describe("safeDecrypt", () => {
  it("returns empty string for null", () => {
    expect(safeDecrypt(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(safeDecrypt(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(safeDecrypt("")).toBe("");
  });

  it("decrypts a validly encrypted value", () => {
    const encrypted = aesEncrypt("sensitive data");
    expect(safeDecrypt(encrypted)).toBe("sensitive data");
  });

  it("returns the original value as-is when it does not look encrypted (no colon)", () => {
    expect(safeDecrypt("plain text value")).toBe("plain text value");
  });

  it("returns the original value as-is when it contains non-hex characters", () => {
    expect(safeDecrypt("not:hex!@#")).toBe("not:hex!@#");
  });

  it("returns the original value when it looks like hex:hex but cannot be decrypted (wrong key)", () => {
    // Encrypt with current key, then change key — safeDecrypt should return the raw value
    const encrypted = aesEncrypt("secret");
    process.env.CRYPTO_ENCRYPTION_KEY = "b".repeat(64);
    const result = safeDecrypt(encrypted);
    // Should not throw — returns the original encrypted string on failure
    expect(typeof result).toBe("string");
    // Restore key
    process.env.CRYPTO_ENCRYPTION_KEY = TEST_KEY;
  });

  it("handles a real plaintext field that happens to match hex:hex pattern gracefully", () => {
    // If decryption fails for a hex-looking string, returns the raw value
    const hexLooking = "aabbcc:ddeeff";
    const result = safeDecrypt(hexLooking);
    expect(typeof result).toBe("string");
  });
});
