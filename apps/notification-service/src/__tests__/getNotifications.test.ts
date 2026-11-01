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
  isCleared: false,
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

  it("maps recipient records to the same response shape as before", async () => {
    mockAggregate.mockResolvedValue([makeRow({ isCleared: true })]);
    mockCount.mockResolvedValue(1);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: USER }), cb);

    expect(cb.mock.calls[0][1].data[0]).toEqual({
      id: "64b0000000000000000000aa",
      title: "Test",
      body: "Test body",
      type: "general",
      isRead: true,
      createdAt: "2024-03-04T10:00:00.000Z",
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

  it("filters to the caller's recipients and applies unreadOnly", async () => {
    mockAggregate.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: USER, unreadOnly: true }),
      makeCallback(),
    );

    expect(pipelineOf()[0]).toEqual({
      $match: { userId: { $oid: USER }, isCleared: false },
    });
  });

  it("does not filter on isCleared when unreadOnly is false", async () => {
    mockAggregate.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(makeCall({ userId: USER }), makeCallback());

    expect(pipelineOf()[0]).toEqual({ $match: { userId: { $oid: USER } } });
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

  it("always counts unread regardless of unreadOnly filter", async () => {
    mockAggregate.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: USER, unreadOnly: true }),
      makeCallback(),
    );

    expect(mockCount.mock.calls[1][0].where).toEqual({
      userId: USER,
      isCleared: false,
    });
  });

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
