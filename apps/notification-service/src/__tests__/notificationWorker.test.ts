import { prisma } from "@hrms/db";
import { startNotificationWorker } from "../workers/notificationWorker";

let capturedProcessor: (job: any) => Promise<any>;

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: any) => {
    capturedProcessor = processor;
    return { on: jest.fn() };
  }),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findMany: jest.fn() },
    notification: { create: jest.fn() },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ dbName: "hrms-test-tenant" }),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getClientForDb: jest.fn(() => ({})),
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
  };
});

jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => ({})),
  getDeadLetterQueue: jest.fn(() => ({ add: jest.fn() })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/firebase", () => ({
  sendPushNotifications: jest
    .fn()
    .mockResolvedValue({ sentCount: 0, failedCount: 0, success: true }),
}));

const mockSendToUser = jest.fn().mockResolvedValue(true);
const mockSendNotification = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/websocket", () => ({
  getNotificationPublisher: jest.fn(() => ({
    sendToUser: mockSendToUser,
    sendNotification: mockSendNotification,
  })),
}));

const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockNotificationCreate = (prisma as any).notification.create as jest.Mock;

const runProcessor = (data: Record<string, any>) =>
  capturedProcessor({ id: "job-1", data, opts: {} } as any);

describe("notificationWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationCreate.mockResolvedValue({ id: "notif-1", recipients: [] });
    startNotificationWorker();
  });

  // The socket registry (RedisWebSocketAdapter) keys connected sockets by
  // userId, not username — sendToUser() must be called with the resolved
  // userId, never the raw username, or every targeted WS delivery silently
  // no-ops ("user may be offline") even for connected users.
  it("delivers to WebSocket using resolved userIds, not raw usernames, when recipients are explicit ids", async () => {
    await runProcessor({
      tenantId: "tenant-1",
      title: "KYC",
      message: "hi",
      recipients: ["id-1", "id-2"],
      pushTargets: ["alice", "bob"],
    });

    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-1",
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-2",
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "alice",
      expect.anything(),
      expect.anything(),
    );
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "bob",
      expect.anything(),
      expect.anything(),
    );
  });

  it("resolves pushTargets usernames to userIds before WebSocket delivery when no explicit recipients are given", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "id-1" }, { id: "id-2" }]);

    await runProcessor({
      tenantId: "tenant-1",
      title: "KYC",
      message: "hi",
      pushTargets: ["alice", "bob"],
    });

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { username: { in: ["alice", "bob"] } },
      select: { id: true },
    });
    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-1",
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-2",
      "notification",
      expect.anything(),
    );
  });

  it("also delivers a custom socketEvent to resolved userIds, not usernames", async () => {
    await runProcessor({
      tenantId: "tenant-1",
      title: "KYC",
      message: "hi",
      recipients: ["id-1"],
      pushTargets: ["alice"],
      socketEvent: "kyc-edit-requested",
      socketPayload: { username: "alice" },
    });

    expect(mockSendToUser).toHaveBeenCalledWith("id-1", "kyc-edit-requested", {
      username: "alice",
    });
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "alice",
      "kyc-edit-requested",
      expect.anything(),
    );
  });

  it("broadcasts instead of targeting when there are no recipients at all", async () => {
    await runProcessor({
      tenantId: "tenant-1",
      title: "Announcement",
      message: "hi",
    });

    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(mockSendNotification).toHaveBeenCalled();
  });
});
