import { prisma } from "@hrms/db";
import {
  updateSalary,
  getUserSalary,
  generateSalarySlip,
  derivePdfPassword,
} from "../handlers/salary";

jest.mock("../grpc/clients", () => ({
  salaryClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn() },
    attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
    leaveBalance: { findFirst: jest.fn().mockResolvedValue(null) },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollLineItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    incomeTaxSlab: { findMany: jest.fn().mockResolvedValue([]) },
    taxDeclaration: { findFirst: jest.fn().mockResolvedValue(null) },
    salaryComponentDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    tenantSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    salaryAdvance: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  hasPrivilegedRole: (
    role: string | null | undefined,
    allowed: readonly string[] = ["owner", "admin"],
  ) => !!role && allowed.includes(role),
  HR_ROLES: ["owner", "admin", "hr"],
  PRIVILEGED_ROLES: ["owner", "admin"],
  apiResponse: jest.fn((res: any, statusCode: number, data: any) =>
    res.json({ statusCode, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    INTERNAL_SERVER_ERROR: 500,
  },
  deriveFromComponents: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockPayrollRunFindFirst = (prisma as any).payrollRun
  .findFirst as jest.Mock;
const mockPayrollLineItemFindFirst = (prisma as any).payrollLineItem
  .findFirst as jest.Mock;

const makeRes = () =>
  ({ json: jest.fn(), setHeader: jest.fn(), send: jest.fn() }) as any;
const makeReq = (overrides: Record<string, any> = {}) =>
  ({
    user: { userId: "user-id-1", tenantRole: "hr" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any;

const makeSalaryBody = (overrides = {}) => ({
  userId: "emp-1",
  year: "2024",
  month: "04",
  salaryStructure: {
    basicPay: 50000,
    hra: 25000,
    conveyance: 18050,
    incentive: 0,
    pf: 6000,
    esi: 750,
    pt: 200,
    deductions: 0,
  },
  ...overrides,
});

describe("updateSalary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls createSalaryStructure when no existing record found", async () => {
    mockGrpcCall
      .mockResolvedValueOnce({ data: null }) // getSalaryStructure
      .mockResolvedValueOnce({ message: "Created" }); // createSalaryStructure
    const res = makeRes();
    await updateSalary(makeReq({ body: makeSalaryBody() }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getSalaryStructure",
      expect.objectContaining({ userId: "emp-1", year: 2024, month: 4 }),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "createSalaryStructure",
      expect.objectContaining({ userId: "emp-1", basicPay: 50000 }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("calls updateSalaryStructure when existing record found", async () => {
    mockGrpcCall
      .mockResolvedValueOnce({ data: { id: "struct-1" } }) // getSalaryStructure
      .mockResolvedValueOnce({ message: "Updated" }); // updateSalaryStructure
    const res = makeRes();
    await updateSalary(makeReq({ body: makeSalaryBody() }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateSalaryStructure",
      expect.objectContaining({ id: "struct-1", basicPay: 50000 }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await updateSalary(makeReq({ body: makeSalaryBody() }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("getUserSalary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
  });

  it("allows superuser to access any employee salary", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockResolvedValue({ data: {} });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getSalaryStructure",
      expect.objectContaining({ userId: "emp-1", year: 2024, month: 3 }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("allows non-superuser to access their own payslip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "user-id-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("returns FORBIDDEN when non-superuser tries to access another user's payslip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "other-id", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.FORBIDDEN,
      expect.any(Object),
    );
  });

  it("parses year and month as integers", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "03" } }),
      res,
    );

    const call = mockGrpcCall.mock.calls[0][2];
    expect(typeof call.year).toBe("number");
    expect(typeof call.month).toBe("number");
    expect(call.year).toBe(2024);
    expect(call.month).toBe(3);
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("generateSalarySlip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
  });

  it("allows superuser to generate slip for any employee", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await generateSalarySlip(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getPayslip",
      expect.objectContaining({ userId: "emp-1" }),
    );
  });

  it("returns FORBIDDEN when non-superuser tries to generate another user's slip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await generateSalarySlip(
      makeReq({ params: { userId: "other-id", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.FORBIDDEN,
      expect.any(Object),
    );
  });

  it("returns INTERNAL_SERVER_ERROR on grpc failure", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));

    const res = makeRes();
    await generateSalarySlip(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  const makePayslipResponse = () => ({
    data: {
      employee: {
        username: "emp-1",
        firstName: "Jane",
        lastName: "Doe",
        panNo: "AAAAA0000A",
        dob: "1993-10-10T00:00:00.000Z",
      },
      salaryStructure: {
        basicPay: 25000,
        hra: 15000,
        conveyance: 10000,
        pf: 3000,
        esi: 750,
        pt: 200,
        incentive: 0,
        deductions: 0,
      },
      attendanceSummary: null,
    },
  });

  it("prorates the baseline SalaryStructure by attendance when no payroll run has disbursed this month yet", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockResolvedValue(makePayslipResponse());
    mockPayrollRunFindFirst.mockResolvedValue(null);

    const res = makeRes();
    await generateSalarySlip(
      makeReq({
        params: { userId: "emp-1", year: "2024", month: "3" },
        user: { userId: "user-id-1", tenantId: "t1", isSuperUser: true },
      }),
      res,
    );

    expect(mockPayrollRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", month: 3, year: 2024, status: "disbursed" },
      }),
    );
    expect(mockPayrollLineItemFindFirst).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it("uses the disbursed PayrollLineItem's stored values directly, without re-prorating, when a payroll run has already disbursed this month", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockResolvedValue(makePayslipResponse());
    mockPayrollRunFindFirst.mockResolvedValue({ id: "run-1" });
    mockPayrollLineItemFindFirst.mockResolvedValue({
      basicPay: 12500,
      hra: 7500,
      conveyance: 5000,
      pf: 1500,
      esi: 375,
      pt: 100,
      otherDeductions: 0,
    });

    const res = makeRes();
    await generateSalarySlip(
      makeReq({
        params: { userId: "emp-1", year: "2024", month: "3" },
        user: { userId: "user-id-1", tenantId: "t1" },
      }),
      res,
    );

    expect(mockPayrollLineItemFindFirst).toHaveBeenCalledWith({
      where: { payrollRunId: "run-1", userId: "emp-1" },
    });
    expect(res.send).toHaveBeenCalled();
  });
});

describe("derivePdfPassword", () => {
  it("concatenates PAN with DOB formatted as DDMMYYYY", () => {
    expect(derivePdfPassword("AAAAA0000A", "1993-10-10T00:00:00.000Z")).toBe(
      "AAAAA0000A10101993",
    );
  });

  it("pads single-digit day/month with a leading zero", () => {
    expect(derivePdfPassword("AAAAA0000A", "1990-08-05T00:00:00.000Z")).toBe(
      "AAAAA0000A05081990",
    );
  });

  it("returns null when PAN is missing", () => {
    expect(derivePdfPassword(null, "1993-10-10T00:00:00.000Z")).toBeNull();
  });

  it("returns null when DOB is missing", () => {
    expect(derivePdfPassword("AAAAA0000A", null)).toBeNull();
  });

  it("returns null when DOB is not a parseable date", () => {
    expect(derivePdfPassword("AAAAA0000A", "not-a-date")).toBeNull();
  });
});
