const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = new Date("2026-11-07T10:00:00Z");
const HOUR = 60 * 60 * 1000;

interface FakeJob {
  id: string;
  data: any;
  timestamp: number;
  state: string;
  retry: jest.Mock;
  getState: () => Promise<string>;
}

const jobsByQueue: Record<string, Map<string, FakeJob>> = {
  notificationQueueV2: new Map(),
  notificationQueue: new Map(),
};
const mockRetryJobs = jest.fn();
const fakeQueue = (name: string) => ({
  name,
  getJob: jest.fn(async (id: string) => jobsByQueue[name].get(id)),
  retryJobs: mockRetryJobs,
  getFailedCount: jest.fn(async () => jobsByQueue[name].size),
});
const mockQueues: Record<string, any> = {};

jest.mock("@hrms/queue", () => ({
  NOTIFICATION_QUEUE_NAME: "notificationQueueV2",
  LEGACY_NOTIFICATION_QUEUE_NAME: "notificationQueue",
  getNotificationQueue: () =>
    (mockQueues.v2 ??= fakeQueue("notificationQueueV2")),
  getLegacyNotificationQueue: () =>
    (mockQueues.legacy ??= fakeQueue("notificationQueue")),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  replayFailedNotificationJobs,
  reportFailedNotificationJobs,
  MAX_REPLAY_JOBS,
} from "../workers/failedNotificationJobs";

function addJob(
  queue: string,
  id: string,
  data: any,
  { state = "failed", ageMs = HOUR } = {},
): FakeJob {
  const job: FakeJob = {
    id,
    data,
    timestamp: NOW.getTime() - ageMs,
    state,
    retry: jest.fn().mockResolvedValue(undefined),
    getState: async () => job.state,
  };
  jobsByQueue[queue].set(id, job);
  return job;
}

const replay = (overrides: Record<string, unknown> = {}) =>
  replayFailedNotificationJobs({
    queueName: "notificationQueue",
    tenantId: TENANT_A,
    jobIds: [],
    now: NOW,
    ...overrides,
  } as any);

describe("failed notification jobs", () => {
  beforeEach(() => {
    jobsByQueue.notificationQueueV2.clear();
    jobsByQueue.notificationQueue.clear();
    jest.clearAllMocks();
  });

  it("the startup report never re-queues anything", async () => {
    addJob("notificationQueue", "1", { tenantId: TENANT_A, recipients: ["u"] });
    await reportFailedNotificationJobs();
    expect(mockRetryJobs).not.toHaveBeenCalled();
    expect(
      jobsByQueue.notificationQueue.get("1")!.retry,
    ).not.toHaveBeenCalled();
  });

  it("replays an explicitly selected failed job of the tenant, resetting its attempts", async () => {
    const job = addJob("notificationQueue", "7", {
      tenantId: TENANT_A,
      recipients: ["a00000000000000000000001"],
    });
    const result = await replay({ jobIds: ["7"], execute: true });
    expect(result).toEqual([{ jobId: "7", outcome: "replayed" }]);
    expect(job.retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
    });
  });

  it("is a dry run unless execute is set", async () => {
    const job = addJob("notificationQueue", "7", {
      tenantId: TENANT_A,
      recipients: ["u"],
    });
    expect(await replay({ jobIds: ["7"] })).toEqual([
      { jobId: "7", outcome: "would-replay" },
    ]);
    expect(job.retry).not.toHaveBeenCalled();
  });

  it("refuses another tenant's job", async () => {
    const job = addJob("notificationQueue", "8", {
      tenantId: TENANT_B,
      recipients: ["u"],
    });
    const [decision] = await replay({ jobIds: ["8"], execute: true });
    expect(decision).toMatchObject({
      outcome: "refused",
      reason: "job does not belong to the selected tenant",
    });
    expect(job.retry).not.toHaveBeenCalled();
  });

  it("never replays a platform broadcast, even an authorized one", async () => {
    const job = addJob("notificationQueue", "9", {
      tenantId: TENANT_A,
      broadcast: { scope: "platform", authorizedBy: "ops", reason: "x" },
    });
    const [decision] = await replay({ jobIds: ["9"], execute: true });
    expect(decision).toMatchObject({
      outcome: "refused",
      reason: "platform broadcasts are never replayed",
    });
    expect(job.retry).not.toHaveBeenCalled();
  });

  it("refuses a job that names no recipients (it would have meant 'everyone' to the old worker)", async () => {
    const job = addJob("notificationQueue", "10", { tenantId: TENANT_A });
    const [decision] = await replay({ jobIds: ["10"], execute: true });
    expect(decision).toMatchObject({ outcome: "refused" });
    expect(job.retry).not.toHaveBeenCalled();
  });

  it("refuses stale, non-failed and unknown jobs", async () => {
    addJob(
      "notificationQueue",
      "old",
      { tenantId: TENANT_A, recipients: ["u"] },
      { ageMs: 8 * 24 * HOUR },
    );
    addJob(
      "notificationQueue",
      "done",
      { tenantId: TENANT_A, recipients: ["u"] },
      { state: "completed" },
    );
    const result = await replay({
      jobIds: ["old", "done", "missing"],
      execute: true,
    });
    expect(result.map((d) => d.outcome)).toEqual([
      "refused",
      "refused",
      "refused",
    ]);
    expect(result.map((d) => d.reason)).toEqual([
      "job is older than 7 day(s)",
      "job is not in the failed state",
      "job not found",
    ]);
  });

  it("looks only in the named queue", async () => {
    addJob("notificationQueueV2", "11", {
      tenantId: TENANT_A,
      recipients: ["u"],
    });
    const [decision] = await replay({ jobIds: ["11"], execute: true });
    expect(decision).toMatchObject({
      outcome: "refused",
      reason: "job not found",
    });
  });

  it("requires a deliberate selection: no empty list, no oversized batch, a valid tenant and a known queue", async () => {
    await expect(replay({ jobIds: [] })).rejects.toThrow(/no replay-all/);
    await expect(
      replay({
        jobIds: Array.from({ length: MAX_REPLAY_JOBS + 1 }, (_, i) => `${i}`),
      }),
    ).rejects.toThrow(/Refusing to replay/);
    await expect(replay({ jobIds: ["1"], tenantId: "nope" })).rejects.toThrow(
      /valid tenantId/,
    );
    await expect(
      replay({ jobIds: ["1"], queueName: "deadLetterQueue" }),
    ).rejects.toThrow(/Unknown notification queue/);
  });
});
