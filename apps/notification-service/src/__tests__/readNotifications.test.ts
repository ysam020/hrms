import { status } from "@grpc/grpc-js";
import { prismaWithTenant } from "@hrms/db";
import {
  readNotifications,
  readAllNotifications,
} from "../handlers/readNotifications";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    notificationRecipient: { updateMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    openRawForCurrentDb: jest.fn(),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const call = (request: Record<string, any>) => ({ request }) as any;
const USER = "64b000000000000000000001";
const N1 = "64b0000000000000000000b1";
const N2 = "64b0000000000000000000b2";
const UNREAD = { OR: [{ readAt: null }, { readAt: { isSet: false } }] };
const mockUpdateMany = (prismaWithTenant as any).notificationRecipient
  .updateMany as jest.Mock;

describe("readNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("sets readAt on the caller's own uncleared, unread rows only", async () => {
    const cb = jest.fn();
    await readNotifications(
      call({ userId: USER, notificationIds: [N1, N2] }),
      cb,
    );

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: USER,
        notificationId: { in: [N1, N2] },
        isCleared: false,
        ...UNREAD,
      },
      data: { readAt: expect.any(Date) },
    });
    // Clearing is a different call: read never touches isCleared.
    expect(mockUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
      "isCleared",
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NOTIFICATIONS_MARKED_READ,
      status: status.OK,
    });
  });

  it("ignores ids that are not ObjectIds and writes nothing when none remain", async () => {
    const cb = jest.fn();
    await readNotifications(
      call({ userId: USER, notificationIds: ["x", "{$ne:1}"] }),
      cb,
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(cb.mock.calls[0][1].status).toBe(status.OK);
  });

  it("refuses a missing or malformed userId", async () => {
    const cb = jest.fn();
    await readNotifications(call({ notificationIds: [N1] }), cb);
    await readNotifications(call({ userId: "abc", notificationIds: [N1] }), cb);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(cb.mock.calls.map((c) => c[1].status)).toEqual([
      status.INVALID_ARGUMENT,
      status.INVALID_ARGUMENT,
    ]);
  });

  it("returns INTERNAL when the write fails", async () => {
    mockUpdateMany.mockRejectedValue(new Error("db down"));
    const cb = jest.fn();
    await readNotifications(call({ userId: USER, notificationIds: [N1] }), cb);
    expect(cb.mock.calls[0][1].status).toBe(status.INTERNAL);
  });
});

describe("readAllNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 3 });
  });

  it("marks every uncleared unread row of the caller read, keeping first-read times", async () => {
    const cb = jest.fn();
    await readAllNotifications(call({ userId: USER, notificationIds: [] }), cb);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER, isCleared: false, ...UNREAD },
      data: { readAt: expect.any(Date) },
    });
    expect(cb.mock.calls[0][1]).toEqual({
      message: MESSAGES.ALL_NOTIFICATIONS_READ,
      status: status.OK,
    });
  });

  it("refuses a malformed userId", async () => {
    const cb = jest.fn();
    await readAllNotifications(call({ userId: "nope" }), cb);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(cb.mock.calls[0][1].status).toBe(status.INVALID_ARGUMENT);
  });
});
