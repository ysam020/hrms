const mockNotificationAdd = jest.fn();
const mockEmailAdd = jest.fn();

// Job data is sealed before it reaches Redis. These assertions are about
// what the job carries, so the queue mock records the opened payload; the
// sealing itself is checked at the end of this file.
const mockRawAdds: unknown[][] = [];
const opened = (data: any) => {
  const { openTransient } = jest.requireActual("@hrms/crypto");
  return data?.sealed
    ? { ...data, ...openTransient(data.sealed), sealed: undefined }
    : data;
};
jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(() => ({
    add: (name: string, data: any, opts: any) => (
      mockRawAdds.push([name, data, opts]),
      mockNotificationAdd(name, opened(data), opts)
    ),
  })),
  getEmailQueue: jest.fn(() => ({
    add: (name: string, data: any, opts?: any) => (
      mockRawAdds.push([name, data, opts]),
      opts === undefined
        ? mockEmailAdd(name, opened(data))
        : mockEmailAdd(name, opened(data), opts)
    ),
  })),
}));

import { notify } from "../notify";

describe("notify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationAdd.mockResolvedValue({ id: "job-in-app" });
    mockEmailAdd.mockResolvedValue({ id: "job-email" });
  });

  it("enqueues only on notificationQueue when only inApp is given", async () => {
    await notify({
      tenantId: "t1",
      event: "leaveApproved",
      recipients: ["u1"],
      inApp: {
        title: "Leave",
        message: "Your leave was approved",
        eventType: "leave_notification",
      },
    });

    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({
        tenantId: "t1",
        title: "Leave",
        message: "Your leave was approved",
        recipients: ["u1"],
        eventType: "leave_notification",
        sendPushNotification: true,
      }),
      { jobId: expect.any(String) },
    );
    expect(mockEmailAdd).not.toHaveBeenCalled();
  });

  it("enqueues only on emailQueue when only email is given", async () => {
    await notify({
      tenantId: "t1",
      event: "leaveApproved",
      email: {
        to: "jordan@example.com",
        subject: "Leave approved",
        html: "<p>hi</p>",
        from: '"Acme Corp" <hr@praesto.in>',
      },
    });

    expect(mockNotificationAdd).not.toHaveBeenCalled();
    expect(mockEmailAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({
        to: "jordan@example.com",
        subject: "Leave approved",
        html: "<p>hi</p>",
        from: '"Acme Corp" <hr@praesto.in>',
      }),
    );
  });

  it("enqueues one email job per address when to is an array, matching every handler's own broadcast loop today", async () => {
    await notify({
      tenantId: "t1",
      event: "wfhRequested",
      email: {
        to: ["hr-a@acme.example", "hr-b@acme.example"],
        subject: "WFH request",
        html: "<p>hi</p>",
        from: '"Acme Corp" <hr@praesto.in>',
      },
    });

    expect(mockEmailAdd).toHaveBeenCalledTimes(2);
    expect(mockEmailAdd).toHaveBeenCalledWith(
      "wfhRequested",
      expect.objectContaining({ to: "hr-a@acme.example" }),
    );
    expect(mockEmailAdd).toHaveBeenCalledWith(
      "wfhRequested",
      expect.objectContaining({ to: "hr-b@acme.example" }),
    );
  });

  it("passes sendPushNotification: false when push.enabled is explicitly false", async () => {
    await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "Leave", message: "hi", eventType: "leave_notification" },
      push: { enabled: false },
    });

    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({ sendPushNotification: false }),
      { jobId: expect.any(String) },
    );
  });

  it("threads silent/socketEvent/socketPayload through to the in-app job unchanged", async () => {
    await notify({
      tenantId: "t1",
      event: "leaveApplied",
      pushTargets: ["hr1"],
      inApp: {
        title: "Leave",
        message: "hi",
        eventType: "leave_notification",
        silent: true,
        socketEvent: "leaveApplied",
        socketPayload: { foo: "bar" },
      },
    });

    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveApplied",
      expect.objectContaining({
        silent: true,
        socketEvent: "leaveApplied",
        socketPayload: { foo: "bar" },
        pushTargets: ["hr1"],
      }),
      { jobId: expect.any(String) },
    );
  });

  it("uses eventType (the frontend's grouping category) rather than the specific event name for the job's eventType field", async () => {
    await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "x", message: "y", eventType: "leave_notification" },
    });

    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({ eventType: "leave_notification" }),
      { jobId: expect.any(String) },
    );
  });

  it("mints a fresh notificationId per call and includes it in the in-app job's metadata", async () => {
    const a = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "x", message: "y", eventType: "leave_notification" },
    });
    const b = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "x", message: "y", eventType: "leave_notification" },
    });

    expect(a.notificationId).not.toBe(b.notificationId);
    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({
        metadata: expect.objectContaining({ notificationId: a.notificationId }),
      }),
      { jobId: expect.any(String) },
    );
  });

  it("merges caller-supplied metadata with the minted notificationId rather than overwriting it", async () => {
    const result = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "x", message: "y", eventType: "leave_notification" },
      metadata: { source: "manual-hr-action" },
    });

    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({
        metadata: {
          source: "manual-hr-action",
          notificationId: result.notificationId,
        },
      }),
      { jobId: expect.any(String) },
    );
  });

  it("returns the enqueued job ids for both channels", async () => {
    const result = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "x", message: "y", eventType: "leave_notification" },
      email: {
        to: "a@example.com",
        subject: "s",
        html: "<p>h</p>",
        from: "f",
      },
    });

    expect(result.jobIds.inApp).toBe("job-in-app");
    expect(result.jobIds.email).toEqual(["job-email"]);
  });

  it("uses the notification id as the BullMQ job id (the worker's idempotency key)", async () => {
    const result = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      recipients: ["u1"],
      inApp: { title: "Leave", message: "approved", eventType: "leave" },
    });
    const second = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      recipients: ["u1"],
      inApp: { title: "Leave", message: "approved", eventType: "leave" },
    });

    const ids = mockNotificationAdd.mock.calls.map(([, , opts]) => opts.jobId);
    expect(ids).toEqual([result.notificationId, second.notificationId]);
    expect(ids[0]).not.toBe(ids[1]);
    // BullMQ rejects custom ids that are integers or contain ":".
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not throw when a mocked queue resolves .add() to undefined (common in existing handler tests)", async () => {
    mockNotificationAdd.mockResolvedValue(undefined);
    mockEmailAdd.mockResolvedValue(undefined);

    const result = await notify({
      tenantId: "t1",
      event: "leaveApproved",
      inApp: { title: "x", message: "y", eventType: "leave_notification" },
      email: { to: "a@example.com", subject: "s", html: "<p/>", from: "f" },
    });

    expect(result.jobIds.inApp).toBeUndefined();
    expect(result.jobIds.email).toEqual([]);
  });

  it("enqueues neither queue when neither inApp nor email is given", async () => {
    const result = await notify({ tenantId: "t1", event: "leaveApproved" });

    expect(mockNotificationAdd).not.toHaveBeenCalled();
    expect(mockEmailAdd).not.toHaveBeenCalled();
    expect(result.jobIds).toEqual({});
  });
});

describe("job data at rest", () => {
  it("seals in-app and email job content when a key is configured", async () => {
    const prev = process.env.CRYPTO_ENCRYPTION_KEY;
    process.env.CRYPTO_ENCRYPTION_KEY = "c".repeat(64);
    mockRawAdds.length = 0;
    try {
      await notify({
        tenantId: "t1",
        event: "x",
        recipients: ["u1"],
        inApp: {
          title: "Asha's leave",
          message: "Asha Rao applied",
          eventType: "leave_notification",
        },
        email: {
          to: "asha@example.test",
          subject: "Leave",
          html: "<p>Asha Rao</p>",
          from: "hr@x.test",
        },
      } as any);
      const stored = JSON.stringify(mockRawAdds);
      expect(stored).not.toContain("Asha");
      expect(stored).not.toContain("asha@example.test");
      expect(stored).toContain('"tenantId":"t1"');
      expect((mockRawAdds[0][1] as any).sealed).toMatch(/^t1:/);
    } finally {
      process.env.CRYPTO_ENCRYPTION_KEY = prev;
    }
  });
});
