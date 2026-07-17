import { prismaWithTenant as prisma } from "@hrms/db";
import { grpcCall } from "../grpc/clients";
import { generateTdsWorksheet } from "../handlers/tdsWorksheet";

jest.mock("@hrms/db", () => {
  const _db: any = {
    user: { findUnique: jest.fn() },
    payrollRun: { findFirst: jest.fn(), findMany: jest.fn() },
    payrollLineItem: { findFirst: jest.fn(), findMany: jest.fn() },
    salaryComponentDefinition: { findMany: jest.fn() },
    incomeTaxSlab: { findMany: jest.fn() },
    taxDeclaration: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  return { prismaWithTenant: _db };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../grpc/clients", () => ({
  salaryClient: {},
  grpcCall: jest.fn(),
}));

// tdsWorksheet.ts imports MONTH_NAMES/formatINR/derivePdfPassword from
// ./salary, which at module load imports the real @hrms/cache (ioredis) —
// without this mock, a Redis connection attempt against a nonexistent local
// instance hangs the whole test file (same issue noted in payrollHandlers.test.ts).
jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockRunFindFirst = (prisma as any).payrollRun.findFirst as jest.Mock;
const mockRunFindMany = (prisma as any).payrollRun.findMany as jest.Mock;
const mockLineItemFindFirst = (prisma as any).payrollLineItem
  .findFirst as jest.Mock;
const mockLineItemFindMany = (prisma as any).payrollLineItem
  .findMany as jest.Mock;
const mockComponentDefsFindMany = (prisma as any).salaryComponentDefinition
  .findMany as jest.Mock;
const mockSlabFindMany = (prisma as any).incomeTaxSlab.findMany as jest.Mock;
const mockDeclarationFindFirst = (prisma as any).taxDeclaration
  .findFirst as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockGrpcCall = grpcCall as jest.Mock;

const VALID_PAYSLIP_RESPONSE = {
  data: {
    employee: {
      firstName: "Jane",
      lastName: "Doe",
      username: "jdoe",
      panNo: "ABCDE1234F",
      dob: "1990-05-15",
      designation: "Engineer",
    },
    salaryStructure: {
      basicPay: 50000,
      hra: 20000,
      conveyance: 1600,
      incentive: 0,
      components: [
        { code: "BASIC", name: "Basic", type: "earning", amount: 50000 },
        { code: "HRA", name: "HRA", type: "earning", amount: 20000 },
      ],
    },
  },
};

function makeReq(overrides: any = {}) {
  return {
    params: { userId: "u1", year: "2024", month: "6" },
    user: { userId: "u1", tenantId: "t1" },
    ...overrides,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("generateTdsWorksheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });
    mockRunFindFirst.mockResolvedValue(null);
    mockLineItemFindFirst.mockResolvedValue(null);
    mockComponentDefsFindMany.mockResolvedValue([]);
    mockSlabFindMany.mockResolvedValue([]);
    mockRunFindMany.mockResolvedValue([]);
    mockLineItemFindMany.mockResolvedValue([]);
    mockDeclarationFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValue({ name: "Acme Inc" });
    mockGrpcCall.mockResolvedValue(VALID_PAYSLIP_RESPONSE);
  });

  it("returns FORBIDDEN when a non-superuser requests another user's worksheet", async () => {
    const req = makeReq({
      params: { userId: "someone-else", year: "2024", month: "6" },
    });
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("allows a superuser to request another user's worksheet", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    const req = makeReq({
      params: { userId: "someone-else", year: "2024", month: "6" },
    });
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(mockGrpcCall).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it("returns NOT_FOUND when there is no salary data for the period", async () => {
    mockGrpcCall.mockResolvedValue({ data: {} });
    const req = makeReq();
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("returns BAD_REQUEST when the employee has no PAN/DOB on file", async () => {
    mockGrpcCall.mockResolvedValue({
      data: {
        employee: { firstName: "Jane", panNo: null, dob: null },
        salaryStructure: VALID_PAYSLIP_RESPONSE.data.salaryStructure,
      },
    });
    const req = makeReq();
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(res.send).not.toHaveBeenCalled();
  });

  it("generates a password-protected PDF for the new regime when there is no old-regime declaration", async () => {
    mockDeclarationFindFirst.mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/pdf",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("tds_worksheet_June_2024.pdf"),
    );
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("generates a PDF under the old regime when a declaration exists for the FY", async () => {
    mockDeclarationFindFirst.mockResolvedValue({
      monthlyRent: 15000,
      isMetroCity: true,
      lineItems: [{ code: "80C", amount: 50000, proofAmount: 50000 }],
    });
    const req = makeReq();
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("uses the disbursed line item's component breakdown when the month has already been paid out", async () => {
    mockRunFindFirst.mockResolvedValue({ id: "run1" });
    mockLineItemFindFirst.mockResolvedValue({
      basicPay: 50000,
      hra: 20000,
      conveyance: 1600,
      incentive: 0,
      componentBreakdown: [
        { code: "BASIC", name: "Basic", type: "earning", amount: 50000 },
      ],
      tds: 1200,
    });
    const req = makeReq();
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("routes to handleError (500) when the gRPC call throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("salary-service unavailable"));
    const req = makeReq();
    const res = makeRes();

    await generateTdsWorksheet(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
    );
    expect(res.send).not.toHaveBeenCalled();
  });
});
