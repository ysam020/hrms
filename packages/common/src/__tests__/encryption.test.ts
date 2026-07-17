describe("aesEncrypt / aesDecrypt", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, AES_SECRET_KEY: "test-secret-key" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("round-trips plaintext through encrypt then decrypt", () => {
    const { aesEncrypt, aesDecrypt } = require("../encryption");
    const encrypted = aesEncrypt("sensitive data");
    expect(aesDecrypt(encrypted)).toBe("sensitive data");
  });

  it("round-trips unicode and special characters", () => {
    const { aesEncrypt, aesDecrypt } = require("../encryption");
    const text = "héllo wörld 🔒 : special chars !@#$%^&*()";
    expect(aesDecrypt(aesEncrypt(text))).toBe(text);
  });

  it("round-trips an empty string", () => {
    const { aesEncrypt, aesDecrypt } = require("../encryption");
    expect(aesDecrypt(aesEncrypt(""))).toBe("");
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", () => {
    const { aesEncrypt } = require("../encryption");
    const a = aesEncrypt("same input");
    const b = aesEncrypt("same input");
    expect(a).not.toBe(b);
  });

  it("prefixes ciphertext with a 16-byte (32 hex char) IV followed by a colon", () => {
    const { aesEncrypt } = require("../encryption");
    const encrypted = aesEncrypt("hello");
    const [ivHex] = encrypted.split(":");
    expect(ivHex).toHaveLength(32);
    expect(ivHex).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different ciphertext under different AES_SECRET_KEY values", () => {
    const { aesEncrypt: encryptA } = require("../encryption");
    const a = encryptA("same input");

    jest.resetModules();
    process.env.AES_SECRET_KEY = "a-completely-different-key";
    const { aesEncrypt: encryptB } = require("../encryption");
    const b = encryptB("same input");

    expect(a.split(":")[1]).not.toBe(b.split(":")[1]);
  });

  it("throws when decrypting with the wrong key", () => {
    const { aesEncrypt: encryptA } = require("../encryption");
    const encrypted = encryptA("secret");

    jest.resetModules();
    process.env.AES_SECRET_KEY = "a-completely-different-key";
    const { aesDecrypt: decryptB } = require("../encryption");

    expect(() => decryptB(encrypted)).toThrow();
  });

  it("falls back to a hardcoded default key when AES_SECRET_KEY is unset", () => {
    // Flags a real security gap: if the AES_SECRET_KEY env var is missing
    // (e.g. a misconfigured deployment), this module silently encrypts with
    // a hardcoded, publicly-visible fallback key instead of failing loudly.
    delete process.env.AES_SECRET_KEY;
    const { aesEncrypt, aesDecrypt } = require("../encryption");
    const encrypted = aesEncrypt("sensitive data");
    expect(aesDecrypt(encrypted)).toBe("sensitive data");
  });
});
