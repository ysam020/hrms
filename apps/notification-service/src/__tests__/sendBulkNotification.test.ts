import { prisma } from "@hrms/db";
import { sendBulkNotification } from "../handlers/sendBulkNotification";

jest.mock("@hrms/db", () => ({
  prisma: {
    notification: { create: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockCreate = (prisma as any).notification.create as jest.Mock;
const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("sendBulkNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({
      id: "notif-1",
      recipients: [{ userId: "u1" }, { userId: "u2" }],
    });
  });

  it("returns INVALID_ARGUMENT when userIds is empty", async () => {
    const cb = makeCallback();
    await sendBulkNotification(makeCall({ userIds: [] }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates notification with recipients for each userId", async () => {
    const cb = makeCallback();
    await sendBulkNotification(
      makeCall({
        userIds: ["u1", "u2"],
        title: "Test",
        message: "Hello",
        eventType: "general",
        priority: "high",
      }),
      cb,
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Test",
          message: "Hello",
          eventType: "general",
          priority: "high",
          recipients: {
            create: [{ userId: "u1" }, { userId: "u2" }],
          },
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("uses default eventType and priority when not provided", async () => {
    const cb = makeCallback();
    await sendBulkNotification(makeCall({ userIds: ["u1"] }), cb);
    const createArgs = mockCreate.mock.calls[0][0].data;
    expect(createArgs.eventType).toBe("general");
    expect(createArgs.priority).toBe("medium");
  });

  it("returns INTERNAL on database error", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await sendBulkNotification(makeCall({ userIds: ["u1"] }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
