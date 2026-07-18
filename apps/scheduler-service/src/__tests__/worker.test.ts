const mockConnection = { host: "mock-redis" };
const mockDlqAdd = jest.fn().mockResolvedValue(undefined);

jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => mockConnection),
  getWebhookQueue: jest.fn(),
  getDeadLetterQueue: jest.fn(() => ({ add: mockDlqAdd })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  requestIdStorage: { run: jest.fn((_id: string, fn: () => any) => fn()) },
}));

// Capture the processor fn + registered event handlers for each `new Worker(...)`.
let capturedWorkers: Array<{
  queueName: string;
  processor: (job: any) => Promise<void>;
  opts: any;
  handlers: Record<string, (...args: any[]) => void>;
}> = [];

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(function (
    this: any,
    queueName: string,
    processor: any,
    opts: any,
  ) {
    this.handlers = {};
    this.on = (event: string, handler: any) => {
      this.handlers[event] = handler;
      return this;
    };
    capturedWorkers.push({
      queueName,
      processor,
      opts,
      handlers: this.handlers,
    });
    return this;
  }),
}));

const mockUpdateExpiredHrActivities = jest.fn().mockResolvedValue(undefined);
const mockCheckTicketSla = jest.fn().mockResolvedValue(undefined);
const mockDeliverWebhook = jest.fn().mockResolvedValue(undefined);

jest.mock("../jobs/updateExpiredHrActivities", () => ({
  updateExpiredHrActivities: mockUpdateExpiredHrActivities,
}));
jest.mock("../jobs/updateExpiredJobOpenings", () => ({
  updateExpiredJobOpenings: jest.fn(),
}));
jest.mock("../jobs/updateEmployeeStatus", () => ({
  updateEmployeeStatus: jest.fn(),
}));
jest.mock("../jobs/reconcileAttendance", () => ({
  reconcileAttendance: jest.fn(),
}));
jest.mock("../jobs/updateLeaveBalance", () => ({
  updateLeaveBalance: jest.fn(),
}));
jest.mock("../jobs/sendKycReminders", () => ({ sendKycReminders: jest.fn() }));
jest.mock("../jobs/cleanupFcmTokens", () => ({ cleanupFcmTokens: jest.fn() }));
jest.mock("../jobs/checkSubscriptionExpiry", () => ({
  checkSubscriptionExpiry: jest.fn(),
}));
jest.mock("../jobs/checkTicketSla", () => ({
  checkTicketSla: mockCheckTicketSla,
}));
jest.mock("../jobs/retryFailedWebhooks", () => ({
  retryFailedWebhooks: jest.fn(),
}));
jest.mock("../jobs/deliverWebhook", () => ({
  deliverWebhook: mockDeliverWebhook,
}));

import { logger, requestIdStorage } from "@hrms/logger";
import { startSchedulerWorker, startWebhookWorker } from "../worker";

describe("startSchedulerWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorkers = [];
  });

  it("constructs the worker against the schedulerQueue with serial concurrency", () => {
    startSchedulerWorker();
    expect(capturedWorkers).toHaveLength(1);
    expect(capturedWorkers[0].queueName).toBe("schedulerQueue");
    expect(capturedWorkers[0].opts).toMatchObject({
      connection: mockConnection,
      concurrency: 1,
    });
  });

  it("dispatches a known job name to its handler and logs timing", async () => {
    startSchedulerWorker();
    const { processor } = capturedWorkers[0];

    await processor({ data: { jobName: "updateExpiredHrActivities" } });

    expect(mockUpdateExpiredHrActivities).toHaveBeenCalledWith({
      ticketId: undefined,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "Running scheduled job: updateExpiredHrActivities",
    );
  });

  it("passes ticketId through to the handler for jobs that need it", async () => {
    startSchedulerWorker();
    const { processor } = capturedWorkers[0];

    await processor({ data: { jobName: "checkTicketSla", ticketId: "t-42" } });

    expect(mockCheckTicketSla).toHaveBeenCalledWith({ ticketId: "t-42" });
  });

  it("warns and does not throw for an unrecognized job name", async () => {
    startSchedulerWorker();
    const { processor } = capturedWorkers[0];

    await expect(
      processor({ data: { jobName: "notARealJob" } }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      "Unknown scheduler job: notARealJob",
    );
    expect(mockUpdateExpiredHrActivities).not.toHaveBeenCalled();
  });

  it("logs scheduler-level failed/stalled/error events", () => {
    startSchedulerWorker();
    const { handlers } = capturedWorkers[0];

    handlers.failed(
      { id: "j1", data: { jobName: "checkTicketSla" } },
      new Error("boom"),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Scheduler job checkTicketSla failed:",
      { err: expect.any(Error) },
    );

    handlers.stalled("j2");
    expect(logger.warn).toHaveBeenCalledWith("Scheduler job j2 stalled");

    handlers.error(new Error("conn lost"));
    expect(logger.error).toHaveBeenCalledWith("Scheduler worker error:", {
      err: expect.any(Error),
    });
  });

  it("falls back to the job id when a failed job has no data", () => {
    startSchedulerWorker();
    const { handlers } = capturedWorkers[0];

    handlers.failed({ id: "j9" }, new Error("boom"));
    expect(logger.error).toHaveBeenCalledWith("Scheduler job j9 failed:", {
      err: expect.any(Error),
    });
  });

  describe("correlation ID propagation", () => {
    it("runs the job inside the producer's requestId context when present (a manually-triggered job)", async () => {
      startSchedulerWorker();
      const { processor } = capturedWorkers[0];

      await processor({
        data: { jobName: "updateExpiredHrActivities", requestId: "req-1" },
      });

      expect(requestIdStorage.run).toHaveBeenCalledWith(
        "req-1",
        expect.any(Function),
      );
    });

    it("does not touch requestIdStorage for the normal timer-driven case (no requestId)", async () => {
      startSchedulerWorker();
      const { processor } = capturedWorkers[0];

      await processor({ data: { jobName: "updateExpiredHrActivities" } });

      expect(requestIdStorage.run).not.toHaveBeenCalled();
    });
  });
});

