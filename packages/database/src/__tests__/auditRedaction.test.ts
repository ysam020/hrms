import { isSensitiveAuditField, redactAuditValue } from "../auditMiddleware";

// Fields shaped like credentials are redacted even when nobody listed them.

describe("audit redaction", () => {
  it("redacts credential-shaped fields at any depth", () => {
    const out = redactAuditValue({
      name: "Asha",
      tokenHashes: ["9906364053543c9d"],
      recoveryCodeHash: "1008b4a9",
      nested: { apiKey: "k", password: "p", title: "kept" },
    }) as any;
    expect(out.name).toBe("Asha");
    expect(out.tokenHashes).toBe("[REDACTED]");
    expect(out.recoveryCodeHash).toBe("[REDACTED]");
    expect(out.nested).toEqual({
      apiKey: "[REDACTED]",
      password: "[REDACTED]",
      title: "kept",
    });
  });

  it("leaves ordinary business fields alone", () => {
    for (const k of ["salary", "designation", "emailVerifiedAt", "status"])
      expect(isSensitiveAuditField(k)).toBe(false);
  });
});
