import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { rejectLeave } from "../handlers/rejectLeave";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveApplication: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
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

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.cloud>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).leaveApplication.findUnique as jest.Mock;
const mockUpdate = (prisma as any).leaveApplication.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const pendingLeave = { id: "leave-1", username: "john", status: "Pending" };

describe("rejectLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue({ ...pendingLeave, status: "Rejected" });
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await rejectLeave(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when leave application does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await rejectLeave(makeCall({ id: "leave-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns FAILED_PRECONDITION when leave is not Pending", async () => {
    mockFindUnique.mockResolvedValue({ ...pendingLeave, status: "Approved" });
    const cb = makeCallback();
    await rejectLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a pending leave and returns OK", async () => {
    mockFindUnique.mockResolvedValue(pendingLeave);
    const cb = makeCallback();
    await rejectLeave(makeCall({ id: "leave-1" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "leave-1" },
      data: { status: "Rejected" },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("invalidates leave cache after rejection", async () => {
    mockFindUnique.mockResolvedValue(pendingLeave);
    const cb = makeCallback();
    await rejectLeave(makeCall({ id: "leave-1" }), cb);
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:leaves:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await rejectLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
