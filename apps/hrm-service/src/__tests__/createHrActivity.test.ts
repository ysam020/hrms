import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { createHrActivity } from "../handlers/createHrActivity";

jest.mock("@hrms/db", () => {
  const _db = {
    hrActivity: { create: jest.fn() },
    user: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockCreate = (prisma as any).hrActivity.create as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const baseActivity = {
  id: "act-1",
  title: "Team Meeting",
  description: "Monthly sync",
  scheduledAt: new Date("2024-03-15T10:00:00"),
  status: "active",
  createdBy: "admin",
  createdOn: new Date("2024-03-01T12:00:00Z"),
};

describe("createHrActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(baseActivity);
    mockUserFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when title is missing", async () => {
    const cb = makeCallback();
    await createHrActivity(makeCall({ date: "2024-03-15" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when date is missing", async () => {
    const cb = makeCallback();
    await createHrActivity(makeCall({ title: "Meeting" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates activity and invalidates cache", async () => {
    const cb = makeCallback();
    await createHrActivity(
      makeCall({
        title: "Team Meeting",
        date: "2024-03-15",
        createdBy: "admin",
      }),
      cb,
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Team Meeting",
          scheduledAt: expect.any(Date),
        }),
      }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:hrActivities:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("uses default activityType 'active' when not provided", async () => {
    const cb = makeCallback();
    await createHrActivity(
      makeCall({ title: "Meeting", date: "2024-03-15" }),
      cb,
    );
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.status).toBe("Active");
  });

  it("returns INTERNAL on database error", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await createHrActivity(
      makeCall({ title: "Meeting", date: "2024-03-15" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
