import jwt from "jsonwebtoken";
import { resolveSocketUserId } from "../config/socketAuth";

describe("resolveSocketUserId", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, ACCESS_JWT_TOKEN: "test-jwt-secret" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns userId/tenantId/dbName for a valid token", async () => {
    const token = jwt.sign(
      { userId: "u1", tenantId: "t1", dbName: "tenant_db" },
      "test-jwt-secret",
      { algorithm: "HS256" },
    );
    await expect(resolveSocketUserId(token)).resolves.toEqual({
      userId: "u1",
      tenantId: "t1",
      dbName: "tenant_db",
    });
  });

  it("defaults tenantId and dbName to null when absent from the payload", async () => {
    const token = jwt.sign({ userId: "u1" }, "test-jwt-secret", {
      algorithm: "HS256",
    });
    await expect(resolveSocketUserId(token)).resolves.toEqual({
      userId: "u1",
      tenantId: null,
      dbName: null,
    });
  });

  it("returns null when the payload has no userId", async () => {
    const token = jwt.sign({ tenantId: "t1" }, "test-jwt-secret", {
      algorithm: "HS256",
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });

  it("returns null for a token signed with the wrong secret", async () => {
    const token = jwt.sign({ userId: "u1" }, "wrong-secret", {
      algorithm: "HS256",
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = jwt.sign({ userId: "u1" }, "test-jwt-secret", {
      algorithm: "HS256",
      expiresIn: -10,
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });

  it("returns null for a malformed token", async () => {
    await expect(resolveSocketUserId("not-a-jwt")).resolves.toBeNull();
  });

  it("rejects a token signed with a different algorithm (alg confusion)", async () => {
    // algorithms: ["HS256"] pins verification — a token signed with, say,
    // "none" or a mismatched alg must not be accepted.
    const token = jwt.sign({ userId: "u1" }, "test-jwt-secret", {
      algorithm: "HS384",
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });
});
