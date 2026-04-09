import { prisma } from "@hrms/db";
import {
  getHrActivities,
  getHrActivity,
  addHrActivity,
  editHrActivity,
  deleteHrActivity,
  getRules,
  createRule,
  updateRule,
  deleteRule,
  updateRuleStatus,
  testRule,
  getPolicies,
  createOrUpdatePolicy,
  getPolicy,
  updatePolicy,
  deletePolicy,
  isSuperuser,
} from "../handlers/hrm";

jest.mock("jspdf", () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    internal: {
      pageSize: {
        getWidth: jest.fn().mockReturnValue(210),
        getHeight: jest.fn().mockReturnValue(297),
      },
      getNumberOfPages: jest.fn().mockReturnValue(2),
    },
    setFillColor: jest.fn(),
    setTextColor: jest.fn(),
    setFontSize: jest.fn(),
    setFont: jest.fn(),
    setDrawColor: jest.fn(),
    setLineWidth: jest.fn(),
    setPage: jest.fn(),
    text: jest.fn(),
    rect: jest.fn(),
    circle: jest.fn(),
    line: jest.fn(),
    lines: jest.fn(),
    addPage: jest.fn(),
    splitTextToSize: jest.fn().mockReturnValue([]),
    output: jest.fn().mockReturnValue(new ArrayBuffer(8)),
  })),
}));

