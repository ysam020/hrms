import { tokenFns } from "../tokens";

const SECRET = "test-secret-key";

describe("tokenFns.generateToken", () => {
  it("returns a non-empty JWT string", () => {
    const token = tokenFns.generateToken({ userId: "1" }, SECRET);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
  });

  it("embeds payload fields in the token", () => {
    const token = tokenFns.generateToken(
      { userId: "abc", role: "admin" },
      SECRET,
    );
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    expect(payload.userId).toBe("abc");
    expect(payload.role).toBe("admin");
  });

  it("respects expiresIn option", () => {
    const token = tokenFns.generateToken({ userId: "1" }, SECRET, {
      expiresIn: "1h",
    });
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("produces different tokens for different payloads", () => {
    const t1 = tokenFns.generateToken({ userId: "1" }, SECRET);
    const t2 = tokenFns.generateToken({ userId: "2" }, SECRET);
    expect(t1).not.toBe(t2);
  });

  it("produces different tokens for different secrets", () => {
    const t1 = tokenFns.generateToken({ userId: "1" }, "secret-a");
    const t2 = tokenFns.generateToken({ userId: "1" }, "secret-b");
    expect(t1).not.toBe(t2);
  });
});

describe("tokenFns.verifyToken", () => {
  it("returns the payload for a valid token", () => {
    const token = tokenFns.generateToken({ userId: "xyz" }, SECRET);
    const payload = tokenFns.verifyToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload.userId).toBe("xyz");
  });

  it("returns null for a token signed with a different secret", () => {
    const token = tokenFns.generateToken({ userId: "1" }, "original-secret");
    expect(tokenFns.verifyToken(token, "wrong-secret")).toBeNull();
  });

  it("returns null for a malformed token string", () => {
    expect(tokenFns.verifyToken("not.a.token", SECRET)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(tokenFns.verifyToken("", SECRET)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = tokenFns.generateToken({ userId: "1" }, SECRET, {
      expiresIn: "0s",
    });
    // Wait a tick for it to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(tokenFns.verifyToken(token, SECRET)).toBeNull();
        resolve();
      }, 10);
    });
  });
});
