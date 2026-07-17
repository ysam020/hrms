import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import {
  getEmailQueue,
  getNotificationQueue,
  getResumeParsingQueue,
  getSchedulerQueue,
  getDeadLetterQueue,
  getWebhookQueue,
} from "../queues";

jest.mock("bullmq", () => ({
  Queue: jest
    .fn()
    .mockImplementation((name: string, opts: any) => ({ name, opts })),
}));

jest.mock("../connection", () => ({
  getBullMQConnection: jest.fn(() => ({ __conn: true })),
}));

const MockQueue = Queue as unknown as jest.Mock;

describe("queue singletons", () => {
  beforeEach(() => {
    MockQueue.mockClear();
    (getBullMQConnection as jest.Mock).mockClear();
  });

  it.each([
    ["getEmailQueue", getEmailQueue, "emailQueue"],
    ["getNotificationQueue", getNotificationQueue, "notificationQueue"],
    ["getResumeParsingQueue", getResumeParsingQueue, "resumeParsingQueue"],
    ["getSchedulerQueue", getSchedulerQueue, "schedulerQueue"],
    ["getDeadLetterQueue", getDeadLetterQueue, "deadLetterQueue"],
    ["getWebhookQueue", getWebhookQueue, "webhookQueue"],
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
});
