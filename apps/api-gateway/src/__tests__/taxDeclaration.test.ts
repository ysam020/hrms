import { prismaWithTenant as prisma } from "@hrms/db";
import {
  getMyDeclaration,
  saveDraftDeclaration,
  submitDeclaration,
  submitDeclarationProofs,
  reviewDeclaration,
  reviewDeclarationProofs,
  getDeclarationForReview,
  listDeclarations,
  getPendingDeclarationActions,
} from "../handlers/taxDeclaration";

jest.mock("@hrms/db", () => {
  const _db: any = {
    taxDeclaration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
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
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).taxDeclaration.findUnique as jest.Mock;
const mockUpsert = (prisma as any).taxDeclaration.upsert as jest.Mock;
const mockUpdate = (prisma as any).taxDeclaration.update as jest.Mock;
const mockFindMany = (prisma as any).taxDeclaration.findMany as jest.Mock;
const mockCount = (prisma as any).taxDeclaration.count as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;

function makeReq(overrides: any = {}) {
  return {
    user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as any;
}

function makeRes() {
  return { json: jest.fn() } as any;
}

describe("taxDeclaration handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requireTenantId guard", () => {
    it("returns FORBIDDEN when the user has no active tenant", async () => {
      const req = makeReq({ user: { userId: "u1", tenantId: null } });
      const res = makeRes();
      await getMyDeclaration(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
      expect(mockFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("getMyDeclaration", () => {
    it("returns the existing declaration for the current FY", async () => {
      mockFindUnique.mockResolvedValue({
        status: "Draft",
        financialYear: "2024-25",
      });
      const req = makeReq({ query: { financialYear: "2024-25" } });
      const res = makeRes();

      await getMyDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "Draft", financialYear: "2024-25" },
        }),
      );
    });

    it("returns a null-status placeholder when no declaration exists yet", async () => {
      mockFindUnique.mockResolvedValue(null);
      const req = makeReq({ query: { financialYear: "2024-25" } });
      const res = makeRes();

      await getMyDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: null, financialYear: "2024-25" },
        }),
      );
    });
  });

  describe("saveDraftDeclaration", () => {
    it("upserts a new draft", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue({ id: "d1", status: "Draft" });
      const req = makeReq({
        body: { financialYear: "2024-25", monthlyRent: 20000, lineItems: [] },
      });
      const res = makeRes();

      await saveDraftDeclaration(req, res);

      expect(mockUpsert).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Draft saved." }),
      );
    });

    it("rejects editing once the declaration has moved past an editable status", async () => {
      mockFindUnique.mockResolvedValue({ status: "Submitted" });
      const req = makeReq({ body: { financialYear: "2024-25" } });
      const res = makeRes();

      await saveDraftDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it.each(["Draft", "RevisionRequested"])(
      "allows editing while status is %s",
      async (status) => {
        mockFindUnique.mockResolvedValue({ status });
        mockUpsert.mockResolvedValue({ id: "d1" });
        const req = makeReq({ body: { financialYear: "2024-25" } });
        const res = makeRes();

        await saveDraftDeclaration(req, res);

        expect(mockUpsert).toHaveBeenCalled();
      },
    );
  });

  describe("submitDeclaration", () => {
    it("returns NOT_FOUND when there is no draft to submit", async () => {
      mockFindUnique.mockResolvedValue(null);
      const req = makeReq({ body: { financialYear: "2024-25" } });
      const res = makeRes();

      await submitDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("returns BAD_REQUEST when the declaration is not in an editable status", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Declared" });
      const req = makeReq({ body: { financialYear: "2024-25" } });
      const res = makeRes();

      await submitDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("moves Draft to Submitted", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Draft" });
      mockUpdate.mockResolvedValue({ id: "d1", status: "Submitted" });
      const req = makeReq({ body: { financialYear: "2024-25" } });
      const res = makeRes();

      await submitDeclaration(req, res);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "Submitted",
          revisionNotes: null,
        }),
      });
    });
  });

  describe("submitDeclarationProofs", () => {
    it("returns NOT_FOUND when there is no declaration for that FY", async () => {
      mockFindUnique.mockResolvedValue(null);
      const req = makeReq({ body: { financialYear: "2024-25" } });
      const res = makeRes();

      await submitDeclarationProofs(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("returns BAD_REQUEST when the declaration hasn't been declared yet", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Draft" });
      const req = makeReq({ body: { financialYear: "2024-25" } });
      const res = makeRes();

      await submitDeclarationProofs(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("merges proof amounts into matching lineItems by code and moves to ProofsSubmitted", async () => {
      mockFindUnique.mockResolvedValue({
        id: "d1",
        status: "Declared",
        lineItems: [
          { code: "80C", amount: 50000 },
          { code: "HRA", amount: 20000 },
        ],
      });
      mockUpdate.mockResolvedValue({ id: "d1", status: "ProofsSubmitted" });
      const req = makeReq({
        body: { financialYear: "2024-25", proofs: { "80C": 45000 } },
      });
      const res = makeRes();

      await submitDeclarationProofs(req, res);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: expect.objectContaining({
          lineItems: [
            { code: "80C", amount: 50000, proofAmount: 45000 },
            { code: "HRA", amount: 20000 },
          ],
          status: "ProofsSubmitted",
        }),
      });
    });
  });

  describe("reviewDeclaration (HR-only)", () => {
    it("returns FORBIDDEN for a plain member with no grant", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: false })
        .mockResolvedValueOnce({ permissions: [] });
      const req = makeReq({ body: { decision: "Declared" } });
      const res = makeRes();

      await reviewDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("allows an owner without an explicit permission grant", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Submitted" });
      mockUpdate.mockResolvedValue({ id: "d1", status: "Declared" });
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "owner" },
        body: { userId: "u1", financialYear: "2024-25", decision: "Declared" },
      });
      const res = makeRes();

      await reviewDeclaration(req, res);

      expect(mockUserFindUnique).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("allows a member holding the explicit TaxDeclaration:review_declaration:all grant", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: false })
        .mockResolvedValueOnce({
          permissions: ["TaxDeclaration:review_declaration:all"],
        });
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Submitted" });
      mockUpdate.mockResolvedValue({ id: "d1", status: "Declared" });
      const req = makeReq({
        body: { userId: "u1", financialYear: "2024-25", decision: "Declared" },
      });
      const res = makeRes();

      await reviewDeclaration(req, res);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("rejects an invalid decision value", async () => {
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "owner" },
        body: { userId: "u1", financialYear: "2024-25", decision: "Nonsense" },
      });
      const res = makeRes();

      await reviewDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("returns BAD_REQUEST when the declaration isn't awaiting review", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Draft" });
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "owner" },
        body: { userId: "u1", financialYear: "2024-25", decision: "Declared" },
      });
      const res = makeRes();

      await reviewDeclaration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("moves Submitted to RevisionRequested with notes", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Submitted" });
      mockUpdate.mockResolvedValue({ id: "d1", status: "RevisionRequested" });
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "owner" },
        body: {
          userId: "u1",
          financialYear: "2024-25",
          decision: "RevisionRequested",
          revisionNotes: { "80C": "Need proof" },
        },
      });
      const res = makeRes();

      await reviewDeclaration(req, res);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: {
          status: "RevisionRequested",
          revisionNotes: { "80C": "Need proof" },
        },
      });
    });
  });

  describe("reviewDeclarationProofs (HR-only)", () => {
    it("returns BAD_REQUEST when the declaration isn't in ProofsSubmitted", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "Declared" });
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "admin" },
        body: { userId: "u1", financialYear: "2024-25", decision: "Verified" },
      });
      const res = makeRes();

      await reviewDeclarationProofs(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("moves ProofsSubmitted to Verified and stamps verifiedBy", async () => {
      mockFindUnique.mockResolvedValue({ id: "d1", status: "ProofsSubmitted" });
      mockUpdate.mockResolvedValue({ id: "d1", status: "Verified" });
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "admin" },
        body: { userId: "u1", financialYear: "2024-25", decision: "Verified" },
      });
      const res = makeRes();

      await reviewDeclarationProofs(req, res);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "Verified",
          verifiedBy: "hr1",
        }),
      });
    });
  });

  describe("getDeclarationForReview", () => {
    it("returns FORBIDDEN when the caller can review neither declarations nor proofs", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: false })
        .mockResolvedValueOnce({ permissions: [] })
        .mockResolvedValueOnce({ isSuperUser: false })
        .mockResolvedValueOnce({ permissions: [] });
      const req = makeReq({ params: { userId: "u2" } });
      const res = makeRes();

      await getDeclarationForReview(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns the declaration with the employee attached for an authorized HR user", async () => {
      mockFindUnique.mockResolvedValue({
        id: "d1",
        userId: "u2",
        status: "Submitted",
      });
      mockUserFindUnique.mockResolvedValue({ id: "u2", username: "jdoe" });
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "hr" },
        params: { userId: "u2" },
        query: { financialYear: "2024-25" },
      });
      const res = makeRes();

      await getDeclarationForReview(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "d1",
            employee: { id: "u2", username: "jdoe" },
          }),
        }),
      );
    });

    it("returns NOT_FOUND when no declaration exists for that employee/FY", async () => {
      mockFindUnique.mockResolvedValue(null);
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "hr" },
        params: { userId: "u2" },
      });
      const res = makeRes();

      await getDeclarationForReview(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });
  });

  describe("listDeclarations", () => {
    it("returns FORBIDDEN for a caller without review permission", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: false })
        .mockResolvedValueOnce({ permissions: [] });
      const req = makeReq();
      const res = makeRes();

      await listDeclarations(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("paginates and filters by status, attaching employee info", async () => {
      mockFindMany.mockResolvedValue([{ id: "d1", userId: "u2" }]);
      mockCount.mockResolvedValue(1);
      mockUserFindMany.mockResolvedValue([{ id: "u2", username: "jdoe" }]);
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "owner" },
        query: {
          financialYear: "2024-25",
          status: "Submitted",
          page: "1",
          limit: "10",
        },
      });
      const res = makeRes();

      await listDeclarations(req, res);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "t1",
            financialYear: "2024-25",
            status: "Submitted",
          },
        }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            {
              id: "d1",
              userId: "u2",
              employee: { id: "u2", username: "jdoe" },
            },
          ],
        }),
      );
    });

    it('does not filter by status when status is "All"', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);
      mockUserFindMany.mockResolvedValue([]);
      const req = makeReq({
        user: { userId: "hr1", tenantId: "t1", tenantRole: "owner" },
        query: { status: "All" },
      });
      const res = makeRes();

      await listDeclarations(req, res);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: "All" }),
        }),
      );
    });
  });

  describe("getPendingDeclarationActions", () => {
    it("only includes the declaration queue when the caller can review declarations but not proofs", async () => {
      // canReviewDeclaration and canReviewProofs are checked concurrently
      // (Promise.all), so the two isSuperUser/permissions lookups interleave
      // rather than resolving in a fixed order — key off the `select` shape
      // instead of call order.
      mockUserFindUnique.mockImplementation(({ select }: any) =>
        select?.isSuperUser
          ? Promise.resolve({ isSuperUser: false })
          : Promise.resolve({
              permissions: ["TaxDeclaration:review_declaration:all"],
            }),
      );
      mockFindMany.mockResolvedValueOnce([
        {
          id: "d1",
          userId: "u2",
          status: "Submitted",
          submittedAt: new Date("2024-01-01"),
        },
      ]);
      mockUserFindMany.mockResolvedValue([
        { id: "u2", username: "jdoe", first_name: "Jane", last_name: "Doe" },
      ]);
      const req = makeReq();
      const res = makeRes();

      await getPendingDeclarationActions(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              userId: "u2",
              stage: "declaration",
              requestedByName: "Jane Doe",
            }),
          ],
        }),
      );
    });

    it("combines and sorts both queues newest-first when the caller can review both", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: true })
        .mockResolvedValueOnce({ isSuperUser: true });
      mockFindMany
        .mockResolvedValueOnce([
          {
            id: "d1",
            userId: "u2",
            status: "Submitted",
            submittedAt: new Date("2024-01-01"),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "d2",
            userId: "u3",
            status: "ProofsSubmitted",
            provenAt: new Date("2024-06-01"),
          },
        ]);
      mockUserFindMany.mockResolvedValue([
        { id: "u2", username: "jdoe" },
        { id: "u3", username: "asmith" },
      ]);
      const req = makeReq();
      const res = makeRes();

      await getPendingDeclarationActions(req, res);

      const data = (res.json.mock.calls[0][0] as any).data;
      expect(data.map((d: any) => d.userId)).toEqual(["u3", "u2"]); // June sorts before January
    });
  });
});
