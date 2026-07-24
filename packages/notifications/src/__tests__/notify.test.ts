const mockNotificationAdd = jest.fn();
const mockEmailAdd = jest.fn();

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(() => ({ add: mockNotificationAdd })),
  getEmailQueue: jest.fn(() => ({ add: mockEmailAdd })),
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
        from: '"Acme Corp" <hr@praesto.cloud>',
      },
    });

    expect(mockNotificationAdd).not.toHaveBeenCalled();
    expect(mockEmailAdd).toHaveBeenCalledWith(
      "leaveApproved",
      expect.objectContaining({
        to: "jordan@example.com",
        subject: "Leave approved",
        html: "<p>hi</p>",
        from: '"Acme Corp" <hr@praesto.cloud>',
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
        from: '"Acme Corp" <hr@praesto.cloud>',
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
