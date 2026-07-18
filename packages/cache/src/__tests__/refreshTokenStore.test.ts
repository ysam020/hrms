import { createHash } from "node:crypto";
import { prisma } from "@hrms/db";
import {
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  markOrgSetupComplete,
} from "../refreshTokenStore";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const mockRedisInstance = {
  setex: jest.fn().mockResolvedValue("OK"),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

jest.mock("../client", () => ({
  getRedisClient: () => mockRedisInstance,
}));

jest.mock("@hrms/db", () => ({
  prisma: { user: { update: jest.fn(), findUnique: jest.fn() } },
}));

const db: any = prisma;

describe("storeRefreshToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores the token as a SHA-256 hash in Redis and mirrors the hash onto the User row", async () => {
    db.user.update.mockResolvedValue({});
    await storeRefreshToken(
      "u1",
      "tok-1",
      "t1",
      "owner",
      undefined,
      "hrms-acme",
      true,
    );

    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh:u1",
      30 * 24 * 60 * 60,
      JSON.stringify({
        tokenHash: hash("tok-1"),
        tenantId: "t1",
        tenantRole: "owner",
        dbName: "hrms-acme",
        orgSetupComplete: true,
      }),
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { refreshToken: hash("tok-1") },
    });
    // The raw token must never appear in what gets persisted.
    expect(mockRedisInstance.setex.mock.calls[0][2]).not.toContain("tok-1");
  });

  it("stashes a hash of the previous token plus the new raw token under a short grace-period key when provided", async () => {
    db.user.update.mockResolvedValue({});
    await storeRefreshToken("u1", "new-tok", "t1", "owner", "old-tok");
    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh-prev:u1",
      60,
      JSON.stringify({ prevTokenHash: hash("old-tok"), newToken: "new-tok" }),
    );
  });

  it("does not write a grace-period key when there is no previous token", async () => {
    db.user.update.mockResolvedValue({});
    await storeRefreshToken("u1", "new-tok", "t1", "owner");
    expect(mockRedisInstance.setex).toHaveBeenCalledTimes(1);
  });

  it("supports the gateway calling convention (no previousToken, positional dbName/orgSetupComplete)", async () => {
    // apps/api-gateway's tenant.ts call sites — verifies the single shared
    // implementation serves both call shapes without a param-shift bug.
    db.user.update.mockResolvedValue({});
    await storeRefreshToken(
      "u1",
      "tok-2",
      "t2",
      "admin",
      undefined,
      "db2",
      false,
    );
    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh:u1",
      30 * 24 * 60 * 60,
      JSON.stringify({
        tokenHash: hash("tok-2"),
        tenantId: "t2",
        tenantRole: "admin",
        dbName: "db2",
        orgSetupComplete: false,
      }),
    );
  });
});

describe("validateRefreshToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns ok:true when the presented token's hash matches the current stored hash", async () => {
    mockRedisInstance.get.mockResolvedValue(
      JSON.stringify({
        tokenHash: hash("tok-1"),
        tenantId: "t1",
        tenantRole: "owner",
        dbName: "db1",
      }),
    );
    const result = await validateRefreshToken("u1", "tok-1");
    expect(result).toEqual({
      ok: true,
      currentToken: "tok-1",
      tenantId: "t1",
      tenantRole: "owner",
      dbName: "db1",
      orgSetupComplete: true,
    });
  });

  it("rejects a pre-migration plaintext Redis value rather than trusting it", async () => {
    // Before this fix, a raw token string (no JSON, no hash) would have
    // been accepted directly. JSON.parse on it throws, and the fix must
    // treat that as a miss — never fall back to comparing the presented
    // token against unparsed raw Redis content.
    mockRedisInstance.get.mockResolvedValueOnce("plain-legacy-token");
    db.user.findUnique.mockResolvedValue({
      refreshToken: null,
      tenantId: null,
    });
    const result = await validateRefreshToken("u1", "plain-legacy-token");
    expect(result).toEqual({ ok: false });
  });

  it("falls back to MongoDB (comparing hashes) on a Redis miss and re-warms the cache with a hash", async () => {
    mockRedisInstance.get.mockResolvedValueOnce(null);
    db.user.findUnique.mockResolvedValue({
      refreshToken: hash("db-token"),
      tenantId: "t1",
    });
    const result = await validateRefreshToken("u1", "db-token");
    expect(result).toEqual(
      expect.objectContaining({ ok: true, currentToken: "db-token" }),
    );
    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh:u1",
      expect.any(Number),
      JSON.stringify({
        tokenHash: hash("db-token"),
        tenantId: "t1",
        tenantRole: null,
        dbName: null,
      }),
    );
  });

  it("returns ok:false when there is no token anywhere", async () => {
    mockRedisInstance.get.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({
      refreshToken: null,
      tenantId: null,
    });
    const result = await validateRefreshToken("u1", "anything");
    expect(result).toEqual({ ok: false });
  });

  it("accepts a stale token still within the grace-period window and returns the real rotated token", async () => {
    mockRedisInstance.get
      .mockResolvedValueOnce(
        JSON.stringify({
          tokenHash: hash("new-tok"),
          tenantId: "t1",
          tenantRole: "owner",
          dbName: null,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ prevTokenHash: hash("old-tok"), newToken: "new-tok" }),
      );
    const result = await validateRefreshToken("u1", "old-tok");
    expect(result).toEqual(
      expect.objectContaining({ ok: true, currentToken: "new-tok" }),
    );
  });

  it("rejects a token that matches neither the current nor the grace-period one", async () => {
    mockRedisInstance.get
      .mockResolvedValueOnce(
        JSON.stringify({
          tokenHash: hash("new-tok"),
          tenantId: "t1",
          tenantRole: "owner",
          dbName: null,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          prevTokenHash: hash("some-other-old-tok"),
          newToken: "new-tok",
        }),
      );
    const result = await validateRefreshToken("u1", "totally-unrelated-tok");
    expect(result).toEqual({ ok: false });
  });
});

describe("revokeRefreshToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes both Redis keys and clears the User row", async () => {
    db.user.update.mockResolvedValue({});
    await revokeRefreshToken("u1");
    expect(mockRedisInstance.del).toHaveBeenCalledWith("refresh:u1");
    expect(mockRedisInstance.del).toHaveBeenCalledWith("refresh-prev:u1");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { refreshToken: null },
    });
  });
});

describe("markOrgSetupComplete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing when there is no stored refresh-token metadata", async () => {
    mockRedisInstance.get.mockResolvedValue(null);
    await markOrgSetupComplete("u1");
    expect(mockRedisInstance.setex).not.toHaveBeenCalled();
  });

  it("flips orgSetupComplete to true on the stored metadata", async () => {
    mockRedisInstance.get.mockResolvedValue(
      JSON.stringify({
        tokenHash: hash("tok-1"),
        tenantId: "t1",
        tenantRole: "owner",
        dbName: "db1",
        orgSetupComplete: false,
      }),
    );
    await markOrgSetupComplete("u1");
    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh:u1",
      30 * 24 * 60 * 60,
      JSON.stringify({
        tokenHash: hash("tok-1"),
        tenantId: "t1",
        tenantRole: "owner",
        dbName: "db1",
        orgSetupComplete: true,
      }),
    );
  });
});
