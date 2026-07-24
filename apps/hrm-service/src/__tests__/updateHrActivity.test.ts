import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { updateHrActivity } from "../handlers/updateHrActivity";

jest.mock("@hrms/db", () => {
  const _db = {
    hrActivity: { findUnique: jest.fn(), update: jest.fn() },
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

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).hrActivity.findUnique as jest.Mock;
const mockUpdate = (prisma as any).hrActivity.update as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const baseActivity = {
  id: "act-1",
  title: "Old Title",
  description: "",
  scheduledAt: new Date("2024-03-15T10:00:00"),
  status: "active",
  createdBy: "admin",
  createdOn: new Date("2024-03-01"),
};

describe("updateHrActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...baseActivity, title: "Updated Title" });
    mockUserFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateHrActivity(makeCall({ title: "New Title" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when activity does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateHrActivity(makeCall({ id: "act-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns FAILED_PRECONDITION for deleted activity", async () => {
    mockFindUnique.mockResolvedValue({ ...baseActivity, status: "deleted" });
    const cb = makeCallback();
    await updateHrActivity(makeCall({ id: "act-1", title: "New Title" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
  });

  it("updates activity and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(baseActivity);
    const cb = makeCallback();
    await updateHrActivity(
      makeCall({ id: "act-1", title: "Updated Title", updatedBy: "hr" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "act-1" },
        data: expect.objectContaining({
          title: "Updated Title",
          lastUpdatedBy: "hr",
        }),
      }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:hrActivities:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("maps activityStatus field to status in update data", async () => {
    mockFindUnique.mockResolvedValue(baseActivity);
    const cb = makeCallback();
    await updateHrActivity(
      makeCall({ id: "act-1", activityStatus: "completed" }),
      cb,
    );
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBe("completed");
    expect(updateData.activityStatus).toBeUndefined();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateHrActivity(makeCall({ id: "act-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
