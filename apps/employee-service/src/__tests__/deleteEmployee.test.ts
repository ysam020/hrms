import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { deleteEmployee } from "../handlers/deleteEmployee";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    attendanceRecord: { count: jest.fn() },
    leaveApplication: { count: jest.fn() },
    salaryStructure: { count: jest.fn() },
    payrollLineItem: { count: jest.fn() },
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
    delete: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockDelete = prisma.user.delete as jest.Mock;
const mockCacheInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;
const mockAttendanceCount = (prisma as any).attendanceRecord.count as jest.Mock;
const mockLeaveCount = (prisma as any).leaveApplication.count as jest.Mock;
const mockSalaryCount = (prisma as any).salaryStructure.count as jest.Mock;
const mockPayrollCount = (prisma as any).payrollLineItem.count as jest.Mock;

describe("deleteEmployee", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
    mockAttendanceCount.mockResolvedValue(0);
    mockLeaveCount.mockResolvedValue(0);
    mockSalaryCount.mockResolvedValue(0);
    mockPayrollCount.mockResolvedValue(0);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await deleteEmployee(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when employee does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await deleteEmployee(makeCall({ id: "emp-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("soft-deletes employee by setting status to Terminated", async () => {
    mockFindUnique.mockResolvedValue({
      id: "emp-1",
      username: "john",
      tenantId: "t1",
    });
    mockUpdate.mockResolvedValue({ id: "emp-1", employeeStatus: "Terminated" });

    const cb = makeCallback();
    await deleteEmployee(makeCall({ id: "emp-1", hardDelete: false }), cb);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      data: { employeeStatus: "Terminated" },
    });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_DEACTIVATED,
      status: status.OK,
    });
  });

  it("hard-deletes employee from database when hardDelete is true and no historical records exist", async () => {
    mockFindUnique.mockResolvedValue({
      id: "emp-1",
      username: "john",
      tenantId: "t1",
    });
    mockDelete.mockResolvedValue(undefined);

    const cb = makeCallback();
    await deleteEmployee(makeCall({ id: "emp-1", hardDelete: true }), cb);

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "emp-1" } });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_PERMANENTLY_DELETED,
      status: status.OK,
    });
  });

  it("blocks hard-delete when the employee has historical attendance/leave/payroll records", async () => {
    mockFindUnique.mockResolvedValue({
      id: "emp-1",
      username: "john",
      tenantId: "t1",
    });
    mockAttendanceCount.mockResolvedValue(3);

    const cb = makeCallback();
    await deleteEmployee(makeCall({ id: "emp-1", hardDelete: true }), cb);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_HAS_HISTORICAL_RECORDS,
      status: status.FAILED_PRECONDITION,
    });
  });

  it("invalidates cache after delete using the tenant-prefixed keys the reader paths actually store", async () => {
    mockFindUnique.mockResolvedValue({
      id: "emp-1",
      username: "john",
      tenantId: "t1",
    });
    mockUpdate.mockResolvedValue({});

    await deleteEmployee(makeCall({ id: "emp-1" }), makeCallback());

    expect(mockCacheInvalidate).toHaveBeenCalledWith("t:t1:employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:emp-1");
    expect(mockCacheDelete).toHaveBeenCalledWith(
      "t:t1:employee-details:john",
    );
    expect(mockCacheDelete).toHaveBeenCalledWith(
      "t:t1:dashboard:employee-insights",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await deleteEmployee(makeCall({ id: "emp-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
