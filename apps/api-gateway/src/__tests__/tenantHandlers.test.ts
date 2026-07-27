jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    tenant: { findFirst: jest.fn(), findUnique: jest.fn() },
    tenantJoinRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    tenantMembership: { findFirst: jest.fn(), create: jest.fn() },
    jobApplication: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return {
    prisma: _db,
    // jobApplication is a "business model" routed to the tenant-specific
    // physical DB via prismaWithTenant in real code (see
    // packages/database/src/prismaWithTenant.ts) — aliased to the same mock
    // object here so tests can assert against it either way.
    prismaWithTenant: _db,
    Prisma: { PrismaClientKnownRequestError: class extends Error {} },
    getClientForDb: jest.fn(),
    canonicalizeEmail: (e: string) => e.toLowerCase(),
    getEmailDomain: (e: string) => e.split("@")[1] ?? "",
    isPublicEmailDomain: jest.fn().mockReturnValue(false),
    runWithTenant: jest.fn((_ctx: any, fn: any) => fn()),
    recordAuditEntry: jest.fn(),
    AuditActor: {},
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CREATED: 201,
    FORBIDDEN: 403,
    CONFLICT: 409,
    UN_AUTHORIZED: 401,
    INTERNAL_SERVER_ERROR: 500,
  },
  sendEmail: jest.fn(),
  tenantFrom: jest.fn((name: string) => `"${name}" <hr@praesto.cloud>`),
  tenantReplyTo: jest.fn((helpEmail?: string | null) => helpEmail || undefined),
  PLATFORM_FROM: '"Praesto" <hr@praesto.cloud>',
  renderEmailHtml: jest.fn(
    ({ bodyHtml }: { bodyHtml: string }) => `<html>${bodyHtml}</html>`,
  ),
  // Real implementation — canApproveJoinRequests depends on real owner/admin
  // role gating, not a stub.
  hasPrivilegedRole: jest.requireActual("@hrms/common").hasPrivilegedRole,
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("../handlers/salary", () => ({
  seedSalaryFromHire: jest.fn(),
}));

import { prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS, sendEmail } from "@hrms/common";
import { notify } from "@hrms/notifications";
import { logger } from "@hrms/logger";
import { seedSalaryFromHire } from "../handlers/salary";
import { approveJoinRequest, rejectJoinRequest } from "../handlers/tenant";

const mockApiResponse = apiResponse as jest.Mock;
const mockNotify = notify as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;
const mockSeedSalaryFromHire = seedSalaryFromHire as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserUpdate = (prisma as any).user.update as jest.Mock;
const mockUserCount = (prisma as any).user.count as jest.Mock;
const mockJoinRequestFindUnique = (prisma as any).tenantJoinRequest
  .findUnique as jest.Mock;
const mockJoinRequestUpdate = (prisma as any).tenantJoinRequest
  .update as jest.Mock;
const mockMembershipFindFirst = (prisma as any).tenantMembership
  .findFirst as jest.Mock;
const mockMembershipCreate = (prisma as any).tenantMembership
  .create as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockJobAppFindUnique = (prisma as any).jobApplication
  .findUnique as jest.Mock;
