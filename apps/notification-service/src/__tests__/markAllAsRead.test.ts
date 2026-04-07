import { prisma } from "@hrms/db";
import { markAllAsRead } from "../handlers/markAllAsRead";

jest.mock("@hrms/db", () => ({
  prisma: {
    notificationRecipient: { updateMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateMany = (prisma as any).notificationRecipient
  .updateMany as jest.Mock;
const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("markAllAsRead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 5 });
  });

  it("marks all uncleared notifications for user as cleared", async () => {
    const cb = makeCallback();
    await markAllAsRead(makeCall({ userId: "u1" }), cb);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", isCleared: false },
      data: { isCleared: true },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockUpdateMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await markAllAsRead(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
