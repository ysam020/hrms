import { prisma } from "@hrms/db";
import { getPayslip } from "../handlers/getPayslip";

jest.mock("@hrms/db", () => ({
  prisma: {
    salaryStructure: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockSalaryFindFirst = (prisma as any).salaryStructure
  .findFirst as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockAttendanceFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const salaryRow = {
  id: "ss-1",
  username: "john",
  month: 3,
  year: 2024,
  netPayable: 50000,
};
const employeeRow = {
  id: "u1",
  username: "john",
  email: "john@test.com",
  first_name: "John",
  last_name: "Doe",
};

describe("getPayslip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSalaryFindFirst.mockResolvedValue(salaryRow);
    mockUserFindUnique.mockResolvedValue(employeeRow);
    mockAttendanceFindMany.mockResolvedValue([]);
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await getPayslip(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockSalaryFindFirst).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when no salary structure found", async () => {
    mockSalaryFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await getPayslip(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when employee not found", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getPayslip(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns payslip without attendance summary when month/year not provided", async () => {
    const cb = makeCallback();
    await getPayslip(makeCall({ username: "john" }), cb);
    const response = cb.mock.calls[0][1];
    expect(response.status).toBe(0);
    expect(response.data.attendanceSummary).toBeNull();
    expect(response.data.employee).toEqual(employeeRow);
    expect(response.data.salaryStructure).toEqual(salaryRow);
  });

  it("includes attendance summary when month and year provided", async () => {
    mockAttendanceFindMany.mockResolvedValue([
      { status: "Present" },
      { status: "Present" },
      { status: "Absent" },
      { status: "Late" },
    ]);
    const cb = makeCallback();
    await getPayslip(
      makeCall({ username: "john", month: "3", year: "2024" }),
      cb,
    );
    const { attendanceSummary } = cb.mock.calls[0][1].data;
    expect(attendanceSummary).not.toBeNull();
    expect(attendanceSummary.presentDays).toBe(3); // Present + Late
    expect(attendanceSummary.absentDays).toBe(1);
  });

  it("filters salary by month and year when provided", async () => {
    const cb = makeCallback();
    await getPayslip(
      makeCall({ username: "john", month: "3", year: "2024" }),
      cb,
    );
    const where = mockSalaryFindFirst.mock.calls[0][0].where;
    expect(where.month).toBe(3);
    expect(where.year).toBe(2024);
  });

  it("returns INTERNAL on database error", async () => {
    mockSalaryFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getPayslip(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
