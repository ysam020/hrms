import { createHash } from "node:crypto";
import { prisma } from "@hrms/db";
import {
  storeRefreshToken,
  storePendingSubscription,
  getPendingSubscription,
  clearPendingSubscription,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
  getRazorpayPlanId,
  setRazorpayPlanId,
  markOrgSetupComplete,
} from "../services/tenantTokenStore";

const mockRedisInstance = {
  setex: jest.fn().mockResolvedValue("OK"),
  get: jest.fn(),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
};

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => mockRedisInstance),
);

jest.mock("@hrms/db", () => ({
  prisma: { user: { update: jest.fn() } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const db: any = prisma;
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

describe("tenantTokenStore", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("storeRefreshToken", () => {
    it("writes token metadata to Redis and mirrors it onto the User row", async () => {
      db.user.update.mockResolvedValue({});
      await storeRefreshToken(
        "u1",
        "tok-1",
        "t1",
        "owner",
        undefined,
        "hrms-acme",
        false,
      );
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "refresh:u1",
        30 * 24 * 60 * 60,
        JSON.stringify({
          tokenHash: hash("tok-1"),
          tenantId: "t1",
          tenantRole: "owner",
          dbName: "hrms-acme",
          orgSetupComplete: false,
        }),
      );
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { refreshToken: hash("tok-1") },
      });
    });
  });

  describe("pending subscription", () => {
    it("stores and retrieves a pending subscription", async () => {
      await storePendingSubscription("u1", "sub_1", "monthly");
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "pending_sub:u1",
        7 * 24 * 60 * 60,
        JSON.stringify({ subscriptionId: "sub_1", billing: "monthly" }),
      );

      mockRedisInstance.get.mockResolvedValue(
        JSON.stringify({ subscriptionId: "sub_1", billing: "monthly" }),
      );
      const result = await getPendingSubscription("u1");
      expect(result).toEqual({ subscriptionId: "sub_1", billing: "monthly" });
    });

    it("returns null when there is no pending subscription", async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      expect(await getPendingSubscription("u1")).toBeNull();
    });

    it("returns null for malformed JSON instead of throwing", async () => {
      mockRedisInstance.get.mockResolvedValue("not-json{");
      expect(await getPendingSubscription("u1")).toBeNull();
    });

    it("clears the pending subscription key", async () => {
      await clearPendingSubscription("u1");
      expect(mockRedisInstance.del).toHaveBeenCalledWith("pending_sub:u1");
    });
  });

  describe("webhook idempotency", () => {
    it("reports unprocessed when the key is missing", async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      expect(await isWebhookEventProcessed("evt_1")).toBe(false);
    });

    it("reports processed once the key exists", async () => {
      mockRedisInstance.get.mockResolvedValue("1");
      expect(await isWebhookEventProcessed("evt_1")).toBe(true);
    });

    it("marks an event processed with the 48h dedup TTL", async () => {
      await markWebhookEventProcessed("evt_1");
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "webhook_event:evt_1",
        48 * 60 * 60,
        "1",
      );
    });
  });

  describe("Razorpay plan id cache", () => {
    it("stores and retrieves a plan id with no TTL", async () => {
      await setRazorpayPlanId("monthly", "plan_123");
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        "razorpay_plan:monthly",
        "plan_123",
      );

      mockRedisInstance.get.mockResolvedValue("plan_123");
      expect(await getRazorpayPlanId("monthly")).toBe("plan_123");
    });
  });

  describe("markOrgSetupComplete", () => {
    it("does nothing when there is no stored refresh-token metadata", async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      await markOrgSetupComplete("u1");
      expect(mockRedisInstance.setex).not.toHaveBeenCalled();
    });

    it("does nothing when the stored metadata is malformed", async () => {
      mockRedisInstance.get.mockResolvedValue("not-json{");
      await markOrgSetupComplete("u1");
      expect(mockRedisInstance.setex).not.toHaveBeenCalled();
    });

    it("flips orgSetupComplete to true and rewrites the metadata", async () => {
      mockRedisInstance.get.mockResolvedValue(
        JSON.stringify({
          tokenHash: hash("tok-1"),
          tenantId: "t1",
          tenantRole: "owner",
          dbName: null,
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
          dbName: null,
          orgSetupComplete: true,
        }),
      );
    });
  });
});
