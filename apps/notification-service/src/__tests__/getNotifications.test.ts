import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getNotifications } from "../handlers/getNotifications";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    notificationRecipient: {
      aggregateRaw: jest.fn(),
      count: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
    // Opens the $lookup'ed notification text in place; identity here.
    openRawForCurrentDb: jest.fn(async (_m: string, rows: unknown) => rows),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const USER = "64b000000000000000000001";
const mockAggregate = (prisma as any).notificationRecipient
  .aggregateRaw as jest.Mock;
const mockCount = (prisma as any).notificationRecipient.count as jest.Mock;

// aggregateRaw returns MongoDB extended JSON.
const makeRow = (overrides: Record<string, any> = {}) => ({
  _id: { $oid: "64b0000000000000000000aa" },
  notificationId: { $oid: "64b0000000000000000000bb" },
  n: {
    _id: { $oid: "64b0000000000000000000bb" },
    title: "Test",
    message: "Test body",
    eventType: "general",
    timeStamp: { $date: "2024-03-04T10:00:00.000Z" },
  },
  ...overrides,
});

const pipelineOf = () => mockAggregate.mock.calls[0][0].pipeline as any[];

describe("getNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await getNotifications(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT for a userId that is not an ObjectId, without querying", async () => {
    const cb = makeCallback();
    await getNotifications(makeCall({ userId: "user-1" }), cb);
    expect(cb.mock.calls[0][1].status).toBe(status.INVALID_ARGUMENT);
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it("returns paginated notifications with total and unreadCount", async () => {
    mockAggregate.mockResolvedValue([makeRow()]);
    mockCount
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(3); // unreadCount

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NOTIFICATIONS_FETCHED,
      status: status.OK,
      data: expect.any(Array),
      total: 5,
      unreadCount: 3,
    });
  });

  it("identifies each item by its NOTIFICATION id — the id clear/read act on", async () => {
    mockAggregate.mockResolvedValue([makeRow()]);
    mockCount.mockResolvedValue(1);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    // Not the recipient row's own _id (…aa): no clear call could match it.
    expect(cb.mock.calls[0][1].data[0].id).toBe("64b0000000000000000000bb");
  });

  it("maps an unread notification with its link, category and priority", async () => {
    mockAggregate.mockResolvedValue([
      makeRow({
        n: {
          title: "Leave",
          message: "Approved",
          eventType: "leave_notification",
          timeStamp: { $date: "2024-03-04T10:00:00.000Z" },
          link: "/attendance/view-leave-applications",
          category: "leave",
          priority: "high",
        },
      }),
    ]);
    mockCount.mockResolvedValue(1);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    expect(cb.mock.calls[0][1].data[0]).toEqual({
      id: "64b0000000000000000000bb",
      title: "Leave",
      body: "Approved",
      type: "leave_notification",
      isRead: false,
      readAt: "",
      link: "/attendance/view-leave-applications",
      category: "leave",
      priority: "high",
      createdAt: "2024-03-04T10:00:00.000Z",
    });
  });

  it("reports a read notification as read, with when", async () => {
    mockAggregate.mockResolvedValue([
      makeRow({ readAt: { $date: "2024-03-05T08:00:00.000Z" } }),
    ]);
    mockCount.mockResolvedValue(1);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    expect(cb.mock.calls[0][1].data[0]).toMatchObject({
      isRead: true,
      readAt: "2024-03-05T08:00:00.000Z",
      link: "",
    });
  });

  it("accepts a $numberLong date and a null timeStamp", async () => {
    mockAggregate.mockResolvedValue([
      makeRow({
        n: {
          title: "T",
          message: "M",
          eventType: "e",
          timeStamp: { $date: { $numberLong: "1709546400000" } },
        },
      }),
      makeRow({
        n: { title: "T", message: "M", eventType: "e", timeStamp: null },
      }),
    ]);
    mockCount.mockResolvedValue(2);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    const [a, b] = cb.mock.calls[0][1].data;
    expect(a.createdAt).toBe("2024-03-04T10:00:00.000Z");
    expect(b.createdAt).toBe("");
  });

  it("keeps a recipient whose notification is missing, with blank text, instead of failing", async () => {
    mockAggregate.mockResolvedValue([makeRow({ n: undefined })]);
    mockCount.mockResolvedValue(1);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    expect(cb.mock.calls[0][1].status).toBe(status.OK);
    expect(cb.mock.calls[0][1].data[0]).toMatchObject({
      title: "",
      body: "",
      createdAt: "",
    });
  });

  it("unreadOnly narrows to notifications never read (raw null also matches a missing readAt)", async () => {
    mockAggregate.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: USER, unreadOnly: true }),
      makeCallback(),
    );

    expect(pipelineOf()[0]).toEqual({
      $match: { userId: { $oid: USER }, isCleared: false, readAt: null },
    });
    expect(mockCount.mock.calls[0][0].where).toEqual({
      userId: USER,
      isCleared: false,
      OR: [{ readAt: null }, { readAt: { isSet: false } }],
    });
  });

  it("never returns cleared notifications, read or not", async () => {
    mockAggregate.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(makeCall({ userId: USER }), makeCallback());

    expect(pipelineOf()[0]).toEqual({
      $match: { userId: { $oid: USER }, isCleared: false },
    });
    expect(mockCount.mock.calls[0][0].where).toEqual({
      userId: USER,
      isCleared: false,
    });
  });

  it("orders newest first, then paginates with page and limit", async () => {
    mockAggregate.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: USER, page: 3, limit: 5 }),
      makeCallback(),
    );

    const p = pipelineOf();
    expect(p[1]).toEqual({ $sort: { _id: -1 } });
    expect(p[2]).toEqual({ $skip: 10 });
    expect(p[3]).toEqual({ $limit: 5 });
    // Sorting and paging happen before the join, so only the page is joined.
    expect(p[4].$lookup.from).toBe("notifications");
  });

  it.each([true, false])(
    "counts unread as not cleared and never read (unreadOnly=%s)",
    async (unreadOnly) => {
      mockAggregate.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await getNotifications(
        makeCall({ userId: USER, unreadOnly }),
        makeCallback(),
      );

      expect(mockCount.mock.calls[1][0].where).toEqual({
        userId: USER,
        isCleared: false,
        OR: [{ readAt: null }, { readAt: { isSet: false } }],
      });
    },
  );

  it("returns INTERNAL on database error", async () => {
    mockAggregate.mockRejectedValue(new Error("DB error"));
    mockCount.mockResolvedValue(0);
    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
      unreadCount: 0,
    });
  });
});
