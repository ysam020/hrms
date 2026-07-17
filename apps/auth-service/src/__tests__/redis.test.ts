import { prisma } from "@hrms/db";
import {
  getRedisClient,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
} from "../services/redis";

const mockRedisInstance = {
  setex: jest.fn().mockResolvedValue("OK"),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
};

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

jest.mock("@hrms/db", () => ({
  prisma: { user: { update: jest.fn(), findUnique: jest.fn() } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const db: any = prisma;

describe("getRedisClient", () => {
  it("memoizes the client across calls (single connection)", () => {
    const a = getRedisClient();
    const b = getRedisClient();
    expect(a).toBe(b);
  });
});

describe("storeRefreshToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores the token metadata in Redis and mirrors it onto the User row", async () => {
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
        token: "tok-1",
        tenantId: "t1",
        tenantRole: "owner",
        dbName: "hrms-acme",
        orgSetupComplete: true,
      }),
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { refreshToken: "tok-1" },
    });
  });

  it("stashes the previous token under a short grace-period key when provided", async () => {
    db.user.update.mockResolvedValue({});
    await storeRefreshToken("u1", "new-tok", "t1", "owner", "old-tok");
    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh-prev:u1",
      60,
      "old-tok",
    );
  });

  it("does not write a grace-period key when there is no previous token", async () => {
    db.user.update.mockResolvedValue({});
    await storeRefreshToken("u1", "new-tok", "t1", "owner");
    expect(mockRedisInstance.setex).toHaveBeenCalledTimes(1);
  });
});

describe("validateRefreshToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns ok:true when the token matches the current stored one", async () => {
    mockRedisInstance.get.mockResolvedValue(
      JSON.stringify({
        token: "tok-1",
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

  it("supports legacy plain-string tokens (pre-JSON format)", async () => {
    mockRedisInstance.get.mockResolvedValue("plain-legacy-token");
    const result = await validateRefreshToken("u1", "plain-legacy-token");
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        currentToken: "plain-legacy-token",
        tenantId: null,
      }),
    );
  });

  it("falls back to MongoDB on a Redis miss and re-warms the cache", async () => {
    mockRedisInstance.get.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({
      refreshToken: "db-token",
      tenantId: "t1",
    });
    const result = await validateRefreshToken("u1", "db-token");
    expect(result).toEqual(
      expect.objectContaining({ ok: true, currentToken: "db-token" }),
    );
    expect(mockRedisInstance.setex).toHaveBeenCalledWith(
      "refresh:u1",
      expect.any(Number),
      expect.stringContaining("db-token"),
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

  it("accepts a stale token still within the grace-period window", async () => {
    mockRedisInstance.get
      .mockResolvedValueOnce(
        JSON.stringify({
          token: "new-tok",
          tenantId: "t1",
          tenantRole: "owner",
          dbName: null,
        }),
      )
      .mockResolvedValueOnce("old-tok"); // refresh-prev lookup
    const result = await validateRefreshToken("u1", "old-tok");
    expect(result).toEqual(
      expect.objectContaining({ ok: true, currentToken: "new-tok" }),
    );
  });

  it("rejects a token that matches neither the current nor the grace-period one", async () => {
    mockRedisInstance.get
      .mockResolvedValueOnce(
        JSON.stringify({
          token: "new-tok",
          tenantId: "t1",
          tenantRole: "owner",
          dbName: null,
        }),
      )
      .mockResolvedValueOnce("some-other-old-tok");
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
