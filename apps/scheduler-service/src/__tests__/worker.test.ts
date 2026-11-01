const mockConnection = { host: "mock-redis" };
const mockDlqAdd = jest.fn().mockResolvedValue(undefined);

jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => mockConnection),
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

const mockAcquireJobLease = jest.fn().mockResolvedValue(true);
const mockReleaseJobLease = jest.fn().mockResolvedValue(undefined);
jest.mock("../utils/jobLease", () => ({
  acquireJobLease: (...a: any[]) => mockAcquireJobLease(...a),
  releaseJobLease: (...a: any[]) => mockReleaseJobLease(...a),
  leaseIdFor: (job: string) => `${job}:period`,
}));

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
const mockUpdateLeaveBalance = jest.fn().mockResolvedValue(undefined);
jest.mock("../jobs/updateLeaveBalance", () => ({
  updateLeaveBalance: (...a: any[]) => mockUpdateLeaveBalance(...a),
}));
jest.mock("../jobs/sendKycReminders", () => ({ sendKycReminders: jest.fn() }));
jest.mock("../jobs/cleanupFcmTokens", () => ({ cleanupFcmTokens: jest.fn() }));
jest.mock("../jobs/checkSubscriptionExpiry", () => ({
  checkSubscriptionExpiry: jest.fn(),
}));
jest.mock("../jobs/checkTicketSla", () => ({
  checkTicketSla: mockCheckTicketSla,
}));

import { logger, requestIdStorage } from "@hrms/logger";
import { startSchedulerWorker } from "../worker";

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

describe("startSchedulerWorker — run lease", () => {
  beforeEach(() => {
    capturedWorkers = [];
    jest.clearAllMocks();
    mockAcquireJobLease.mockResolvedValue(true);
  });

  it("skips the job when another scheduler already holds the period's lease", async () => {
    mockAcquireJobLease.mockResolvedValueOnce(false);
    startSchedulerWorker();
    await capturedWorkers[0].processor({
      data: { jobName: "updateLeaveBalance" },
      timestamp: 0,
    });
    expect(mockUpdateLeaveBalance).not.toHaveBeenCalled();
    expect(mockReleaseJobLease).not.toHaveBeenCalled();
  });

  it("marks the lease done after a successful run", async () => {
    startSchedulerWorker();
    await capturedWorkers[0].processor({
      data: { jobName: "updateLeaveBalance" },
      timestamp: 0,
    });
    expect(mockUpdateLeaveBalance).toHaveBeenCalled();
    expect(mockReleaseJobLease).toHaveBeenCalledWith(
      "updateLeaveBalance:period",
      "done",
    );
  });

  it("marks the lease failed and rethrows when the job fails, so a retry can claim it", async () => {
    mockUpdateLeaveBalance.mockRejectedValueOnce(new Error("partial failure"));
    startSchedulerWorker();
    await expect(
      capturedWorkers[0].processor({
        data: { jobName: "updateLeaveBalance" },
        timestamp: 0,
      }),
    ).rejects.toThrow("partial failure");
    expect(mockReleaseJobLease).toHaveBeenCalledWith(
      "updateLeaveBalance:period",
      "failed",
      "partial failure",
    );
  });

  it("does not lease ad-hoc per-ticket SLA checks", async () => {
    startSchedulerWorker();
    await capturedWorkers[0].processor({
      data: { jobName: "checkTicketSla", ticketId: "t-1" },
    });
    expect(mockAcquireJobLease).not.toHaveBeenCalled();
  });
});
