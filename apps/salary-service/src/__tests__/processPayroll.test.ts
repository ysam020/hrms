import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { processPayroll } from "../handlers/processPayroll";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findMany: jest.fn() },
    salaryStructure: { findFirst: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockSalaryFindFirst = (prisma as any).salaryStructure
  .findFirst as jest.Mock;
const mockAttendanceFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;

const mockEmployee = {
  id: "emp-1",
  username: "john",
  email: "john@example.com",
  first_name: "John",
  last_name: "Doe",
};

const mockSalary = {
  id: "sal-1",
  username: "john",
  grossSalary: 60000,
  netPayable: 55000,
  deductions: 5000,
};

describe("processPayroll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when month is missing", async () => {
    const cb = makeCallback();
    await processPayroll(makeCall({ year: "2024" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.MONTH_YEAR_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when year is missing", async () => {
    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.MONTH_YEAR_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns empty result when no active employees", async () => {
    mockUserFindMany.mockResolvedValue([]);

    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.PAYROLL_PROCESSED,
      status: status.OK,
      data: [],
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    });
  });

  it("marks employee as skipped when no salary structure exists", async () => {
    mockUserFindMany.mockResolvedValue([mockEmployee]);
    mockSalaryFindFirst.mockResolvedValue(null);

    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);

    const result = cb.mock.calls[0][1];
    expect(result.data[0]).toEqual({
      username: "john",
      status: "skipped",
      reason: "No salary structure",
    });
    expect(result.skippedCount).toBe(1);
    expect(result.processedCount).toBe(0);
  });

  it("processes payroll with full attendance (no LOP deduction)", async () => {
    // March 2024 has 31 days
    mockUserFindMany.mockResolvedValue([mockEmployee]);
    mockSalaryFindFirst.mockResolvedValue(mockSalary);
    // All 31 days present
    const records = Array.from({ length: 31 }, (_, i) => ({
      status: "Present",
    }));
    mockAttendanceFindMany.mockResolvedValue(records);

    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);

    const result = cb.mock.calls[0][1];
    const payroll = result.data[0];
    expect(payroll.status).toBe("processed");
    expect(payroll.lopDeduction).toBe(0);
    expect(payroll.netPayable).toBe(55000);
    expect(payroll.processedCount).toBeUndefined(); // not on individual item
  });

  it("calculates LOP deduction for absent days", async () => {
    // March 2024: 31 days, employee present for 21 days
    mockUserFindMany.mockResolvedValue([mockEmployee]);
    mockSalaryFindFirst.mockResolvedValue({ ...mockSalary, netPayable: 31000 });
    const records = Array.from({ length: 21 }, () => ({ status: "Present" }));
    mockAttendanceFindMany.mockResolvedValue(records);

    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);

    const result = cb.mock.calls[0][1];
    const payroll = result.data[0];
    // dailyNet = 31000/31 = 1000, absent = 10 days, lopDeduction = 10000
    expect(payroll.lopDeduction).toBeCloseTo(10000, 1);
    expect(payroll.netPayable).toBeCloseTo(21000, 1);
    expect(payroll.status).toBe("processed");
  });

  it("counts half-day attendance as 0.5 effective days", async () => {
    mockUserFindMany.mockResolvedValue([mockEmployee]);
    mockSalaryFindFirst.mockResolvedValue({ ...mockSalary, netPayable: 31000 });
    // 30 Present + 1 Half Day.
    // "half day" is included in presentStatuses, so presentDays = 31.
    // halfDays = 1, effectiveDays = 31 - 0.5 = 30.5 → 0.5 LOP days.
    const records = [
      ...Array.from({ length: 30 }, () => ({ status: "Present" })),
      { status: "Half Day" },
    ];
    mockAttendanceFindMany.mockResolvedValue(records);

    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);

    const result = cb.mock.calls[0][1];
    const payroll = result.data[0];
    expect(payroll.presentDays).toBe(30.5);
    expect(payroll.lopDeduction).toBeCloseTo(500, 1); // 0.5 days × 1000/day
  });

  it("filters employees by usernames when provided", async () => {
    mockUserFindMany.mockResolvedValue([]);

    await processPayroll(
      makeCall({ month: "3", year: "2024", usernames: ["john", "jane"] }),
      makeCallback(),
    );

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ username: { in: ["john", "jane"] } }),
      }),
    );
  });

  it("includes processedCount, skippedCount, errorCount in response", async () => {
    mockUserFindMany.mockResolvedValue([mockEmployee]);
    mockSalaryFindFirst.mockResolvedValue(mockSalary);
    mockAttendanceFindMany.mockResolvedValue([]);

    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);

    const result = cb.mock.calls[0][1];
    expect(result).toHaveProperty("processedCount");
    expect(result).toHaveProperty("skippedCount");
    expect(result).toHaveProperty("errorCount");
  });

  it("returns INTERNAL on database error", async () => {
    mockUserFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await processPayroll(makeCall({ month: "3", year: "2024" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
