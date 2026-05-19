import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { applyLeave } from "../handlers/applyLeave";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveApplication: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    team: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    invalidatePattern: jest.fn(),
  },
}));

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest
    .fn()
    .mockReturnValue({ add: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindMany = prisma.leaveApplication.findMany as jest.Mock;
const mockCreate = prisma.leaveApplication.create as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockTeamFindMany = (prisma as any).team.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const validRequest = {
  userId: "john",
  leaveType: "Casual",
  from: "2024-03-01",
  to: "2024-03-05",
  reason: "vacation",
};

describe("applyLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
    mockTeamFindMany.mockResolvedValue([]);
  });

  it("returns INVALID_ARGUMENT when required fields are missing", async () => {
    const cb = makeCallback();
    await applyLeave(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_LEAVE_TYPE_FROM_TO_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT for invalid date format", async () => {
    const cb = makeCallback();
    await applyLeave(
      makeCall({ ...validRequest, from: "not-a-date", to: "also-not" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INVALID_DATE_FORMAT,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when end date is before start date", async () => {
    const cb = makeCallback();
    await applyLeave(
      makeCall({ ...validRequest, from: "2024-03-05", to: "2024-03-01" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.END_DATE_BEFORE_START,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns ALREADY_EXISTS when leave overlaps with existing application", async () => {
    mockFindMany.mockResolvedValue([
      {
        username: "john",
        status: "Pending",
        from: "2024-03-02",
        to: "2024-03-08",
      },
    ]);
    const cb = makeCallback();
    await applyLeave(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_ALREADY_APPLIED,
      status: status.ALREADY_EXISTS,
    });
  });

  it("does not flag overlap when existing leave is Rejected/Cancelled", async () => {
    // The query only finds Pending/Approved, so Rejected won't be returned
    mockFindMany.mockResolvedValue([]); // no pending/approved leaves
    const leaveApp = {
      id: "leave-1",
      username: "john",
      leaveType: "Casual",
      from: "2024-03-01",
      to: "2024-03-05",
      days: 4,
      status: "Pending",
    };
    mockCreate.mockResolvedValue(leaveApp);

    const cb = makeCallback();
    await applyLeave(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_APPLIED,
      status: status.OK,
      data: leaveApp,
    });
  });

  it("creates leave with correct working days (excludes weekends)", async () => {
    // 2024-03-04 (Mon) to 2024-03-08 (Fri) = 5 working days
    mockCreate.mockResolvedValue({
      id: "l1",
      days: 5,
      status: "Pending",
    });

    const cb = makeCallback();
    await applyLeave(
      makeCall({ ...validRequest, from: "2024-03-04", to: "2024-03-08" }),
      cb,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ days: 5, status: "Pending" }),
      }),
    );
  });

  it("excludes weekend days from working day count", async () => {
    // 2024-03-01 (Fri) to 2024-03-04 (Mon) = 2 working days (Fri + Mon)
    mockCreate.mockResolvedValue({ id: "l2", days: 2, status: "Pending" });

    await applyLeave(
      makeCall({ ...validRequest, from: "2024-03-01", to: "2024-03-04" }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ days: 2 }),
      }),
    );
  });

  it("invalidates leave cache after successful application", async () => {
    mockCreate.mockResolvedValue({ id: "l1", status: "Pending" });

    await applyLeave(makeCall(validRequest), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("leaves:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await applyLeave(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