describe("startWebhookWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorkers = [];
  });

  it("constructs the worker against the webhookQueue with high concurrency", () => {
    startWebhookWorker();
    expect(capturedWorkers).toHaveLength(1);
    expect(capturedWorkers[0].queueName).toBe("webhookQueue");
    expect(capturedWorkers[0].opts).toMatchObject({
      connection: mockConnection,
      concurrency: 10,
    });
  });

  it("delivers a webhook when deliveryId is present", async () => {
    startWebhookWorker();
    const { processor } = capturedWorkers[0];

    await processor({ id: "j1", data: { deliveryId: "d-1" } });

    expect(mockDeliverWebhook).toHaveBeenCalledWith({ deliveryId: "d-1" });
  });

  it("warns and skips delivery when deliveryId is missing", async () => {
    startWebhookWorker();
    const { processor } = capturedWorkers[0];

    await processor({ id: "j2", data: {} });

    expect(logger.warn).toHaveBeenCalledWith(
      "webhookWorker: job j2 missing deliveryId",
    );
    expect(mockDeliverWebhook).not.toHaveBeenCalled();
  });

  it("forwards an exhausted-retry failure to the dead-letter queue", async () => {
    startWebhookWorker();
    const { handlers } = capturedWorkers[0];

    const job = {
      id: "j3",
      data: { deliveryId: "d-3" },
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    handlers.failed(job, new Error("endpoint unreachable"));

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockDlqAdd).toHaveBeenCalledWith(
      "failed-webhook",
      expect.objectContaining({
        originalQueue: "webhookQueue",
        originalJobId: "j3",
        originalJobData: { deliveryId: "d-3" },
        failureReason: "endpoint unreachable",
      }),
    );
  });

  it("does not forward to the dead-letter queue while retry attempts remain", async () => {
    startWebhookWorker();
    const { handlers } = capturedWorkers[0];

    const job = {
      id: "j4",
      data: { deliveryId: "d-4" },
      attemptsMade: 1,
      opts: { attempts: 3 },
    };
    handlers.failed(job, new Error("timeout"));

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockDlqAdd).not.toHaveBeenCalled();
  });

  it("logs (but does not throw) when forwarding to the dead-letter queue itself fails", async () => {
    mockDlqAdd.mockRejectedValueOnce(new Error("redis down"));
    startWebhookWorker();
    const { handlers } = capturedWorkers[0];

    const job = {
      id: "j5",
      data: { deliveryId: "d-5" },
      attemptsMade: 1,
      opts: { attempts: 1 },
    };
    handlers.failed(job, new Error("endpoint down"));

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith("Failed to forward job to DLQ:", {
      dlqErr: expect.any(Error),
    });
  });

  it("logs webhook-level stalled/error events", () => {
    startWebhookWorker();
    const { handlers } = capturedWorkers[0];

    handlers.stalled("j6");
    expect(logger.warn).toHaveBeenCalledWith("Webhook job j6 stalled");

    handlers.error(new Error("conn lost"));
    expect(logger.error).toHaveBeenCalledWith("Webhook worker error:", {
      err: expect.any(Error),
    });
  });

  describe("correlation ID propagation", () => {
    it("runs the job inside the producer's requestId context when the job carries one", async () => {
      startWebhookWorker();
      const { processor } = capturedWorkers[0];

      await processor({ data: { deliveryId: "d-1", requestId: "req-2" } });

      expect(requestIdStorage.run).toHaveBeenCalledWith(
        "req-2",
        expect.any(Function),
      );
    });

    it("does not touch requestIdStorage when the job carries no requestId", async () => {
      startWebhookWorker();
      const { processor } = capturedWorkers[0];

      await processor({ data: { deliveryId: "d-1" } });

      expect(requestIdStorage.run).not.toHaveBeenCalled();
    });
  });
});