jest.mock("../grpc/clients", () => ({
  hrmClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => ({
  prisma: {
    hrActivity: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rule: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policy: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
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

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockActivityFindMany = (prisma as any).hrActivity.findMany as jest.Mock;
const mockActivityCount = (prisma as any).hrActivity.count as jest.Mock;
const mockActivityFindUnique = (prisma as any).hrActivity
  .findUnique as jest.Mock;
const mockActivityUpdate = (prisma as any).hrActivity.update as jest.Mock;
const mockRuleFindMany = (prisma as any).rule.findMany as jest.Mock;
const mockRuleCount = (prisma as any).rule.count as jest.Mock;
const mockRuleCreate = (prisma as any).rule.create as jest.Mock;
const mockRuleUpdate = (prisma as any).rule.update as jest.Mock;
const mockRuleDelete = (prisma as any).rule.delete as jest.Mock;
const mockPolicyFindMany = (prisma as any).policy.findMany as jest.Mock;
const mockPolicyCount = (prisma as any).policy.count as jest.Mock;
const mockPolicyFindFirst = (prisma as any).policy.findFirst as jest.Mock;
const mockPolicyFindUnique = (prisma as any).policy.findUnique as jest.Mock;
const mockPolicyCreate = (prisma as any).policy.create as jest.Mock;
const mockPolicyUpdate = (prisma as any).policy.update as jest.Mock;

const makeRes = () =>
  ({
    json: jest.fn(),
    set: jest.fn(),
    send: jest.fn().mockReturnThis(),
  }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("hrmHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cacheManager.get as jest.Mock).mockResolvedValue(null);
    (cacheManager.set as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.delete as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
  });

  describe("getHrActivities", () => {
    it("returns paginated activities with default status filter", async () => {
      mockActivityFindMany.mockResolvedValue([
        {
          id: "a1",
          title: "Workshop",
          status: "Active",
          createdOn: new Date(),
          lastUpdatedOn: null,
        },
      ]);
      mockActivityCount.mockResolvedValue(1);
      const res = makeRes();
      await getHrActivities(makeReq({ query: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            pagination: expect.objectContaining({ totalCount: 1 }),
          }),
        }),
      );
    });

    it("filters by status when provided", async () => {
      mockActivityFindMany.mockResolvedValue([]);
      mockActivityCount.mockResolvedValue(0);
      const res = makeRes();
      await getHrActivities(makeReq({ query: { status: "Completed" } }), res);
      const whereArg = mockActivityFindMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe("Completed");
    });

    it("shows all non-deleted when status=all", async () => {
      mockActivityFindMany.mockResolvedValue([]);
      mockActivityCount.mockResolvedValue(0);
      const res = makeRes();
      await getHrActivities(makeReq({ query: { status: "all" } }), res);
      const whereArg = mockActivityFindMany.mock.calls[0][0].where;
      // status filter for "all" means where.status = { not: "deleted" }
      expect(whereArg.status).toEqual({ not: "deleted" });
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockActivityFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getHrActivities(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getHrActivity", () => {
    it("calls grpcCall getHrActivity with id from params", async () => {
      mockGrpcCall.mockResolvedValue({ data: {} });
      const res = makeRes();
      await getHrActivity(makeReq({ params: { _id: "a1" } }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "getHrActivity",
        expect.objectContaining({ id: "a1" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("addHrActivity", () => {
    it("calls grpcCall createHrActivity with body and createdBy", async () => {
      mockGrpcCall.mockResolvedValue({ data: {} });
      const res = makeRes();
      await addHrActivity(
        makeReq({ body: { title: "Workshop", date: "2024-03-15" } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "createHrActivity",
        expect.objectContaining({ title: "Workshop", createdBy: "user-1" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("editHrActivity", () => {
    it("calls grpcCall updateHrActivity with body, id, and updatedBy", async () => {
      mockGrpcCall.mockResolvedValue({ data: {} });
      const res = makeRes();
      await editHrActivity(
        makeReq({ params: { _id: "a1" }, body: { title: "Updated Workshop" } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "updateHrActivity",
        expect.objectContaining({
          id: "a1",
          title: "Updated Workshop",
          updatedBy: "user-1",
        }),
      );
    });
  });

  describe("deleteHrActivity", () => {
    it("returns NOT_FOUND when activity does not exist", async () => {
      mockActivityFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteHrActivity(makeReq({ params: { _id: "a-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("soft-deletes activity by setting status to deleted", async () => {
      mockActivityFindUnique.mockResolvedValue({ id: "a1", title: "Workshop" });
      mockActivityUpdate.mockResolvedValue({});
      const res = makeRes();
      await deleteHrActivity(makeReq({ params: { _id: "a1" } }), res);
      expect(mockActivityUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "a1" },
          data: expect.objectContaining({ status: "deleted" }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("getRules", () => {
    it("returns paginated rules", async () => {
      mockRuleFindMany.mockResolvedValue([
        { id: "r1", name: "Leave Rule", _id: "r1" },
      ]);
      mockRuleCount.mockResolvedValue(1);
      const res = makeRes();
      await getRules(makeReq({ query: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ total: 1 }),
      );
    });

    it("filters by category when provided", async () => {
      mockRuleFindMany.mockResolvedValue([]);
      mockRuleCount.mockResolvedValue(0);
      const res = makeRes();
      await getRules(makeReq({ query: { category: "leave" } }), res);
      const whereArg = mockRuleFindMany.mock.calls[0][0].where;
      expect(whereArg.category).toBe("leave");
    });

    it("does not filter by category when category=all", async () => {
      mockRuleFindMany.mockResolvedValue([]);
      mockRuleCount.mockResolvedValue(0);
      const res = makeRes();
      await getRules(makeReq({ query: { category: "all" } }), res);
      const whereArg = mockRuleFindMany.mock.calls[0][0].where;
      expect(whereArg.category).toBeUndefined();
    });

    it("caps limit at 200", async () => {
      mockRuleFindMany.mockResolvedValue([]);
      mockRuleCount.mockResolvedValue(0);
      const res = makeRes();
      await getRules(makeReq({ query: { limit: "500" } }), res);
      const takeArg = mockRuleFindMany.mock.calls[0][0].take;
      expect(takeArg).toBe(200);
    });
  });

  describe("createRule", () => {
    it("creates rule with provided fields and defaults", async () => {
      const newRule = {
        id: "r1",
        name: "Attendance Rule",
        category: "attendance",
        status: "draft",
        priority: 0,
        tags: [],
      };
      mockRuleCreate.mockResolvedValue(newRule);
      const res = makeRes();
      await createRule(
        makeReq({ body: { name: "Attendance Rule", category: "attendance" } }),
        res,
      );
      expect(mockRuleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Attendance Rule",
            category: "attendance",
            status: "draft",
            priority: 0,
            tags: [],
            createdBy: "user-1",
          }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockRuleCreate.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await createRule(
        makeReq({ body: { name: "Rule", category: "leave" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("updateRule", () => {
    it("updates allowed fields and returns updated rule", async () => {
      const updated = {
        id: "r1",
        name: "Updated Rule",
        category: "leave",
        status: "active",
        priority: 1,
        tags: [],
      };
      mockRuleUpdate.mockResolvedValue(updated);
      const res = makeRes();
      await updateRule(
        makeReq({
          params: { id: "r1" },
          body: { name: "Updated Rule", status: "active" },
        }),
        res,
      );
      expect(mockRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r1" },
          data: expect.objectContaining({
            name: "Updated Rule",
            status: "active",
          }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("deleteRule", () => {
    it("deletes rule and returns SUCCESS", async () => {
      mockRuleDelete.mockResolvedValue({});
      const res = makeRes();
      await deleteRule(makeReq({ params: { id: "r1" } }), res);
      expect(mockRuleDelete).toHaveBeenCalledWith({ where: { id: "r1" } });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR when delete fails", async () => {
      mockRuleDelete.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await deleteRule(makeReq({ params: { id: "r1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("updateRuleStatus", () => {
    it("updates rule status and returns SUCCESS", async () => {
      mockRuleUpdate.mockResolvedValue({ id: "r1", status: "active" });
      const res = makeRes();
      await updateRuleStatus(
        makeReq({ params: { id: "r1" }, body: { status: "active" } }),
        res,
      );
      expect(mockRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r1" },
          data: expect.objectContaining({ status: "active" }),
        }),
      );
    });
  });

  describe("testRule", () => {
    it("returns BAD_REQUEST when rule or testData missing", async () => {
      const res = makeRes();
      await testRule(makeReq({ body: { rule: {} } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("evaluates equals condition correctly", async () => {
      const res = makeRes();
      await testRule(
        makeReq({
          body: {
            rule: {
              conditions: [
                { field: "department", operator: "equals", value: "HR" },
              ],
              conditionLogic: "AND",
              actions: ["notify"],
            },
            testData: { department: "HR" },
          },
        }),
        res,
      );
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data.triggered).toBe(true);
      expect(call[2].data.actions).toEqual(["notify"]);
    });

    it("evaluates greater_than condition correctly", async () => {
      const res = makeRes();
      await testRule(
        makeReq({
          body: {
            rule: {
              conditions: [
                { field: "leaves", operator: "greater_than", value: "5" },
              ],
              conditionLogic: "AND",
            },
            testData: { leaves: "10" },
          },
        }),
        res,
      );
      expect(mockApiResponse.mock.calls[0][2].data.triggered).toBe(true);
    });

    it("evaluates OR logic — passes if any condition passes", async () => {
      const res = makeRes();
      await testRule(
        makeReq({
          body: {
            rule: {
              conditions: [
                { field: "dept", operator: "equals", value: "HR" },
                { field: "dept", operator: "equals", value: "Finance" },
              ],
              conditionLogic: "OR",
            },
            testData: { dept: "HR" },
          },
        }),
        res,
      );
      expect(mockApiResponse.mock.calls[0][2].data.triggered).toBe(true);
    });

    it("returns triggered=false when no conditions", async () => {
      const res = makeRes();
      await testRule(
        makeReq({
          body: {
            rule: { conditions: [], conditionLogic: "AND" },
            testData: {},
          },
        }),
        res,
      );
      expect(mockApiResponse.mock.calls[0][2].data.triggered).toBe(false);
    });

    it("evaluates between condition correctly", async () => {
      const res = makeRes();
      await testRule(
        makeReq({
          body: {
            rule: {
              conditions: [
                {
                  field: "age",
                  operator: "between",
                  value: "20",
                  valueTo: "30",
                },
              ],
              conditionLogic: "AND",
            },
            testData: { age: "25" },
          },
        }),
        res,
      );
      expect(mockApiResponse.mock.calls[0][2].data.triggered).toBe(true);
    });
  });

  describe("getPolicies", () => {
    it("returns paginated non-deleted policies", async () => {
      mockPolicyFindMany.mockResolvedValue([
        {
          id: "p1",
          policyType: "Leave",
          policyName: "Leave Policy",
          content: "",
          status: "active",
          createdOn: new Date(),
        },
      ]);
      mockPolicyCount.mockResolvedValue(1);
      const res = makeRes();
      await getPolicies(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ total: 1 }),
      );
      // Verify category and title are mapped
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data[0].category).toBe("Leave");
      expect(call[2].data[0].title).toBe("Leave Policy");
    });

    it("excludes deleted/Deleted policies", async () => {
      mockPolicyFindMany.mockResolvedValue([]);
      mockPolicyCount.mockResolvedValue(0);
      const res = makeRes();
      await getPolicies(makeReq(), res);
      const whereArg = mockPolicyFindMany.mock.calls[0][0].where;
      expect(whereArg.status.notIn).toContain("deleted");
      expect(whereArg.status.notIn).toContain("Deleted");
    });
  });

  describe("createOrUpdatePolicy", () => {
    it("returns BAD_REQUEST when policyType or content missing", async () => {
      const res = makeRes();
      await createOrUpdatePolicy(
        makeReq({ body: { policyType: "Leave" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("updates existing policy when found", async () => {
      mockPolicyFindFirst.mockResolvedValue({
        id: "p1",
        policyName: "Leave Policy",
      });
      mockPolicyUpdate.mockResolvedValue({ id: "p1" });
      const res = makeRes();
      await createOrUpdatePolicy(
        makeReq({
          body: {
            policyType: "Leave",
            policyName: "Leave Policy",
            content: "<p>New content</p>",
          },
        }),
        res,
      );
      expect(mockPolicyUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("creates new policy when none exists", async () => {
      mockPolicyFindFirst.mockResolvedValue(null);
      mockPolicyCreate.mockResolvedValue({ id: "p2" });
      const res = makeRes();
      await createOrUpdatePolicy(
        makeReq({
          body: {
            policyType: "Attendance",
            content: "<p>Attendance policy</p>",
          },
        }),
        res,
      );
      expect(mockPolicyCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            policyType: "Attendance",
            status: "active",
          }),
        }),
      );
    });
  });

  describe("getPolicy", () => {
    it("calls grpcCall getPolicy with id", async () => {
      mockGrpcCall.mockResolvedValue({ data: {} });
      const res = makeRes();
      await getPolicy(makeReq({ params: { id: "p1" } }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "getPolicy",
        expect.objectContaining({ id: "p1" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("updatePolicy", () => {
    it("updates policy fields and returns SUCCESS", async () => {
      mockPolicyUpdate.mockResolvedValue({ id: "p1" });
      const res = makeRes();
      await updatePolicy(
        makeReq({
          params: { id: "p1" },
          body: { policyName: "New Name", content: "<p>Updated</p>" },
        }),
        res,
      );
      expect(mockPolicyUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: expect.objectContaining({
            policyName: "New Name",
            content: "<p>Updated</p>",
          }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("deletePolicy", () => {
    it("soft-deletes policy by setting status to Deleted", async () => {
      mockPolicyUpdate.mockResolvedValue({});
      const res = makeRes();
      await deletePolicy(makeReq({ params: { id: "p1" } }), res);
      expect(mockPolicyUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: { status: "Deleted" },
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("isSuperuser", () => {
    it("calls grpcCall checkPermission with username as userId", async () => {
      mockGrpcCall.mockResolvedValue({ allowed: true });
      const res = makeRes();
      await isSuperuser(makeReq({ params: { username: "alice" } }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "checkPermission",
        expect.objectContaining({
          userId: "alice",
          resource: "superuser",
          action: "access",
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });
});
