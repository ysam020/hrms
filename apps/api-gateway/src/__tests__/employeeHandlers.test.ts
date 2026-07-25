import { prisma } from "@hrms/db";
import {
  editEmployeeDetails,
  getEmployeeDetails,
  employeeInsights,
  completeKyc,
  editKyc,
  kycApproval,
  viewAllKycs,
  getKycInsights,
  requestKycEditAccess,
  allowKycEdit,
  listPendingKycActions,
} from "../handlers/employee";

jest.mock("../grpc/clients", () => ({
  employeeClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregateRaw: jest.fn(),
      findMany: jest.fn(),
    },
    tenantMembership: {
      findFirst: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/crypto", () => ({
  safeDecrypt: jest.fn((v: any) => v),
}));

jest.mock("@hrms/common", () => ({
  hasPrivilegedRole: (
    role: string | null | undefined,
    allowed: readonly string[] = ["owner", "admin"],
  ) => !!role && allowed.includes(role),
  HR_ROLES: ["owner", "admin", "hr"],
  PRIVILEGED_ROLES: ["owner", "admin"],
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

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

jest.mock("../handlers/approvalChains", () => ({
  isPrivileged: jest.fn().mockResolvedValue(true),
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { getTenantId } from "@hrms/db";
import { isPrivileged } from "../handlers/approvalChains";

const mockGetTenantId = getTenantId as jest.Mock;
const mockIsPrivileged = isPrivileged as jest.Mock;

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserCount = (prisma as any).user.count as jest.Mock;
const mockUserGroupBy = (prisma as any).user.groupBy as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserAggregateRaw = (prisma as any).user.aggregateRaw as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockMembershipFindFirst = (prisma as any).tenantMembership
  .findFirst as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("employeeHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cacheManager.get as jest.Mock).mockResolvedValue(null);
    (cacheManager.set as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.delete as jest.Mock).mockResolvedValue(undefined);
  });

  describe("editEmployeeDetails", () => {
    it("finds user by username and updates with provided fields", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      const res = makeRes();
      await editEmployeeDetails(
        makeReq({
          body: { username: "user-1", employeeStatus: "Active" },
        }),
        res,
      );
      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: "user-1" } }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("ignores salary/salaryStructure in the body — that's now written only via updateSalary, not here", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      const res = makeRes();
      await editEmployeeDetails(
        makeReq({
          body: {
            username: "user-1",
            employeeStatus: "Active",
            salary: 50000,
            salaryStructure: { basicPay: 25000, pf: 3000 },
          },
        }),
        res,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { employeeStatus: "Active" },
      });
    });

    it("invalidates the tenant-prefixed cache keys that getEmployeeDetails/employeeInsights actually read from", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      const res = makeRes();
      await editEmployeeDetails(
        makeReq({ body: { username: "user-1", employeeStatus: "Active" } }),
        res,
      );
      expect(cacheManager.invalidatePattern).toHaveBeenCalledWith(
        "t:t1:employees:*",
      );
      expect(cacheManager.delete).toHaveBeenCalledWith("t:t1:employee:u1");
      expect(cacheManager.delete).toHaveBeenCalledWith(
        "t:t1:employee-details:user-1",
      );
      expect(cacheManager.delete).toHaveBeenCalledWith(
        "t:t1:dashboard:employee-insights",
      );
    });

    it("returns NOT_FOUND when user does not exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await editEmployeeDetails(makeReq({ body: { username: "user-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await editEmployeeDetails(makeReq({ body: { username: "user-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("returns FORBIDDEN when caller isn't privileged and lacks EmployeeManagement:edit", async () => {
      mockIsPrivileged.mockResolvedValueOnce(false);
      mockUserFindUnique.mockResolvedValue({ permissions: [] });
      const res = makeRes();
      await editEmployeeDetails(makeReq({ body: { username: "user-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows a non-privileged caller holding EmployeeManagement:edit", async () => {
      mockIsPrivileged.mockResolvedValueOnce(false);
      mockUserFindUnique
        .mockResolvedValueOnce({ permissions: ["EmployeeManagement:edit"] })
        .mockResolvedValueOnce({ id: "u1" });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      const res = makeRes();
      await editEmployeeDetails(
        makeReq({ body: { username: "user-1", employeeStatus: "Active" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("getEmployeeDetails", () => {
    it("fetches employee details by username from DB", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        username: "alice",
        employeeStatus: "Active",
        pf_no: null,
        uan_no: null,
        esic_no: null,
        salary: 0,
        salaryBasicPay: null,
        salaryHra: null,
        salaryConveyance: null,
        salaryPf: null,
        salaryEsi: null,
        salaryPt: null,
        reasonForTermination: null,
        dateOfTermination: null,
        dateOfAbscond: null,
        isSuperUser: false,
      });
      mockMembershipFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: "alice" } }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("includes the employee's tenantRole, resolved from TenantMembership (not User.role)", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        username: "alice",
        isSuperUser: false,
      });
      mockMembershipFindFirst.mockResolvedValue({ role: "owner" });
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockMembershipFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1", userId: "u1" } }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ tenantRole: "owner" }),
        }),
      );
    });

    it("returns tenantRole: null when the employee has no TenantMembership row", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        username: "alice",
        isSuperUser: false,
      });
      mockMembershipFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ tenantRole: null }),
        }),
      );
    });

    it("returns NOT_FOUND when employee does not exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockUserFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    // Regression coverage for a real bug: this endpoint used to return full
    // salary, PF/UAN/ESIC, and termination data to ANY authenticated caller
    // for ANY employee — no owner/HR check at all. The response is also
    // cached under a key that isn't scoped by caller, so the fix must strip
    // fields at response time (for both the cache-hit and fresh-fetch
    // paths), not bake the decision into what gets cached.
    describe("compensation/PII exposure", () => {
      const targetUser = {
        id: "u1",
        username: "alice",
        employeeStatus: "Active",
        pf_no: "PF123",
        uan_no: "UAN123",
        esic_no: "ESIC123",
        salary: 90000,
        salaryBasicPay: 45000,
        salaryHra: 20000,
        salaryConveyance: 5000,
        salaryPf: 5000,
        salaryEsi: 1000,
        salaryPt: 200,
        salaryComponentBreakdown: [],
        reasonForTermination: null,
        dateOfTermination: null,
        dateOfAbscond: null,
        isSuperUser: false,
      };

      beforeEach(() => {
        mockUserFindUnique.mockResolvedValue(targetUser);
        mockMembershipFindFirst.mockResolvedValue(null);
      });

      it("strips salary/PF/UAN/ESIC for a non-owner, non-HR caller", async () => {
        const res = makeRes();
        await getEmployeeDetails(
          makeReq({
            user: { userId: "caller-1", tenantRole: "employee" },
            params: { username: "alice" },
          }),
          res,
        );
        const [, , payload] = mockApiResponse.mock.calls[0];
        expect(payload.data.salary).toBeUndefined();
        expect(payload.data.salaryStructure).toBeUndefined();
        expect(payload.data.pf_no).toBeUndefined();
        expect(payload.data.uan_no).toBeUndefined();
        expect(payload.data.esic_no).toBeUndefined();
      });

      it("keeps full data when the caller is viewing their own record", async () => {
        const res = makeRes();
        await getEmployeeDetails(
          makeReq({
            user: { userId: "u1", tenantRole: "employee" },
            params: { username: "alice" },
          }),
          res,
        );
        const [, , payload] = mockApiResponse.mock.calls[0];
        expect(payload.data.salary).toBe(90000);
        expect(payload.data.pf_no).toBe("PF123");
      });

      it.each(["owner", "admin", "hr"])(
        "keeps full data for another employee when caller's tenant role is '%s'",
        async (tenantRole) => {
          const res = makeRes();
          await getEmployeeDetails(
            makeReq({
              user: { userId: "caller-1", tenantRole },
              params: { username: "alice" },
            }),
            res,
          );
          const [, , payload] = mockApiResponse.mock.calls[0];
          expect(payload.data.salary).toBe(90000);
          expect(payload.data.esic_no).toBe("ESIC123");
        },
      );

      it("re-applies the strip on a cache hit, using the cached record's own id (not the caller's)", async () => {
        (cacheManager.get as jest.Mock).mockResolvedValue(targetUser);
        const res = makeRes();
        await getEmployeeDetails(
          makeReq({
            user: { userId: "caller-1", tenantRole: "employee" },
            params: { username: "alice" },
          }),
          res,
        );
        // Cache hit skips the target-by-username DB read entirely.
        expect(mockUserFindUnique).not.toHaveBeenCalledWith(
          expect.objectContaining({ where: { username: "alice" } }),
        );
        const [, , payload] = mockApiResponse.mock.calls[0];
        expect(payload.data.salary).toBeUndefined();
      });
    });
  });

  describe("employeeInsights", () => {
    it("returns overview counts and departmentBreakdown", async () => {
      mockUserCount
        .mockResolvedValueOnce(10) // Active
        .mockResolvedValueOnce(2) // Resigned
        .mockResolvedValueOnce(1) // Terminated
        .mockResolvedValueOnce(0) // Absconded
        .mockResolvedValueOnce(13); // Total
      mockUserGroupBy.mockResolvedValue([
        { department: "Engineering", _count: { id: 5 } },
        { department: "HR", _count: { id: 3 } },
      ]);
      const res = makeRes();
      await employeeInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            overview: expect.objectContaining({
              activeEmployees: 10,
              resignedEmployees: 2,
              terminatedEmployees: 1,
              abscondedEmployees: 0,
              totalEmployees: 13,
            }),
            departmentBreakdown: expect.arrayContaining([
              expect.objectContaining({ department: "Engineering", count: 5 }),
            ]),
          }),
        }),
      );
    });

    it("filters out null departments", async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserGroupBy.mockResolvedValue([
        { department: null, _count: { id: 3 } },
        { department: "HR", _count: { id: 2 } },
      ]);
      const res = makeRes();
      await employeeInsights(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      const breakdown = call[2].data.departmentBreakdown;
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].department).toBe("HR");
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserCount.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await employeeInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("completeKyc", () => {
    it("calls grpcCall submitKyc with userId and mapped camelCase KYC fields", async () => {
      mockGrpcCall.mockResolvedValue({ message: "KYC submitted" });
      const res = makeRes();
      await completeKyc(
        makeReq({
          body: {
            aadhar_no: "123412341234",
            pan_no: "ABCDE1234F",
            bank_name: "HDFC",
          },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "submitKyc",
        expect.objectContaining({
          userId: "user-1",
          aadharNo: "123412341234",
          panNo: "ABCDE1234F",
          bankName: "HDFC",
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on gRPC error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await completeKyc(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("editKyc", () => {
    it("returns BAD_REQUEST when username is missing", async () => {
      const res = makeRes();
      await editKyc(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when the target employee doesn't exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await editKyc(makeReq({ body: { username: "ghost" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it("returns FORBIDDEN when editing someone else's KYC without privilege or permission", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: "someone-else" }) // target lookup
        .mockResolvedValueOnce({ isSuperUser: false, permissions: [] }); // caller privilege lookup
      const res = makeRes();
      await editKyc(
        makeReq({
          user: { userId: "user-1", tenantRole: "employee" },
          body: { username: "john_doe" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it("self-edit: passes userId (not username) so submitKyc knows not to reset an existing decision", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-1" });
      mockGrpcCall.mockResolvedValue({ message: "KYC updated" });
      const res = makeRes();
      await editKyc(
        makeReq({
          user: { userId: "user-1", tenantRole: "employee" },
          body: {
            username: "john_doe",
            bank_name: "HDFC",
            ifsc_code: "HDFC0001",
          },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "submitKyc",
        expect.objectContaining({
          userId: "user-1",
          bankName: "HDFC",
          ifscCode: "HDFC0001",
        }),
      );
      const [, , payload] = mockGrpcCall.mock.calls[0];
      expect(payload.username).toBeUndefined();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("HR editing another employee: passes username (not userId), preserving prior approval decisions", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "someone-else" });
      mockGrpcCall.mockResolvedValue({ message: "KYC updated" });
      const res = makeRes();
      await editKyc(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: {
            username: "john_doe",
            bank_name: "HDFC",
            ifsc_code: "HDFC0001",
          },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "submitKyc",
        expect.objectContaining({
          username: "john_doe",
          bankName: "HDFC",
          ifscCode: "HDFC0001",
        }),
      );
      const [, , payload] = mockGrpcCall.mock.calls[0];
      expect(payload.userId).toBeUndefined();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on gRPC error", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "someone-else" });
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await editKyc(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john_doe" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it.each(["Approved", "Rejected", "Edit Requested"])(
      "returns BAD_REQUEST when the target KYC is currently %s",
      async (kyc_approval) => {
        mockUserFindUnique.mockResolvedValue({ id: "user-1", kyc_approval });
        const res = makeRes();
        await editKyc(
          makeReq({
            user: { userId: "user-1", tenantRole: "employee" },
            body: { username: "john_doe" },
          }),
          res,
        );
        expect(mockApiResponse).toHaveBeenCalledWith(
          res,
          RESPONSE_STATUS.BAD_REQUEST,
          expect.any(Object),
        );
        expect(mockGrpcCall).not.toHaveBeenCalled();
      },
    );

    it.each(["Pending", "Revision Requested", null])(
      "allows editing when the target KYC is currently %s",
      async (kyc_approval) => {
        mockUserFindUnique.mockResolvedValue({ id: "user-1", kyc_approval });
        mockGrpcCall.mockResolvedValue({ message: "KYC updated" });
        const res = makeRes();
        await editKyc(
          makeReq({
            user: { userId: "user-1", tenantRole: "employee" },
            body: { username: "john_doe" },
          }),
          res,
        );
        expect(mockGrpcCall).toHaveBeenCalled();
      },
    );

    it("returns BAD_REQUEST when Pending but the one-time edit window has already closed", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "user-1",
        kyc_approval: "Pending",
        kyc_edit_window: "closed",
      });
      const res = makeRes();
      await editKyc(
        makeReq({
          user: { userId: "user-1", tenantRole: "employee" },
          body: { username: "john_doe" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it.each(["open", null])(
      "allows editing when Pending and the edit window is %s (not yet closed)",
      async (kyc_edit_window) => {
        mockUserFindUnique.mockResolvedValue({
          id: "user-1",
          kyc_approval: "Pending",
          kyc_edit_window,
        });
        mockGrpcCall.mockResolvedValue({ message: "KYC updated" });
        const res = makeRes();
        await editKyc(
          makeReq({
            user: { userId: "user-1", tenantRole: "employee" },
            body: { username: "john_doe" },
          }),
          res,
        );
        expect(mockGrpcCall).toHaveBeenCalled();
      },
    );
  });

  describe("kycApproval", () => {
    it("returns BAD_REQUEST when username missing", async () => {
      const res = makeRes();
      await kycApproval(makeReq({ body: { kyc_approval: "Approved" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when kyc_approval missing", async () => {
      const res = makeRes();
      await kycApproval(makeReq({ body: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when user does not exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john", kyc_approval: "Approved" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns FORBIDDEN when the caller isn't privileged and lacks the approve_kyc permission", async () => {
      mockUserFindUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: [],
      });
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "user-1", tenantRole: "employee" },
          body: { username: "john", kyc_approval: "Approved" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it("allows a non-superuser role granted the approve_kyc permission", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({
          isSuperUser: false,
          permissions: ["BasicKYCDetails:approve_kyc:all"],
        }) // caller privilege lookup
        .mockResolvedValueOnce({ id: "u1" }); // target lookup
      mockGrpcCall.mockResolvedValue({ message: "Approved" });
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "manager-1", tenantRole: "manager" },
          body: { username: "john", kyc_approval: "Approved" },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "approveKyc",
        { employeeId: "u1" },
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("calls approveKyc when kyc_approval is Approved", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      mockGrpcCall.mockResolvedValue({ message: "Approved" });
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john", kyc_approval: "Approved" },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "approveKyc",
        { employeeId: "u1" },
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for an unsupported kyc_approval value (e.g. the removed legacy Rejected)", async () => {
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john", kyc_approval: "Rejected" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it("calls requestKycRevision with fieldIssuesJson when kyc_approval is Revision Requested", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      mockGrpcCall.mockResolvedValue({ message: "Revision requested" });
      const res = makeRes();
      const field_issues = { aadhar_no: "Blurry photo" };
      await kycApproval(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: {
            username: "john",
            kyc_approval: "Revision Requested",
            field_issues,
          },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "requestKycRevision",
        { employeeId: "u1", fieldIssuesJson: JSON.stringify(field_issues) },
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns FORBIDDEN when the caller isn't privileged and lacks the request_kyc_revision permission", async () => {
      mockUserFindUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: [],
      });
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "user-1", tenantRole: "employee" },
          body: {
            username: "john",
            kyc_approval: "Revision Requested",
            field_issues: { aadhar_no: "Blurry photo" },
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockUserFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await kycApproval(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john", kyc_approval: "Approved" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("listPendingKycActions", () => {
    it("returns an empty list without querying when the caller has neither permission", async () => {
      mockUserFindUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: [],
      });
      const res = makeRes();
      await listPendingKycActions(
        makeReq({ user: { userId: "user-1", tenantRole: "employee" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        { data: [] },
      );
      expect(mockUserFindMany).not.toHaveBeenCalled();
    });

    it("returns only Pending submissions for a caller with approve_kyc but not request_kyc_revision", async () => {
      mockUserFindUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: ["BasicKYCDetails:approve_kyc:all"],
      });
      mockUserFindMany.mockResolvedValue([
        {
          id: "u1",
          username: "john",
          first_name: "John",
          last_name: "Doe",
          kyc_date: new Date("2026-01-01"),
        },
      ]);
      const res = makeRes();
      await listPendingKycActions(
        makeReq({ user: { userId: "user-1", tenantRole: "employee" } }),
        res,
      );
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
      expect(mockUserFindMany).toHaveBeenCalledWith({
        where: { kyc_approval: "Pending" },
        select: {
          id: true,
          username: true,
          first_name: true,
          last_name: true,
          kyc_date: true,
        },
        orderBy: { kyc_date: "desc" },
      });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        {
          data: [
            expect.objectContaining({
              instanceId: "kyc:u1",
              module: "kyc",
              kycAction: "approve",
              username: "john",
              requestedByName: "John Doe",
              summary: "john submitted their KYC form for approval",
            }),
          ],
        },
      );
    });

    it("returns only Edit Requested items for a caller with request_kyc_revision but not approve_kyc", async () => {
      mockUserFindUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: ["BasicKYCDetails:request_kyc_revision:all"],
      });
      mockUserFindMany.mockResolvedValue([
        {
          id: "u2",
          username: "jane",
          first_name: "Jane",
          last_name: "Roe",
          kyc_edit_request_reason: "Bank account changed",
          kyc_edit_requested_at: new Date("2026-01-02"),
        },
      ]);
      const res = makeRes();
      await listPendingKycActions(
        makeReq({ user: { userId: "user-1", tenantRole: "employee" } }),
        res,
      );
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
      expect(mockUserFindMany).toHaveBeenCalledWith({
        where: { kyc_approval: "Edit Requested" },
        select: {
          id: true,
          username: true,
          first_name: true,
          last_name: true,
          kyc_edit_request_reason: true,
          kyc_edit_requested_at: true,
        },
        orderBy: { kyc_edit_requested_at: "desc" },
      });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        {
          data: [
            expect.objectContaining({
              instanceId: "kyc:u2",
              module: "kyc",
              kycAction: "allow_edit",
              username: "jane",
              requestedByName: "Jane Roe",
              summary:
                "jane requested to edit their approved KYC: Bank account changed",
            }),
          ],
        },
      );
    });

    it("merges both categories for a caller with both permissions, newest first regardless of category", async () => {
      mockUserFindMany
        .mockResolvedValueOnce([
          {
            id: "u1",
            username: "john",
            first_name: "",
            last_name: "",
            kyc_date: new Date("2026-01-01"),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "u2",
            username: "jane",
            first_name: "",
            last_name: "",
            kyc_edit_requested_at: new Date("2026-01-05"),
          },
        ]);
      const res = makeRes();
      await listPendingKycActions(
        makeReq({ user: { userId: "hr-1", tenantRole: "hr" } }),
        res,
      );
      expect(mockUserFindMany).toHaveBeenCalledTimes(2);
      // jane's Edit Requested item is newer than john's Pending submission,
      // so it must come first even though Pending items are queried first.
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        {
          data: [
            expect.objectContaining({
              kycAction: "allow_edit",
              username: "jane",
            }),
            expect.objectContaining({ kycAction: "approve", username: "john" }),
          ],
        },
      );
    });

    it("returns an empty array when permitted but no matching users exist", async () => {
      mockUserFindMany.mockResolvedValue([]);
      const res = makeRes();
      await listPendingKycActions(
        makeReq({ user: { userId: "hr-1", tenantRole: "hr" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        { data: [] },
      );
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockUserFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await listPendingKycActions(
        makeReq({ user: { userId: "hr-1", tenantRole: "hr" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("requestKycEditAccess", () => {
    it("forwards the caller's own userId and reason to the RPC", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Edit access requested" });
      const res = makeRes();
      await requestKycEditAccess(
        makeReq({
          user: { userId: "user-1" },
          body: { reason: "Bank account changed" },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "requestKycEditAccess",
        { userId: "user-1", reason: "Bank account changed" },
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on gRPC error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await requestKycEditAccess(
        makeReq({
          user: { userId: "user-1" },
          body: { reason: "Bank account changed" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("allowKycEdit", () => {
    it("returns BAD_REQUEST when username is missing", async () => {
      const res = makeRes();
      await allowKycEdit(
        makeReq({ user: { userId: "hr-1", tenantRole: "hr" }, body: {} }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns FORBIDDEN when the caller isn't privileged and lacks the request_kyc_revision permission", async () => {
      mockUserFindUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: [],
      });
      const res = makeRes();
      await allowKycEdit(
        makeReq({
          user: { userId: "user-1", tenantRole: "employee" },
          body: { username: "john" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND when the user does not exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await allowKycEdit(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("calls the allowKycEdit RPC with the resolved employeeId", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      mockGrpcCall.mockResolvedValue({ message: "Editing allowed" });
      const res = makeRes();
      await allowKycEdit(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john" },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "allowKycEdit",
        { employeeId: "u1", actorUserId: "hr-1" },
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockUserFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await allowKycEdit(
        makeReq({
          user: { userId: "hr-1", tenantRole: "hr" },
          body: { username: "john" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("viewAllKycs", () => {
    it("returns paginated KYC list", async () => {
      mockUserAggregateRaw
        .mockResolvedValueOnce([{ username: "john", kyc_approval: "Approved" }])
        .mockResolvedValueOnce([{ total: 1 }]);
      const res = makeRes();
      await viewAllKycs(makeReq({ query: { page: "1", limit: "10" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            pagination: expect.objectContaining({
              totalCount: 1,
              totalPages: 1,
            }),
          }),
        }),
      );
    });

    it("returns totalCount 0 when count pipeline returns empty array", async () => {
      mockUserAggregateRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const res = makeRes();
      await viewAllKycs(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data.pagination.totalCount).toBe(0);
    });

    it("caps limit at 100", async () => {
      mockUserAggregateRaw.mockResolvedValue([]);
      const res = makeRes();
      await viewAllKycs(makeReq({ query: { limit: "500" } }), res);
      // Second aggregateRaw call is for count; first is for rows
      const pipeline = mockUserAggregateRaw.mock.calls[0][0].pipeline;
      const limitStage = pipeline.find((s: any) => s.$limit !== undefined);
      expect(limitStage.$limit).toBe(100);
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserAggregateRaw.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await viewAllKycs(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("errors instead of returning unfiltered all-tenant data when tenant context is missing", async () => {
      mockGetTenantId.mockReturnValueOnce(null);
      const res = makeRes();
      await viewAllKycs(makeReq(), res);
      expect(mockUserAggregateRaw).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("self-scopes to the caller's own record when not privileged", async () => {
      mockIsPrivileged.mockResolvedValueOnce(false);
      mockUserAggregateRaw
        .mockResolvedValueOnce([
          { username: "user-1", kyc_approval: "Approved" },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);
      const res = makeRes();
      await viewAllKycs(makeReq({ query: { search: "someone-else" } }), res);
      const pipeline = mockUserAggregateRaw.mock.calls[0][0].pipeline;
      const match = pipeline.find((s: any) => s.$match)?.$match;
      expect(match._id).toEqual({ $oid: "user-1" });
      // search is ignored entirely once self-scoped — no $or clause added
      expect(match.$or).toBeUndefined();
    });
  });

  describe("getKycInsights", () => {
    it("returns KYC stats with completionRate", async () => {
      mockUserAggregateRaw.mockResolvedValue([
        { approved: 8, pending: 2, rejected: 1, total: 11 },
      ]);
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            overview: expect.objectContaining({
              approvedKyc: 8,
              pendingKyc: 2,
              rejectedKyc: 1,
              totalEmployees: 11,
              completionRate: expect.any(Number),
            }),
          }),
        }),
      );
    });

    it("returns zero stats when no rows returned", async () => {
      mockUserAggregateRaw.mockResolvedValue([]);
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data.overview.approvedKyc).toBe(0);
      expect(call[2].data.overview.completionRate).toBe(0);
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserAggregateRaw.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("errors instead of returning unfiltered all-tenant data when tenant context is missing", async () => {
      mockGetTenantId.mockReturnValueOnce(null);
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      expect(mockUserAggregateRaw).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });
});
