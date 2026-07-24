import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { rejectResignation } from "../handlers/rejectResignation";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: { findFirst: jest.fn(), update: jest.fn() },
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

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue(undefined),
  })),
  getEmailQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue(undefined),
  })),
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

const mockFindFirst = (prisma as any).resignation.findFirst as jest.Mock;
const mockUpdate = (prisma as any).resignation.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const resignation = { id: "res-1", username: "john", status: "Submitted" };

describe("rejectResignation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...resignation, status: "Rejected" });
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await rejectResignation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the current tenant", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await rejectResignation(makeCall({ id: "res-1" }), cb);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "res-1", tenantId: "t1" },
    });
  });

  it("returns NOT_FOUND when resignation does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await rejectResignation(makeCall({ id: "res-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns FAILED_PRECONDITION when resignation is not Submitted", async () => {
    mockFindFirst.mockResolvedValue({ ...resignation, status: "Approved" });
    const cb = makeCallback();
    await rejectResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
  });

  it("rejects resignation and invalidates cache", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await rejectResignation(
      makeCall({ id: "res-1", rejectionReason: "No valid reason" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res-1" },
        data: expect.objectContaining({
          status: "Rejected",
          rejectionReason: "No valid reason",
        }),
      }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:resignations:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("persists the request's remarks field into the comments column", async () => {
    // `remarks` is the real UpdateStatusRequest proto field — `comments`
    // was never actually part of it, so nothing sent under that name ever
    // reached the database.
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await rejectResignation(
      makeCall({ id: "res-1", remarks: "Discussed with candidate" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          comments: "Discussed with candidate",
        }),
      }),
    );
  });

  it("does not send the resignation back on the wire (BasicResponse has no data field)", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await rejectResignation(makeCall({ id: "res-1" }), cb);
    const [, payload] = cb.mock.calls[0];
    expect(payload).not.toHaveProperty("data");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await rejectResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
