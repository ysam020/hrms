import {
  encryptField,
  decryptField,
  readSensitiveStrict,
  readSensitiveForDisplay,
  isFieldCiphertext,
  claimsFieldCiphertext,
  classifySensitiveValue,
  encryptFaceDescriptor,
  readFaceDescriptor,
  activeFieldKeyId,
  fieldKeyId,
  setFieldCryptoFailureHook,
  FieldCryptoError,
  aesEncrypt,
} from "../index";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const SYNTHETIC = "000000000000";

const expectCode = (fn: () => unknown, code: string) => {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(FieldCryptoError);
  expect((caught as FieldCryptoError).code).toBe(code);
};

const flipLastChar = (value: string, segment: number) => {
  const parts = value.split(":");
  const s = parts[segment];
  const last = s[s.length - 1] === "A" ? "Q" : "A";
  parts[segment] = s.slice(0, -1) + last;
  return parts.join(":");
};

beforeEach(() => {
  process.env.CRYPTO_ENCRYPTION_KEY = KEY_A;
  delete process.env.CRYPTO_ENCRYPTION_PREVIOUS_KEYS;
  setFieldCryptoFailureHook(() => {});
});

afterAll(() => {
  delete process.env.CRYPTO_ENCRYPTION_KEY;
  delete process.env.CRYPTO_ENCRYPTION_PREVIOUS_KEYS;
});

describe("encryptField / decryptField", () => {
  it("round-trips and uses the versioned format", () => {
    const sealed = encryptField(SYNTHETIC, "aadhar_no");
    expect(isFieldCiphertext(sealed)).toBe(true);
    expect(sealed.startsWith(`enc:v1:${activeFieldKeyId()}:`)).toBe(true);
    expect(sealed).not.toContain(SYNTHETIC);
    expect(decryptField(sealed, "aadhar_no")).toBe(SYNTHETIC);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptField(SYNTHETIC, "aadhar_no")).not.toBe(
      encryptField(SYNTHETIC, "aadhar_no"),
    );
  });

  it("handles unicode and long values", () => {
    const value = "ठिकाना ".repeat(500);
    expect(decryptField(encryptField(value, "f"), "f")).toBe(value);
  });

  it("refuses to seal a value that already claims to be ciphertext", () => {
    const sealed = encryptField(SYNTHETIC, "aadhar_no");
    expectCode(() => encryptField(sealed, "aadhar_no"), "CIPHERTEXT_INPUT");
  });
});

describe("failure modes", () => {
  it("rejects a tampered ciphertext", () => {
    const sealed = encryptField(SYNTHETIC, "aadhar_no");
    expectCode(
      () => decryptField(flipLastChar(sealed, 5), "aadhar_no"),
      "AUTH_FAILED",
    );
  });

  it("rejects a tampered authentication tag", () => {
    const sealed = encryptField(SYNTHETIC, "aadhar_no");
    const parts = sealed.split(":");
    const first = parts[4][0] === "A" ? "Q" : "A";
    parts[4] = first + parts[4].slice(1);
    expectCode(() => decryptField(parts.join(":"), "aadhar_no"), "AUTH_FAILED");
  });

  it("rejects a value moved to another field", () => {
    const sealed = encryptField(SYNTHETIC, "aadhar_no");
    expectCode(() => decryptField(sealed, "pan_no"), "AUTH_FAILED");
  });

  it("reports an unsupported version", () => {
    const sealed = encryptField(SYNTHETIC, "f").replace("enc:v1:", "enc:v9:");
    expectCode(() => decryptField(sealed, "f"), "UNSUPPORTED_VERSION");
  });

  it("reports malformed ciphertext", () => {
    expectCode(() => decryptField("enc:v1:short", "f"), "MALFORMED");
    expectCode(() => decryptField("not-encrypted", "f"), "MALFORMED");
  });

  it("reports a missing key", () => {
    const sealed = encryptField(SYNTHETIC, "f");
    delete process.env.CRYPTO_ENCRYPTION_KEY;
    expectCode(() => decryptField(sealed, "f"), "MISSING_KEY");
    expectCode(() => encryptField(SYNTHETIC, "f"), "MISSING_KEY");
  });

  it("reports a malformed key as missing", () => {
    process.env.CRYPTO_ENCRYPTION_KEY = "not-hex";
    expectCode(() => encryptField(SYNTHETIC, "f"), "MISSING_KEY");
  });

  it("reports a value sealed under a key it does not hold", () => {
    const sealed = encryptField(SYNTHETIC, "f");
    process.env.CRYPTO_ENCRYPTION_KEY = KEY_B;
    expectCode(() => decryptField(sealed, "f"), "UNKNOWN_KEY");
  });

  it("never leaks the value or the key in an error", () => {
    const sealed = encryptField(SYNTHETIC, "f");
    try {
      decryptField(flipLastChar(sealed, 5), "f");
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(SYNTHETIC);
      expect(String((err as Error).message)).not.toContain(KEY_A);
      expect(String((err as Error).stack)).not.toContain(KEY_A);
    }
  });
});

