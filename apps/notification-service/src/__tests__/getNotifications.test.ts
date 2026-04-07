import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getNotifications } from "../handlers/getNotifications";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    notificationRecipient: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindMany = (prisma as any).notificationRecipient
  .findMany as jest.Mock;
const mockCount = (prisma as any).notificationRecipient.count as jest.Mock;

const makeRecipient = (overrides: Record<string, any> = {}) => ({
  id: "rec-1",
  userId: "user-1",
  isCleared: false,
  notification: {
    title: "Test",
    message: "Test body",
    eventType: "general",
    timeStamp: new Date("2024-03-04T10:00:00.000Z"),
  },
  ...overrides,
});

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

  it("returns paginated notifications with total and unreadCount", async () => {
    const recipients = [makeRecipient()];
    mockFindMany.mockResolvedValue(recipients);
    mockCount
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(3); // unreadCount

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: "user-1" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NOTIFICATIONS_FETCHED,
      status: status.OK,
      data: expect.any(Array),
      total: 5,
      unreadCount: 3,
    });
  });

  it("maps recipient records to correct response shape", async () => {
    const recipient = makeRecipient({ isCleared: true });
    mockFindMany.mockResolvedValue([recipient]);
    mockCount.mockResolvedValue(1).mockResolvedValueOnce(1);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: "user-1" }), cb);

    const item = cb.mock.calls[0][1].data[0];
    expect(item).toEqual({
      id: "rec-1",
      title: "Test",
      body: "Test body",
      type: "general",
      isRead: true,
      createdAt: "2024-03-04T10:00:00.000Z",
    });
  });

  it("returns empty string for createdAt when timeStamp is null", async () => {
    const recipient = makeRecipient({
      notification: {
        title: "T",
        message: "M",
        eventType: "e",
        timeStamp: null,
      },
    });
    mockFindMany.mockResolvedValue([recipient]);
    mockCount.mockResolvedValue(1).mockResolvedValueOnce(0);

    const cb = makeCallback();
    await getNotifications(makeCall({ userId: "user-1" }), cb);

    expect(cb.mock.calls[0][1].data[0].createdAt).toBe("");
  });

  it("applies unreadOnly filter when set to true", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: "user-1", unreadOnly: true }),
      makeCallback(),
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isCleared: false }),
      }),
    );
  });

  it("paginates correctly with page and limit", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: "user-1", page: 3, limit: 5 }),
      makeCallback(),
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  it("orders notifications by id descending (newest first)", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(makeCall({ userId: "user-1" }), makeCallback());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: "desc" } }),
    );
  });

  it("always counts unread regardless of unreadOnly filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getNotifications(
      makeCall({ userId: "user-1", unreadOnly: true }),
      makeCallback(),
    );

    // Second count call should always use { userId, isCleared: false }
    const secondCount = mockCount.mock.calls[1][0];
    expect(secondCount.where).toEqual({ userId: "user-1", isCleared: false });
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getNotifications(makeCall({ userId: "user-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
      unreadCount: 0,
    });
  });
});
