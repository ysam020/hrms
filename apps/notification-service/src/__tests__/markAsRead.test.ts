import { prisma } from "@hrms/db";
import { markAsRead } from "../handlers/markAsRead";

jest.mock("@hrms/db", () => {
  const _db = {
    notificationRecipient: { updateMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateMany = (prisma as any).notificationRecipient
  .updateMany as jest.Mock;
const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("markAsRead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("marks specified notifications as cleared", async () => {
    const cb = makeCallback();
    await markAsRead(
      makeCall({ userId: "u1", notificationIds: ["n1", "n2"] }),
      cb,
    );
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", notificationId: { in: ["n1", "n2"] } },
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
    await markAsRead(makeCall({ userId: "u1", notificationIds: ["n1"] }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
