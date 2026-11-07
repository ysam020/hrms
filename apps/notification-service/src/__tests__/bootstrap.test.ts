/**
 * Startup must not replay failed notification jobs: it used to call
 * retryJobs({ state: "failed" }) on every start, re-delivering stale
 * notifications and adding a dead-letter entry per restart.
 */
const mockRetryJobs = jest.fn();
const mockGetFailedCount = jest.fn().mockResolvedValue(12);
const mockQueue = () => ({
  retryJobs: mockRetryJobs,
  getFailedCount: mockGetFailedCount,
});

const mockCloseWorker = jest.fn().mockResolvedValue(undefined);
const mockCloseQueues = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  NOTIFICATION_QUEUE_NAME: "notificationQueueV2",
  LEGACY_NOTIFICATION_QUEUE_NAME: "notificationQueue",
  getNotificationQueue: jest.fn(mockQueue),
  getLegacyNotificationQueue: jest.fn(mockQueue),
  closeWorker: mockCloseWorker,
  closeQueues: mockCloseQueues,
}));

const mockCloseWebSocketRedis = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/websocket", () => ({
  closeWebSocketRedisConnections: mockCloseWebSocketRedis,
}));

// Captures the shutdown steps bootstrap registers on the process coordinator.
const mockShutdownSteps: Array<{
  name: string;
  step: (ms: number) => Promise<unknown>;
  phase: string;
}> = [];
jest.mock("@hrms/common", () => ({
  loadSecrets: jest.fn().mockResolvedValue(undefined),
  validateEnv: jest.fn(),
  processShutdown: jest.fn(() => ({
    onShutdown: (
      name: string,
      step: (ms: number) => Promise<unknown>,
      phase = "drain",
    ) => mockShutdownSteps.push({ name, step, phase }),
    shutdown: jest.fn(),
    isShuttingDown: () => false,
  })),
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock("@hrms/logger", () => ({ logger: mockLogger }));

jest.mock("../envSchema", () => ({ envSchema: {} }));
jest.mock("../migrations/migrateNotificationRecipients", () => ({
  migrateNotificationRecipients: jest.fn().mockResolvedValue(undefined),
}));
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockStartNotificationWorker = jest.fn(() => [
  { close: mockWorkerClose },
  { close: mockWorkerClose },
]);
jest.mock("../workers/notificationWorker", () => ({
  startNotificationWorker: mockStartNotificationWorker,
}));
jest.mock("../workers/emailWorker", () => ({
  startEmailWorker: jest.fn(() => ({ close: mockWorkerClose })),
}));
jest.mock("../server", () => ({}));

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("notification-service startup", () => {
  it("reports retained failed jobs on both queues but replays none of them", async () => {
    process.env.WEB_CONCURRENCY = "1";
    jest.isolateModules(() => {
      require("../bootstrap");
    });
    for (let i = 0; i < 10; i++) await flush();

    expect(mockStartNotificationWorker).toHaveBeenCalled();
    expect(mockGetFailedCount).toHaveBeenCalledTimes(2);
    expect(mockRetryJobs).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "notificationQueue: 12 failed notification job(s) retained",
      ),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("notificationQueueV2: 12 failed"),
    );

    // SIGTERM drains the email worker and both notification-queue workers
    // first, then closes the queues and websocket Redis they used.
    expect(
      mockShutdownSteps.map(({ name, phase }) => `${phase}:${name}`),
    ).toEqual([
      "drain:BullMQ workers",
      "cleanup:queues",
      "cleanup:websocket redis",
    ]);
    await mockShutdownSteps[0].step(5000);
    expect(mockCloseWorker).toHaveBeenCalledTimes(3);
    expect(mockCloseWorker).toHaveBeenCalledWith(
      expect.objectContaining({ close: mockWorkerClose }),
      5000,
    );
    await mockShutdownSteps[1].step(1000);
    await mockShutdownSteps[2].step(1000);
    expect(mockCloseQueues).toHaveBeenCalled();
    expect(mockCloseWebSocketRedis).toHaveBeenCalled();
  });
});
