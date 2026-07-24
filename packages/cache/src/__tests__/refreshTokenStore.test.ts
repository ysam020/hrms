import { createHash } from "node:crypto";
import { prisma } from "@hrms/db";
import {
  storeRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  markOrgSetupComplete,
} from "../refreshTokenStore";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const mockRedisInstance = {
  setex: jest.fn().mockResolvedValue("OK"),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  eval: jest.fn(),
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

describe("rotateRefreshToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rotates and returns the new token when the presented token is current, mirroring the hash onto Mongo", async () => {
    const newMeta = {
      tokenHash: hash("new-tok"),
      tenantId: "t1",
      tenantRole: "owner",
      dbName: "db1",
      orgSetupComplete: true,
    };
    mockRedisInstance.eval.mockResolvedValueOnce([
      1,
      "new-tok",
      JSON.stringify(newMeta),
    ]);
    db.user.update.mockResolvedValue({});

    const result = await rotateRefreshToken("u1", "old-tok", "new-tok");

    expect(result).toEqual({
      ok: true,
      currentToken: "new-tok",
      tenantId: "t1",
      tenantRole: "owner",
      dbName: "db1",
      orgSetupComplete: true,
    });
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      "refresh:u1",
      "refresh-prev:u1",
      hash("old-tok"),
      hash("new-tok"),
      String(30 * 24 * 60 * 60),
      "new-tok",
      "60",
    );
    // Only the winning rotation should mirror the new hash onto Mongo.
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { refreshToken: hash("new-tok") },
    });
  });

  it("returns the already-rotated token — without touching Mongo — when this call lost the race", async () => {
    const currentMeta = {
      tokenHash: hash("winner-tok"),
      tenantId: "t1",
      tenantRole: "owner",
      dbName: null,
      orgSetupComplete: true,
    };
    // flag 0: presented token matched the grace slot, not current — another
    // concurrent request already won the rotation.
    mockRedisInstance.eval.mockResolvedValueOnce([
      0,
      "winner-tok",
      JSON.stringify(currentMeta),
    ]);

    const result = await rotateRefreshToken("u1", "old-tok", "my-candidate");

    expect(result).toEqual(
      expect.objectContaining({ ok: true, currentToken: "winner-tok" }),
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects a token that matches neither the current nor the grace-period one, without a Mongo retry", async () => {
    mockRedisInstance.eval.mockResolvedValueOnce([-2, "", ""]);

    const result = await rotateRefreshToken("u1", "unrelated-tok", "new-tok");

    expect(result).toEqual({ ok: false });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to MongoDB on a cold cache, warms Redis, and retries the atomic rotate", async () => {
    mockRedisInstance.eval
      .mockResolvedValueOnce([-1, "", ""])
      .mockResolvedValueOnce([
        1,
        "new-tok",
        JSON.stringify({
          tokenHash: hash("new-tok"),
          tenantId: "t1",
          tenantRole: null,
          dbName: null,
        }),
      ]);
    db.user.findUnique.mockResolvedValue({
      refreshToken: hash("db-token"),
      tenantId: "t1",
    });
    db.user.update.mockResolvedValue({});

    const result = await rotateRefreshToken("u1", "db-token", "new-tok");

    expect(result).toEqual(
      expect.objectContaining({ ok: true, currentToken: "new-tok" }),
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
    expect(mockRedisInstance.eval).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false when there is no record in Redis or MongoDB", async () => {
    mockRedisInstance.eval.mockResolvedValueOnce([-1, "", ""]);
    db.user.findUnique.mockResolvedValue({
      refreshToken: null,
      tenantId: null,
    });

    const result = await rotateRefreshToken("u1", "anything", "new-tok");

    expect(result).toEqual({ ok: false });
    expect(mockRedisInstance.eval).toHaveBeenCalledTimes(1);
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
