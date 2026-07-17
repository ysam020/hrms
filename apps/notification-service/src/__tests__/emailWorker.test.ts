const mockDlqAdd = jest.fn().mockResolvedValue(undefined);

jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => ({})),
  getDeadLetterQueue: jest.fn(() => ({ add: mockDlqAdd })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@hrms/common", () => ({
  sendEmail: jest.fn(),
}));

let capturedProcessor: (job: any) => Promise<any>;
let capturedHandlers: Record<string, (...args: any[]) => void>;

jest.mock("bullmq", () => ({
  Worker: jest
    .fn()
    .mockImplementation((_name: string, processor: any, opts: any) => {
      capturedProcessor = processor;
      capturedHandlers = {};
      return {
        __opts: opts,
        on: jest.fn((event: string, handler: any) => {
          capturedHandlers[event] = handler;
        }),
      };
    }),
}));

import { logger } from "@hrms/logger";
import { sendEmail } from "@hrms/common";
import { startEmailWorker } from "../workers/emailWorker";

describe("startEmailWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sendEmail as jest.Mock).mockResolvedValue(undefined);
  });

  it("constructs the worker against emailQueue with concurrency 5", () => {
    const worker = startEmailWorker();
    expect((worker as any).__opts).toMatchObject({ concurrency: 5 });
  });

  it("sends the email and logs success", async () => {
    startEmailWorker();
    await capturedProcessor({
      id: "j1",
      data: { to: "a@b.com", subject: "Hi", html: "<p>hi</p>" },
    });

    expect(sendEmail).toHaveBeenCalledWith({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      from: undefined,
    });
    expect(logger.info).toHaveBeenCalledWith("Email sent to a@b.com", {
      jobId: "j1",
    });
  });

  it("propagates a sendEmail failure so BullMQ can retry the job", async () => {
    (sendEmail as jest.Mock).mockRejectedValue(new Error("SMTP down"));
    startEmailWorker();

    await expect(
      capturedProcessor({
        id: "j1",
        data: { to: "a@b.com", subject: "Hi", html: "x" },
      }),
    ).rejects.toThrow("SMTP down");
  });

  it("forwards an exhausted-retry failure to the dead-letter queue", async () => {
    startEmailWorker();
    const job = {
      id: "j1",
      data: { to: "a@b.com" },
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    capturedHandlers.failed(job, new Error("SMTP down"));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockDlqAdd).toHaveBeenCalledWith(
      "failed-email",
      expect.objectContaining({
        originalQueue: "emailQueue",
        originalJobId: "j1",
        failureReason: "SMTP down",
      }),
    );
  });

  it("does not forward to the DLQ while retry attempts remain", async () => {
    startEmailWorker();
    const job = {
      id: "j2",
      data: { to: "a@b.com" },
      attemptsMade: 1,
      opts: { attempts: 3 },
    };
    capturedHandlers.failed(job, new Error("transient"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockDlqAdd).not.toHaveBeenCalled();
  });

  it("logs (but does not throw) when the DLQ enqueue itself fails", async () => {
    mockDlqAdd.mockRejectedValueOnce(new Error("redis down"));
    startEmailWorker();
    const job = {
      id: "j3",
      data: { to: "a@b.com" },
      attemptsMade: 1,
      opts: { attempts: 1 },
    };
    capturedHandlers.failed(job, new Error("SMTP down"));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith("Failed to forward job to DLQ:", {
      dlqErr: expect.any(Error),
    });
  });

  it("logs worker-level errors", () => {
    startEmailWorker();
    capturedHandlers.error(new Error("conn lost"));
    expect(logger.error).toHaveBeenCalledWith("Email worker error:", {
      err: expect.any(Error),
    });
  });
});
