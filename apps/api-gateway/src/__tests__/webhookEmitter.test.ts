import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { emitWebhookEvent } from "../utils/webhookEmitter";

jest.mock("@hrms/db", () => ({
  prismaWithTenant: {
    webhookEndpoint: { findMany: jest.fn() },
    webhookDelivery: { create: jest.fn() },
  },
  getTenantId: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  getWebhookQueue: jest.fn(() => ({ add: mockQueueAdd })),
}));

const mockGetTenantId = getTenantId as jest.Mock;
const mockEndpointFindMany = (prisma as any).webhookEndpoint
  .findMany as jest.Mock;
const mockDeliveryCreate = (prisma as any).webhookDelivery.create as jest.Mock;

describe("emitWebhookEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing when there is no tenant context", async () => {
    mockGetTenantId.mockReturnValue(undefined);
    await emitWebhookEvent("leave.approved", { id: "1" });
    expect(mockEndpointFindMany).not.toHaveBeenCalled();
  });

  it("does nothing when no endpoint is subscribed to the event", async () => {
    mockGetTenantId.mockReturnValue("t1");
    mockEndpointFindMany.mockResolvedValue([]);
    await emitWebhookEvent("leave.approved", { id: "1" });
    expect(mockDeliveryCreate).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("queries only active endpoints subscribed to this event type", async () => {
    mockGetTenantId.mockReturnValue("t1");
    mockEndpointFindMany.mockResolvedValue([]);
    await emitWebhookEvent("leave.approved", { id: "1" });
    expect(mockEndpointFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        isActive: true,
        events: { has: "leave.approved" },
      },
      select: { id: true },
    });
  });

  // Must run before any test that reaches a successful getWebhookQueue()
  // call — webhookEmitter.ts memoizes the resolved queue in a module-level
  // variable, so once it's warmed, later calls never re-invoke
  // require("@hrms/queue").getWebhookQueue() to observe a null override.
  it("logs and skips dispatch when the webhook queue is unavailable", async () => {
    mockGetTenantId.mockReturnValue("t1");
    mockEndpointFindMany.mockResolvedValue([{ id: "ep1" }]);
    const queueModule = require("@hrms/queue");
    queueModule.getWebhookQueue.mockReturnValueOnce(null);

    await emitWebhookEvent("leave.approved", { id: "1" });

    expect(mockDeliveryCreate).not.toHaveBeenCalled();
  });

  it("creates a pending delivery and enqueues a job for every subscribed endpoint", async () => {
    mockGetTenantId.mockReturnValue("t1");
    mockEndpointFindMany.mockResolvedValue([{ id: "ep1" }, { id: "ep2" }]);
    mockDeliveryCreate
      .mockResolvedValueOnce({ id: "d1" })
      .mockResolvedValueOnce({ id: "d2" });

    await emitWebhookEvent("leave.approved", { leaveId: "l1" });

    expect(mockDeliveryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        endpointId: "ep1",
        eventType: "leave.approved",
        status: "pending",
        payload: expect.objectContaining({
          event: "leave.approved",
          data: { leaveId: "l1" },
        }),
      }),
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "deliverWebhook",
      { deliveryId: "d1" },
      expect.objectContaining({ attempts: 3 }),
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "deliverWebhook",
      { deliveryId: "d2" },
      expect.any(Object),
    );
  });

  it("swallows errors so a webhook dispatch failure never throws", async () => {
    mockGetTenantId.mockReturnValue("t1");
    mockEndpointFindMany.mockRejectedValue(new Error("db down"));

    await expect(
      emitWebhookEvent("leave.approved", { id: "1" }),
    ).resolves.toBeUndefined();
  });
});
