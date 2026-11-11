import { aesEncrypt } from "@hrms/crypto";
import { openResult, scopeFor } from "../fieldProtection";

// A legacy (pre-migration) calendar token sealed under another environment's
// key can't be opened. Reading the user must still work: Google sign-in loads
// the full record, and one dead optional credential must not lock them out.
describe("legacy CBC values on read", () => {
  const saved = process.env.CRYPTO_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.CRYPTO_ENCRYPTION_KEY = "a".repeat(64);
  });
  afterAll(() => {
    process.env.CRYPTO_ENCRYPTION_KEY = saved;
  });

  it("still opens one sealed with this environment's key", async () => {
    const token = aesEncrypt("refresh-token-1");
    const row = (await openResult(
      "User",
      { id: "u1", googleCalendarRefreshToken: token },
      scopeFor("master"),
    )) as Record<string, unknown>;
    expect(row.googleCalendarRefreshToken).toBe("refresh-token-1");
  });

  it("treats one it can't open as empty instead of failing the read", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Valid shape, wrong key: decryption fails.
    const foreign = `${"0".repeat(32)}:${"ab".repeat(16)}`;
    const row = (await openResult(
      "User",
      { id: "u1", isActive: true, googleCalendarRefreshToken: foreign },
      scopeFor("master"),
    )) as Record<string, unknown>;
    expect(row.googleCalendarRefreshToken).toBeNull();
    expect(row.isActive).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
