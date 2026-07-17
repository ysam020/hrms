import { prisma } from "@hrms/db";
import { getWebhookQueue } from "@hrms/queue";
import { retryFailedWebhooks } from "../jobs/retryFailedWebhooks";

jest.mock("@hrms/db", () => ({
  prisma: {
    webhookDelivery: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  getWebhookQueue: jest.fn(() => ({ add: mockAdd })),
}));

const mockFindMany = (prisma as any).webhookDelivery.findMany as jest.Mock;

describe("retryFailedWebhooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdd.mockResolvedValue(undefined);
  });

  it("does nothing when there are no stale deliveries", async () => {
    mockFindMany.mockResolvedValue([]);
    await retryFailedWebhooks();
    expect(getWebhookQueue).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("queries for pending, zero-attempt deliveries older than the stale threshold, capped at 200", async () => {
    mockFindMany.mockResolvedValue([]);
    await retryFailedWebhooks();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
          attempts: 0,
          createdAt: { lte: expect.any(Date) },
        }),
        take: 200,
      }),
    );
  });

  it("re-enqueues every stale delivery with a deterministic, idempotent job id", async () => {
    mockFindMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);

    await retryFailedWebhooks();

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledWith(
      "deliverWebhook",
      { deliveryId: "d1" },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        jobId: "retry:d1",
      }),
    );
    expect(mockAdd).toHaveBeenCalledWith(
      "deliverWebhook",
      { deliveryId: "d2" },
      expect.objectContaining({ jobId: "retry:d2" }),
    );
  });

  it("does not throw when one enqueue fails — uses allSettled so one failure doesn't block the rest", async () => {
    mockFindMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    mockAdd
      .mockRejectedValueOnce(new Error("queue down"))
      .mockResolvedValueOnce(undefined);

    await expect(retryFailedWebhooks()).resolves.toBeUndefined();
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });
});