describe("key rotation", () => {
  it("opens values sealed under a previous key and writes under the new one", () => {
    const old = encryptField(SYNTHETIC, "f");
    const oldKid = fieldKeyId(old);
    process.env.CRYPTO_ENCRYPTION_KEY = KEY_B;
    process.env.CRYPTO_ENCRYPTION_PREVIOUS_KEYS = KEY_A;
    expect(decryptField(old, "f")).toBe(SYNTHETIC);
    const fresh = encryptField(SYNTHETIC, "f");
    expect(fieldKeyId(fresh)).toBe(activeFieldKeyId());
    expect(fieldKeyId(fresh)).not.toBe(oldKid);
  });

  it("does not expose the raw key as the key id", () => {
    expect(KEY_A).not.toContain(activeFieldKeyId());
  });
});

describe("mixed legacy and encrypted data", () => {
  it("returns legacy plaintext unchanged", () => {
    expect(readSensitiveStrict(SYNTHETIC, "aadhar_no")).toBe(SYNTHETIC);
  });

  it("opens the current format", () => {
    expect(readSensitiveStrict(encryptField(SYNTHETIC, "f"), "f")).toBe(
      SYNTHETIC,
    );
  });

  it("opens legacy CBC values", () => {
    expect(readSensitiveStrict(aesEncrypt(SYNTHETIC), "f")).toBe(SYNTHETIC);
  });

  it("keeps a colon-separated plaintext that is not really CBC", () => {
    expect(readSensitiveStrict("12:34 Main Road", "f")).toBe("12:34 Main Road");
  });

  it("treats empty values as empty", () => {
    for (const v of [null, undefined, ""]) {
      expect(readSensitiveStrict(v, "f")).toBe("");
      expect(classifySensitiveValue(v)).toBe("empty");
    }
  });

  it("classifies values without opening them", () => {
    expect(classifySensitiveValue(SYNTHETIC)).toBe("legacy-plaintext");
    delete process.env.CRYPTO_ENCRYPTION_KEY;
    expect(classifySensitiveValue("enc:v1:abc")).toBe("encrypted");
  });

  it("recognises claimed ciphertext of any version", () => {
    expect(claimsFieldCiphertext("enc:v7:x")).toBe(true);
    expect(claimsFieldCiphertext(SYNTHETIC)).toBe(false);
    expect(claimsFieldCiphertext(undefined)).toBe(false);
  });
});

describe("strict and display reads", () => {
  it("strict read throws on damage, never returning ciphertext", () => {
    const damaged = flipLastChar(encryptField(SYNTHETIC, "f"), 5);
    expectCode(() => readSensitiveStrict(damaged, "f"), "AUTH_FAILED");
  });

  it("display read returns empty on damage and reports without the value", () => {
    const events: unknown[] = [];
    setFieldCryptoFailureHook((info) => events.push(info));
    const damaged = flipLastChar(encryptField(SYNTHETIC, "f"), 5);
    expect(readSensitiveForDisplay(damaged, "f")).toBe("");
    expect(events).toEqual([{ code: "AUTH_FAILED", field: "f" }]);
  });

  it("display read returns empty rather than ciphertext under the wrong key", () => {
    const sealed = encryptField(SYNTHETIC, "f");
    process.env.CRYPTO_ENCRYPTION_KEY = KEY_B;
    expect(readSensitiveForDisplay(sealed, "f")).toBe("");
  });
});

describe("face descriptors", () => {
  const descriptor = Array.from({ length: 128 }, (_, i) => i / 128);

  it("round-trips", () => {
    expect(readFaceDescriptor(encryptFaceDescriptor(descriptor))).toEqual(
      descriptor,
    );
  });

  it("keeps the numbers out of the stored form", () => {
    expect(encryptFaceDescriptor(descriptor)).not.toContain("0.0078125");
  });

  it("reads the legacy array form", () => {
    expect(readFaceDescriptor(descriptor)).toEqual(descriptor);
  });

  it("returns null for absent or damaged values", () => {
    expect(readFaceDescriptor(null)).toBeNull();
    expect(readFaceDescriptor("")).toBeNull();
    expect(
      readFaceDescriptor(flipLastChar(encryptFaceDescriptor(descriptor), 5)),
    ).toBeNull();
  });
});
