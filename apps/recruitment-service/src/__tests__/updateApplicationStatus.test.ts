import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { updateApplicationStatus } from "../handlers/updateApplicationStatus";

jest.mock("@hrms/db", () => {
  const _db = {
    jobApplication: { findUnique: jest.fn(), update: jest.fn() },
    jobOpening: { update: jest.fn() },
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

import { getNotificationQueue } from "@hrms/queue";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).jobApplication.findUnique as jest.Mock;
const mockUpdate = (prisma as any).jobApplication.update as jest.Mock;
const mockJobOpeningUpdate = (prisma as any).jobOpening.update as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockGetNotificationQueue = getNotificationQueue as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const application = {
  id: "app-1",
  name: "John Doe",
  status: "Applied",
  jobTitleId: "j-1",
};

describe("updateApplicationStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...application, status: "Shortlisted" });
    mockJobOpeningUpdate.mockResolvedValue(undefined);
    mockUserFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ applicationStatus: "Shortlisted" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when applicationStatus is missing", async () => {
    const cb = makeCallback();
    await updateApplicationStatus(makeCall({ id: "app-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
  });

  it("returns NOT_FOUND when application does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-99", applicationStatus: "Shortlisted" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("updates application status and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(application);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", applicationStatus: "Shortlisted" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { status: "Shortlisted" },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("applications:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("increments candidatesHired when status is Hired", async () => {
    mockFindUnique.mockResolvedValue(application);
    mockUpdate.mockResolvedValue({ ...application, status: "Hired" });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", applicationStatus: "Hired" }),
      cb,
    );
    expect(mockJobOpeningUpdate).toHaveBeenCalledWith({
      where: { id: "j-1" },
      data: { candidatesHired: { increment: 1 } },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("jobOpenings:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", applicationStatus: "Shortlisted" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });

  it("enqueues notification when HR users exist", async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGetNotificationQueue.mockReturnValueOnce(mockQueue);

    mockFindUnique.mockResolvedValue(application);
    mockUpdate.mockResolvedValue({ ...application, status: "Shortlisted" });
    mockUserFindMany.mockResolvedValue([{ id: "u1", username: "hr1" }]);

    await updateApplicationStatus(
      makeCall({ id: "app-1", applicationStatus: "Shortlisted" }),
      makeCallback(),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockQueue.add).toHaveBeenCalledWith(
      "applicationStatusUpdated",
      expect.any(Object),
    );
  });
});
