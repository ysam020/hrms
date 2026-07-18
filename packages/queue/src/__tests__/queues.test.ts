import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import {
  getEmailQueue,
  getNotificationQueue,
  getResumeParsingQueue,
  getSchedulerQueue,
  getDeadLetterQueue,
  getWebhookQueue,
  getPayrollDisbursementQueue,
} from "../queues";

// Captures each constructed queue's underlying `add` mock, from before
// queues.ts wraps it (getNotificationQueue reassigns `.add` on the instance)
// — the "mock" name prefix is required so Jest's module-factory hoisting
// allows referencing it from inside jest.mock().
const mockRawAddFns: jest.Mock[] = [];
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string, opts: any) => {
    const addFn = jest.fn().mockResolvedValue({ id: "job-1" });
    mockRawAddFns.push(addFn);
    return { name, opts, add: addFn };
  }),
}));

jest.mock("../connection", () => ({
  getBullMQConnection: jest.fn(() => ({ __conn: true })),
}));

jest.mock("@hrms/logger", () => ({
  getRequestId: jest.fn(() => undefined),
}));

const MockQueue = Queue as unknown as jest.Mock;

describe("queue singletons", () => {
  beforeEach(() => {
    MockQueue.mockClear();
    (getBullMQConnection as jest.Mock).mockClear();
    mockRawAddFns.length = 0;
  });

  it.each([
    ["getEmailQueue", getEmailQueue, "emailQueue"],
    ["getNotificationQueue", getNotificationQueue, "notificationQueue"],
    ["getResumeParsingQueue", getResumeParsingQueue, "resumeParsingQueue"],
    ["getSchedulerQueue", getSchedulerQueue, "schedulerQueue"],
    ["getDeadLetterQueue", getDeadLetterQueue, "deadLetterQueue"],
    ["getWebhookQueue", getWebhookQueue, "webhookQueue"],
    [
      "getPayrollDisbursementQueue",
      getPayrollDisbursementQueue,
      "payrollDisbursementQueue",
    ],
  ])("%s creates a Queue named %s", (_label, getter, expectedName) => {
    const q = getter() as any;
    expect(q.name).toBe(expectedName);
  });

  it("memoizes each queue — repeated calls return the same instance without re-constructing", () => {
    // Uses its own isolated module registry so this test isn't affected by
    // other tests in this file having already warmed queues.ts's
    // module-level singleton cache (which persists for the file's lifetime
    // otherwise, since Jest only loads a module once per test file).
    jest.isolateModules(() => {
      const { getEmailQueue: freshGetEmailQueue } = require("../queues");
      const a = freshGetEmailQueue();
      const b = freshGetEmailQueue();
      expect(a).toBe(b);
      expect(MockQueue).toHaveBeenCalledTimes(1);
    });
  });

  it("gives resumeParsingQueue only 2 retry attempts (parsing is expensive/slow to retry)", () => {
    const q = getResumeParsingQueue() as any;
    expect(q.opts.defaultJobOptions.attempts).toBe(2);
  });

  it("gives schedulerQueue exactly 1 attempt (cron jobs rely on the next scheduled run, not auto-retry)", () => {
    const q = getSchedulerQueue() as any;
    expect(q.opts.defaultJobOptions.attempts).toBe(1);
  });

  it("keeps deadLetterQueue's failed jobs (removeOnFail: false) so nothing is silently discarded", () => {
    const q = getDeadLetterQueue() as any;
    expect(q.opts.defaultJobOptions.removeOnFail).toBe(false);
    expect(q.opts.defaultJobOptions.removeOnComplete).toBe(500);
  });

  it("gives webhookQueue 3 attempts with a 5s exponential backoff, distinct from the default queues' options", () => {
    const q = getWebhookQueue() as any;
    expect(q.opts.defaultJobOptions).toEqual({
      removeOnComplete: 200,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
  });

  it("gives the standard queues (email/notification) 3 attempts with a 2s exponential backoff by default", () => {
    const q = getEmailQueue() as any;
    expect(q.opts.defaultJobOptions).toEqual({
      removeOnComplete: 100,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
  });

  it("gives payrollDisbursementQueue only 2 attempts with a 10s exponential backoff — further retries go through the explicit retry-payouts endpoint, not silent backoff", () => {
    const q = getPayrollDisbursementQueue() as any;
    expect(q.opts.defaultJobOptions).toEqual({
      removeOnComplete: 100,
      removeOnFail: false,
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
    });
  });

  it("wires every queue to the shared BullMQ connection config", () => {
    // Isolated module registry — see the memoization test above for why.
    jest.isolateModules(() => {
      const { getNotificationQueue: fresh } = require("../queues");
      fresh();
      expect(getBullMQConnection).toHaveBeenCalled();
      const q = MockQueue.mock.calls[0][1];
      expect(q.connection).toEqual({ __conn: true });
    });
  });

  describe("getNotificationQueue — correlation ID auto-injection", () => {
    it("injects the ambient requestId from getRequestId() into job data when the caller didn't pass one", async () => {
      const { getRequestId } = require("@hrms/logger");
      (getRequestId as jest.Mock).mockReturnValue("ambient-req-id");

      jest.isolateModules(() => {
        const { getNotificationQueue: fresh } = require("../queues");
        const q: any = fresh();
        const rawAdd = q.add; // already the wrapped version returned by the getter
        rawAdd("send", { tenantId: "t1", title: "x", message: "y" });

        // Inspect via the underlying mock captured at construction time
        // (queues.ts reassigns `.add` on the instance, so the object's
        // current `.add` is the wrapper, not the raw BullMQ mock).
        expect(mockRawAddFns[0]).toHaveBeenCalledWith(
          "send",
          expect.objectContaining({ requestId: "ambient-req-id" }),
          undefined,
        );
      });
    });

    it("does not override an explicit requestId already present on the job data", () => {
      const { getRequestId } = require("@hrms/logger");
      (getRequestId as jest.Mock).mockReturnValue("ambient-req-id");

      jest.isolateModules(() => {
        const { getNotificationQueue: fresh } = require("../queues");
        const q: any = fresh();
        q.add("send", {
          tenantId: "t1",
          title: "x",
          message: "y",
          requestId: "explicit-id",
        });

        expect(mockRawAddFns[0]).toHaveBeenCalledWith(
          "send",
          expect.objectContaining({ requestId: "explicit-id" }),
          undefined,
        );
      });
    });

    it("leaves job data untouched when there is no ambient requestId at all", () => {
      const { getRequestId } = require("@hrms/logger");
      (getRequestId as jest.Mock).mockReturnValue(undefined);

      jest.isolateModules(() => {
        const { getNotificationQueue: fresh } = require("../queues");
        const q: any = fresh();
        const data = { tenantId: "t1", title: "x", message: "y" };
        q.add("send", data);

        expect(mockRawAddFns[0]).toHaveBeenCalledWith("send", data, undefined);
      });
    });
  });

  describe("getPayrollDisbursementQueue — correlation ID auto-injection", () => {
    it("also injects the ambient requestId (shared wrapAddWithRequestId helper)", () => {
      const { getRequestId } = require("@hrms/logger");
      (getRequestId as jest.Mock).mockReturnValue("ambient-req-id");

      jest.isolateModules(() => {
        const { getPayrollDisbursementQueue: fresh } = require("../queues");
        const q: any = fresh();
        q.add("disburse", { tenantId: "t1", runId: "r1", disbursedBy: "u1" });

        expect(mockRawAddFns[0]).toHaveBeenCalledWith(
          "disburse",
          expect.objectContaining({ requestId: "ambient-req-id" }),
          undefined,
        );
      });
    });
  });
});