const mockJobAppUpdate = (prisma as any).jobApplication.update as jest.Mock;
const mockJobAppFindMany = (prisma as any).jobApplication.findMany as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "hr-1", tenantId: "t1", tenantRole: "admin" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("tenantHandlers — join requests / hired-candidate linking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: [],
    });
    mockTenantFindUnique.mockResolvedValue({
      name: "Acme Corp",
      helpEmail: "hr@acme.example",
    });
    mockMembershipFindFirst.mockResolvedValue(null);
    mockMembershipCreate.mockResolvedValue({});
    mockJoinRequestUpdate.mockResolvedValue({});
    // Well under the starter tier's 25-employee limit — getSeatStatus's
    // guard passes by default so existing approval tests aren't affected;
    // the seat-limit-specific test below overrides this to exercise the guard.
    mockUserCount.mockResolvedValue(5);
  });

  describe("approveJoinRequest", () => {
    const pendingRequest = {
      id: "jr-1",
      tenantId: "t1",
      userId: "u1",
      email: "jane@acme.example",
      status: "pending",
    };

    it("approves without linking when no jobApplicationId is supplied and no candidate's assignedOfficialEmail matches the requester's email", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      mockJobAppFindMany.mockResolvedValue([]);
      const res = makeRes();
      await approveJoinRequest(makeReq({ params: { id: "jr-1" } }), res);

      // Still attempts the silent exact-email lookup — it just finds nothing.
      // Regression: `userId` must NOT be in this WHERE clause — Prisma's
      // MongoDB connector doesn't match `{ userId: null }` against documents
      // where the field is entirely absent (as it always is here, since
      // applyForJob never sets it), confirmed against the real Atlas
      // cluster. userId is filtered in JS after fetching instead.
      expect(mockJobAppFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "t1",
            status: "Hired",
            assignedOfficialEmail: "jane@acme.example",
          },
        }),
      );
      const calledWhere = mockJobAppFindMany.mock.calls[0][0].where;
      expect(calledWhere).not.toHaveProperty("userId");
      expect(mockMembershipCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: "t1", userId: "u1" }),
        }),
      );
      expect(mockJobAppUpdate).not.toHaveBeenCalled();
      expect(mockSeedSalaryFromHire).not.toHaveBeenCalled();
      // Even with no linked JobApplication at all, approval still flips the
      // user to Active — this must not be nested inside the linking block.
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { employeeStatus: "Active" },
      });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            status: "approved",
            linkedJobApplicationId: null,
            salarySeeded: false,
          }),
        }),
      );
    });

    it("rejects approval when the starter tier's employee limit is already reached", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      // tenant.findUnique has no planTier in this mock's default shape,
      // which getSeatStatus treats as the "starter" default (limit 25).
      mockUserCount.mockResolvedValue(25);
      const res = makeRes();
      await approveJoinRequest(makeReq({ params: { id: "jr-1" } }), res);

      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.objectContaining({ code: "SEAT_LIMIT_REACHED" }),
      );
      expect(mockMembershipCreate).not.toHaveBeenCalled();
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("silently links via an exact assignedOfficialEmail match when no jobApplicationId is provided (no dropdown, no HR pick)", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      // userId absent from the mock row entirely (not set to null) — mirrors
      // the real shape (applyForJob never writes it) that the previous
      // `{ userId: null }` WHERE-clause bug failed to match.
      mockJobAppFindMany.mockResolvedValue([
        {
          id: "app-auto",
          email: "geeta@candidate.example",
          hireSalary: 1200000,
          hireJoiningDate: new Date("2026-08-01"),
        },
      ]);
      mockSeedSalaryFromHire.mockResolvedValue(true);
      const res = makeRes();
      await approveJoinRequest(makeReq({ params: { id: "jr-1" } }), res);

      expect(mockJobAppUpdate).toHaveBeenCalledWith({
        where: { id: "app-auto" },
        data: { userId: "u1" },
      });
      // personalEmail and joining_date are copied onto the User record in
      // the same update — joining_date is what the Headcount Growth
      // analytics chart reads, so this must never be skipped.
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: {
          personalEmail: "geeta@candidate.example",
          joining_date: new Date("2026-08-01"),
        },
      });
      expect(mockSeedSalaryFromHire).toHaveBeenCalledWith(
        "u1",
        "t1",
        1200000,
        expect.any(Date),
        undefined,
      );
      // Approval always flips the linked user to Active, independent of
      // whatever the personalEmail/joining_date sync call above sets.
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { employeeStatus: "Active" },
      });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            linkedJobApplicationId: "app-auto",
            salarySeeded: true,
          }),
        }),
      );
    });

    it("skips an already-linked candidate sharing the same assignedOfficialEmail and picks the still-unlinked one", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      mockJobAppFindMany.mockResolvedValue([
        {
          id: "app-already-linked",
          userId: "someone-else",
          email: "geeta@candidate.example",
          hireSalary: 1200000,
          hireJoiningDate: new Date("2026-08-01"),
        },
        {
          id: "app-still-open",
          email: "geeta@candidate.example",
          hireSalary: 1300000,
          hireJoiningDate: new Date("2026-09-01"),
        },
      ]);
      mockSeedSalaryFromHire.mockResolvedValue(true);
      const res = makeRes();
      await approveJoinRequest(makeReq({ params: { id: "jr-1" } }), res);

      expect(mockJobAppUpdate).toHaveBeenCalledWith({
        where: { id: "app-still-open" },
        data: { userId: "u1" },
      });
    });

    it("sends the approval email via notify() with the joinRequestApproved event, not raw sendEmail", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      await approveJoinRequest(makeReq({ params: { id: "jr-1" } }), makeRes());

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t1",
          event: "joinRequestApproved",
          email: expect.objectContaining({ to: "jane@acme.example" }),
        }),
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("links a valid Hired, unlinked jobApplicationId and seeds salary", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      const components = [
        { code: "BASIC", name: "Basic Pay", type: "earning", amount: 50000 },
      ];
      mockJobAppFindUnique.mockResolvedValue({
        tenantId: "t1",
        status: "Hired",
        userId: null,
        email: "geeta@candidate.example",
        hireSalary: 1200000,
        hireJoiningDate: new Date("2026-08-01"),
        hireSalaryComponents: components,
      });
      mockSeedSalaryFromHire.mockResolvedValue(true);
      const res = makeRes();
      await approveJoinRequest(
        makeReq({
          params: { id: "jr-1" },
          body: { jobApplicationId: "app-1" },
        }),
        res,
      );

      expect(mockJobAppUpdate).toHaveBeenCalledWith({
        where: { id: "app-1" },
        data: { userId: "u1" },
      });
      // The pre-hire personal email and joining date are preserved on the
      // account itself — User.email is the login/company identity, and
      // joining_date is what the Headcount Growth analytics chart reads,
      // so without this copy neither is visible from the employee record.
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: {
          personalEmail: "geeta@candidate.example",
          joining_date: new Date("2026-08-01"),
        },
      });
      expect(mockSeedSalaryFromHire).toHaveBeenCalledWith(
        "u1",
        "t1",
        1200000,
        expect.any(Date),
        components,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            linkedJobApplicationId: "app-1",
            salarySeeded: true,
          }),
        }),
      );
    });

    it("rejects with BAD_REQUEST and does not touch membership when jobApplicationId is already linked to another account", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      mockJobAppFindUnique.mockResolvedValue({
        tenantId: "t1",
        status: "Hired",
        userId: "someone-else",
        hireSalary: 1200000,
        hireJoiningDate: null,
      });
      const res = makeRes();
      await approveJoinRequest(
        makeReq({
          params: { id: "jr-1" },
          body: { jobApplicationId: "app-1" },
        }),
        res,
      );

      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockJobAppUpdate).not.toHaveBeenCalled();
      expect(mockMembershipCreate).not.toHaveBeenCalled();
      expect(mockJoinRequestUpdate).not.toHaveBeenCalled();
    });

    it("rejects with BAD_REQUEST when the jobApplicationId belongs to a different tenant", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      mockJobAppFindUnique.mockResolvedValue({
        tenantId: "other-tenant",
        status: "Hired",
        userId: null,
        hireSalary: 1200000,
        hireJoiningDate: null,
      });
      const res = makeRes();
      await approveJoinRequest(
        makeReq({
          params: { id: "jr-1" },
          body: { jobApplicationId: "app-1" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("still approves successfully (salarySeeded: false) when seedSalaryFromHire fails", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      mockJobAppFindUnique.mockResolvedValue({
        tenantId: "t1",
        status: "Hired",
        userId: null,
        hireSalary: 1200000,
        hireJoiningDate: null,
      });
      mockSeedSalaryFromHire.mockResolvedValue(false);
      const res = makeRes();
      await approveJoinRequest(
        makeReq({
          params: { id: "jr-1" },
          body: { jobApplicationId: "app-1" },
        }),
        res,
      );

      expect(mockMembershipCreate).toHaveBeenCalled();
      expect(mockJoinRequestUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ salarySeeded: false }),
        }),
      );
      // A failed seed must not just vanish into an INFO-level line the
      // approver never sees — it has to be loud enough for someone to
      // actually go fix the salary structure by hand.
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("salary seeding failed"),
        expect.objectContaining({ jobApplicationId: "app-1" }),
      );
    });

    it("returns FORBIDDEN for a caller without approve-join-requests access", async () => {
      mockJoinRequestFindUnique.mockResolvedValue(pendingRequest);
      const res = makeRes();
      await approveJoinRequest(
        makeReq({
          user: { userId: "u2", tenantId: "t1", tenantRole: "member" },
          params: { id: "jr-1" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
      expect(mockMembershipCreate).not.toHaveBeenCalled();
    });
  });

  describe("rejectJoinRequest", () => {
    it("sends the rejection email via notify() with the joinRequestRejected event, not raw sendEmail", async () => {
      mockJoinRequestFindUnique.mockResolvedValue({
        id: "jr-1",
        tenantId: "t1",
        userId: "u1",
        email: "jane@acme.example",
        status: "pending",
      });
      await rejectJoinRequest(
        makeReq({ params: { id: "jr-1" }, body: { reason: "not a match" } }),
        makeRes(),
      );

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t1",
          event: "joinRequestRejected",
          email: expect.objectContaining({ to: "jane@acme.example" }),
        }),
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
