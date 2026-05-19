import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { sendNotification } from "../handlers/sendNotification";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    notification: { create: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

// Dynamic import of @hrms/firebase is inside the handler — mock the module
jest.mock("@hrms/firebase", () => ({
  sendPushNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockCreate = (prisma as any).notification.create as jest.Mock;

describe("sendNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await sendNotification(makeCall({ title: "Hello" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates notification with correct data on happy path", async () => {
    const notification = {
      id: "notif-1",
      title: "Test",
      message: "Test message",
      eventType: "general",
      priority: "medium",
      recipients: [{ userId: "user-1" }],
    };
    mockCreate.mockResolvedValue(notification);

    const cb = makeCallback();
    await sendNotification(
      makeCall({
        userId: "user-1",
        title: "Test",
        message: "Test message",
        eventType: "leave_notification",
        priority: "high",
      }),
      cb,
    );

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        title: "Test",
        message: "Test message",
        eventType: "leave_notification",
        priority: "high",
        recipients: { create: { tenantId: "t1", userId: "user-1" } },
      },
      include: { recipients: true },
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NOTIFICATION_SENT,
      status: status.OK,
      data: notification,
    });
  });

  it("defaults eventType to 'general' and priority to 'medium' when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "notif-1", recipients: [] });

    await sendNotification(
      makeCall({ userId: "user-1", title: "Hi" }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "general",
          priority: "medium",
        }),
      }),
    );
  });

  it("sets title and message to null when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "notif-1", recipients: [] });

    await sendNotification(makeCall({ userId: "user-1" }), makeCallback());

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: null, message: null }),
      }),
    );
  });

  it("still returns OK even when FCM push notification fails", async () => {
    mockCreate.mockResolvedValue({ id: "notif-1", recipients: [] });

    // Mock the dynamic import to throw
    jest.doMock("@hrms/firebase", () => ({
      sendPushNotifications: jest
        .fn()
        .mockRejectedValue(new Error("FCM error")),
    }));

    const cb = makeCallback();
    await sendNotification(makeCall({ userId: "user-1", title: "Test" }), cb);

    // Should still return OK since FCM is non-fatal
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await sendNotification(makeCall({ userId: "user-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: null,
    });
  });
});
