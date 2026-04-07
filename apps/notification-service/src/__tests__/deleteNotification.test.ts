import { prisma } from "@hrms/db";
import { deleteNotification } from "../handlers/deleteNotification";

jest.mock("@hrms/db", () => ({
  prisma: {
    notificationRecipient: { deleteMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockDeleteMany = (prisma as any).notificationRecipient
  .deleteMany as jest.Mock;
const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("deleteNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("deletes specified notifications for user", async () => {
    const cb = makeCallback();
    await deleteNotification(
      makeCall({ userId: "u1", notificationIds: ["n1", "n2"] }),
      cb,
    );
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", notificationId: { in: ["n1", "n2"] } },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockDeleteMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await deleteNotification(
      makeCall({ userId: "u1", notificationIds: ["n1"] }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
