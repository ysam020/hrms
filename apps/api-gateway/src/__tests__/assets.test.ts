import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import { getNotificationQueue } from "@hrms/queue";
import {
  createAsset,
  listAssets,
  getAsset,
  updateAsset,
  assignAsset,
  returnAsset,
  retireAsset,
  acknowledgeAssignment,
  reportAssetIssue,
  listAssetIssues,
  getAssetIssue,
  updateAssetIssueStatus,
  getAssetSummary,
  listAssetCategories,
  createAssetCategory,
} from "../handlers/assets";

jest.mock("@hrms/db", () => {
  const _db: any = {
    asset: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    assetAssignment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    assetIssue: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    assetCategory: { findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    tenantMembership: { findMany: jest.fn() },
  };
  return { prismaWithTenant: _db, getTenantId: jest.fn(() => "t1") };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../utils/webhookEmitter", () => ({
  emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(() => ({ add: mockQueueAdd })),
}));

const db: any = prisma;

function makeReq(overrides: any = {}) {
  return {
    user: { userId: "u1", tenantId: "t1", tenantRole: "hr" },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}
function makeRes() {
  return { json: jest.fn() } as any;
}
const EMPLOYEE = {
  user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
};

describe("assets handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: [],
    });
  });

  describe("createAsset", () => {
    it("rejects a non-HR employee", async () => {
      const req = makeReq(EMPLOYEE);
      const res = makeRes();
      await createAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("allows a member with the explicit Assets:manage permission grant", async () => {
      db.user.findUnique.mockResolvedValue({
        isSuperUser: false,
        permissions: ["Assets:manage"],
      });
      db.asset.create.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      const req = makeReq({
        ...EMPLOYEE,
        body: { assetCode: "lap-01", name: "Laptop", category: "IT" },
      });
      const res = makeRes();
      await createAsset(req, res);
      expect(db.asset.create).toHaveBeenCalled();
    });

    it("uppercases the asset code on create", async () => {
      db.asset.create.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      const req = makeReq({
        body: { assetCode: "lap-01", name: "Laptop", category: "IT" },
      });
      const res = makeRes();
      await createAsset(req, res);
      expect(db.asset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ assetCode: "LAP-01", createdBy: "u1" }),
      });
    });
  });

  describe("listAssets", () => {
    it("restricts a non-HR employee to their own currently-assigned assets", async () => {
      db.assetAssignment.findMany.mockResolvedValue([{ assetId: "a1" }]);
      db.asset.findMany.mockResolvedValue([]);
      db.asset.count.mockResolvedValue(0);
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq(EMPLOYEE);
      const res = makeRes();

      await listAssets(req, res);

      expect(db.assetAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "u1" }),
        }),
      );
      expect(db.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ["a1"] } }),
        }),
      );
    });

    it("enriches results with the current holder's identity", async () => {
      db.asset.findMany.mockResolvedValue([
        { id: "a1", assignments: [{ userId: "u2", returnedOn: null }] },
      ]);
      db.asset.count.mockResolvedValue(1);
      db.user.findMany.mockResolvedValue([{ id: "u2", username: "jdoe" }]);
      const req = makeReq({ query: { search: "lap" } });
      const res = makeRes();

      await listAssets(req, res);

      const data = (res.json.mock.calls[0][0] as any).data;
      expect(data[0].currentHolder).toEqual({ id: "u2", username: "jdoe" });
      expect(data[0].assignments).toBeUndefined();
    });
  });

  describe("getAsset", () => {
    it("returns NOT_FOUND for a missing asset", async () => {
      db.asset.findUnique.mockResolvedValue(null);
      const req = makeReq({ params: { assetId: "a1" } });
      const res = makeRes();
      await getAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("forbids a non-HR employee who doesn't currently hold the asset", async () => {
      db.asset.findUnique.mockResolvedValue({
        id: "a1",
        assignments: [{ userId: "someone-else", returnedOn: null }],
      });
      const req = makeReq({ ...EMPLOYEE, params: { assetId: "a1" } });
      const res = makeRes();
      await getAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("allows the current holder to view their own asset", async () => {
      db.asset.findUnique.mockResolvedValue({
        id: "a1",
        assignments: [{ userId: "u1", assignedBy: "hr1", returnedOn: null }],
      });
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq({ ...EMPLOYEE, params: { assetId: "a1" } });
      const res = makeRes();
      await getAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    });
  });

  describe("updateAsset", () => {
    it("returns NOT_FOUND for a missing asset", async () => {
      db.asset.findUnique.mockResolvedValue(null);
      const req = makeReq({ params: { assetId: "a1" } });
      const res = makeRes();
      await updateAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("blocks marking an assigned asset available directly", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "assigned" });
      const req = makeReq({
        params: { assetId: "a1" },
        body: { status: "available" },
      });
      const res = makeRes();
      await updateAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("return endpoint"),
        }),
      );
      expect(db.asset.update).not.toHaveBeenCalled();
    });

    it("blocks any status change on a retired asset", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "retired" });
      const req = makeReq({
        params: { assetId: "a1" },
        body: { status: "maintenance" },
      });
      const res = makeRes();
      await updateAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("applies only the fields present in the body", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "available" });
      db.asset.update.mockResolvedValue({ id: "a1" });
      const req = makeReq({
        params: { assetId: "a1" },
        body: { condition: "fair" },
      });
      const res = makeRes();
      await updateAsset(req, res);
      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { condition: "fair" },
      });
    });
  });

  describe("assignAsset", () => {
    const body = { assetId: "a1", userId: "u2" };

    it("returns NOT_FOUND when the target employee doesn't exist", async () => {
      db.user.findUnique.mockResolvedValue(null);
      const req = makeReq({ body });
      const res = makeRes();
      await assignAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("rejects assigning to an inactive employee", async () => {
      db.user.findUnique.mockResolvedValue({
        id: "u2",
        username: "jdoe",
        employeeStatus: "Inactive",
      });
      const req = makeReq({ body });
      const res = makeRes();
      await assignAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("returns NOT_FOUND for a missing asset", async () => {
      db.user.findUnique.mockResolvedValue({
        id: "u2",
        username: "jdoe",
        employeeStatus: "Active",
      });
      db.asset.findUnique.mockResolvedValue(null);
      const req = makeReq({ body });
      const res = makeRes();
      await assignAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("returns CONFLICT when the asset isn't available", async () => {
      db.user.findUnique.mockResolvedValue({
        id: "u2",
        username: "jdoe",
        employeeStatus: "Active",
      });
      db.asset.findUnique.mockResolvedValue({
        id: "a1",
        status: "maintenance",
      });
      const req = makeReq({ body });
      const res = makeRes();
      await assignAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
    });

    it("returns CONFLICT when a concurrent assign already flipped the asset (race-condition guard)", async () => {
      db.user.findUnique.mockResolvedValue({
        id: "u2",
        username: "jdoe",
        employeeStatus: "Active",
      });
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "available" });
      db.asset.updateMany.mockResolvedValue({ count: 0 });
      const req = makeReq({ body });
      const res = makeRes();
      await assignAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 409,
          message: expect.stringContaining("just assigned"),
        }),
      );
      expect(db.assetAssignment.create).not.toHaveBeenCalled();
    });

    it("assigns the asset and emits a webhook on success", async () => {
      db.user.findUnique.mockResolvedValue({
        id: "u2",
        username: "jdoe",
        employeeStatus: "Active",
      });
      db.asset.findUnique.mockResolvedValue({
        id: "a1",
        status: "available",
        assetCode: "LAP-01",
        condition: "good",
      });
      db.asset.updateMany.mockResolvedValue({ count: 1 });
      db.assetAssignment.create.mockResolvedValue({});
      const req = makeReq({ body });
      const res = makeRes();

      await assignAsset(req, res);

      expect(db.assetAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: "a1",
          userId: "u2",
          assignedBy: "u1",
          returnedOn: null,
          acknowledgedAt: null,
        }),
      });
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "asset.assigned",
        expect.objectContaining({ assetId: "a1", assignedTo: "jdoe" }),
      );
    });
  });

  describe("returnAsset", () => {
    it("returns NOT_FOUND for a missing asset", async () => {
      db.asset.findUnique.mockResolvedValue(null);
      const req = makeReq({ body: { assetId: "a1", conditionIn: "good" } });
      const res = makeRes();
      await returnAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("rejects returning an asset that isn't currently assigned", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "available" });
      const req = makeReq({ body: { assetId: "a1", conditionIn: "good" } });
      const res = makeRes();
      await returnAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("returns NOT_FOUND when no active assignment record can be found (data inconsistency)", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "assigned" });
      db.assetAssignment.findFirst.mockResolvedValue(null);
      const req = makeReq({ body: { assetId: "a1", conditionIn: "good" } });
      const res = makeRes();
      await returnAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("sends a damaged return to maintenance instead of available", async () => {
      db.asset.findUnique.mockResolvedValue({
        id: "a1",
        status: "assigned",
        assetCode: "LAP-01",
      });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" });
      db.assetAssignment.update.mockResolvedValue({});
      db.asset.update.mockResolvedValue({});
      const req = makeReq({ body: { assetId: "a1", conditionIn: "damaged" } });
      const res = makeRes();

      await returnAsset(req, res);

      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { status: "maintenance", condition: "damaged" },
      });
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "asset.returned",
        expect.objectContaining({ assetId: "a1", conditionIn: "damaged" }),
      );
    });

    it("frees a good-condition return back to available", async () => {
      db.asset.findUnique.mockResolvedValue({
        id: "a1",
        status: "assigned",
        assetCode: "LAP-01",
      });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" });
      db.assetAssignment.update.mockResolvedValue({});
      db.asset.update.mockResolvedValue({});
      const req = makeReq({ body: { assetId: "a1", conditionIn: "good" } });
      const res = makeRes();

      await returnAsset(req, res);

      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { status: "available", condition: "good" },
      });
    });
  });

  describe("retireAsset", () => {
    it("returns NOT_FOUND for a missing asset", async () => {
      db.asset.findUnique.mockResolvedValue(null);
      const req = makeReq({ params: { assetId: "a1" } });
      const res = makeRes();
      await retireAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("returns CONFLICT when the asset is currently assigned", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "assigned" });
      const req = makeReq({ params: { assetId: "a1" } });
      const res = makeRes();
      await retireAsset(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
      expect(db.asset.update).not.toHaveBeenCalled();
    });

    it("retires an unassigned asset", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", status: "available" });
      db.asset.update.mockResolvedValue({});
      const req = makeReq({ params: { assetId: "a1" } });
      const res = makeRes();
      await retireAsset(req, res);
      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { status: "retired" },
      });
    });
  });

  describe("acknowledgeAssignment", () => {
    it("returns NOT_FOUND for a missing assignment", async () => {
      db.assetAssignment.findUnique.mockResolvedValue(null);
      const req = makeReq({ params: { assignmentId: "as1" } });
      const res = makeRes();
      await acknowledgeAssignment(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("forbids acknowledging someone else's assignment", async () => {
      db.assetAssignment.findUnique.mockResolvedValue({
        id: "as1",
        userId: "someone-else",
      });
      const req = makeReq({ params: { assignmentId: "as1" } });
      const res = makeRes();
      await acknowledgeAssignment(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns CONFLICT when already acknowledged", async () => {
      db.assetAssignment.findUnique.mockResolvedValue({
        id: "as1",
        userId: "u1",
        acknowledgedAt: new Date(),
      });
      const req = makeReq({ params: { assignmentId: "as1" } });
      const res = makeRes();
      await acknowledgeAssignment(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
    });

    it("rejects acknowledging a returned assignment", async () => {
      db.assetAssignment.findUnique.mockResolvedValue({
        id: "as1",
        userId: "u1",
        acknowledgedAt: null,
        returnedOn: new Date(),
      });
      const req = makeReq({ params: { assignmentId: "as1" } });
      const res = makeRes();
      await acknowledgeAssignment(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("acknowledges receipt on the happy path", async () => {
      db.assetAssignment.findUnique.mockResolvedValue({
        id: "as1",
        userId: "u1",
        acknowledgedAt: null,
        returnedOn: null,
      });
      db.assetAssignment.update.mockResolvedValue({});
      const req = makeReq({
        params: { assignmentId: "as1" },
        body: { note: "all good" },
      });
      const res = makeRes();
      await acknowledgeAssignment(req, res);
      expect(db.assetAssignment.update).toHaveBeenCalledWith({
        where: { id: "as1" },
        data: {
          acknowledgedAt: expect.any(Date),
          acknowledgedNote: "all good",
        },
      });
    });
  });

  describe("reportAssetIssue", () => {
    const body = {
      assetId: "a1",
      type: "damage",
      title: "Cracked screen",
      description: "Dropped it",
    };

    it("returns NOT_FOUND for a missing asset", async () => {
      db.asset.findUnique.mockResolvedValue(null);
      const req = makeReq({ ...EMPLOYEE, body });
      const res = makeRes();
      await reportAssetIssue(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("forbids a non-HR employee who doesn't currently hold the asset", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue(null);
      const req = makeReq({ ...EMPLOYEE, body });
      const res = makeRes();
      await reportAssetIssue(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns CONFLICT for a duplicate open issue of the same type", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" });
      db.assetIssue.findFirst.mockResolvedValue({ id: "existing-issue" });
      const req = makeReq({ ...EMPLOYEE, body });
      const res = makeRes();
      await reportAssetIssue(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
      expect(db.assetIssue.create).not.toHaveBeenCalled();
    });

    it("creates the issue and emits a webhook on success", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" });
      db.assetIssue.findFirst.mockResolvedValue(null);
      db.assetIssue.create.mockResolvedValue({
        id: "issue1",
        priority: "medium",
      });
      db.tenantMembership.findMany.mockResolvedValue([]);
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq({ ...EMPLOYEE, body });
      const res = makeRes();

      await reportAssetIssue(req, res);

      expect(db.assetIssue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: "a1",
          assignmentId: "as1",
          reportedBy: "u1",
          type: "damage",
        }),
      });
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "asset.issue_reported",
        expect.objectContaining({ issueId: "issue1" }),
      );
    });

    it("allows an HR user to report an issue without holding the asset", async () => {
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue(null);
      db.assetIssue.findFirst.mockResolvedValue(null);
      db.assetIssue.create.mockResolvedValue({
        id: "issue1",
        priority: "medium",
      });
      db.tenantMembership.findMany.mockResolvedValue([]);
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq({ body }); // default req is HR
      const res = makeRes();
      await reportAssetIssue(req, res);
      expect(db.assetIssue.create).toHaveBeenCalled();
    });
  });

  describe("listAssetIssues", () => {
    it("scopes a non-HR employee to only their own reported issues", async () => {
      db.assetIssue.findMany.mockResolvedValue([]);
      db.assetIssue.count.mockResolvedValue(0);
      db.asset.findMany.mockResolvedValue([]);
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq(EMPLOYEE);
      const res = makeRes();
      await listAssetIssues(req, res);
      expect(db.assetIssue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reportedBy: "u1" }),
        }),
      );
    });

    it("returns all issues for HR with no reportedBy filter", async () => {
      db.assetIssue.findMany.mockResolvedValue([]);
      db.assetIssue.count.mockResolvedValue(0);
      db.asset.findMany.mockResolvedValue([]);
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq({ query: { status: "open" } });
      const res = makeRes();
      await listAssetIssues(req, res);
      expect(db.assetIssue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "open" } }),
      );
    });
  });

  describe("getAssetIssue", () => {
    it("returns NOT_FOUND for a missing issue", async () => {
      db.assetIssue.findUnique.mockResolvedValue(null);
      const req = makeReq({ params: { issueId: "i1" } });
      const res = makeRes();
      await getAssetIssue(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("forbids a non-HR employee viewing someone else's issue", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        reportedBy: "someone-else",
        assetId: "a1",
      });
      const req = makeReq({ ...EMPLOYEE, params: { issueId: "i1" } });
      const res = makeRes();
      await getAssetIssue(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("allows the reporter to view their own issue", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        reportedBy: "u1",
        assetId: "a1",
      });
      db.asset.findUnique.mockResolvedValue({ id: "a1" });
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq({ ...EMPLOYEE, params: { issueId: "i1" } });
      const res = makeRes();
      await getAssetIssue(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    });
  });

  describe("updateAssetIssueStatus", () => {
    it("rejects a non-HR employee", async () => {
      const req = makeReq({
        ...EMPLOYEE,
        params: { issueId: "i1" },
        body: { status: "in_review" },
      });
      const res = makeRes();
      await updateAssetIssueStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns NOT_FOUND for a missing issue", async () => {
      db.assetIssue.findUnique.mockResolvedValue(null);
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "in_review" },
      });
      const res = makeRes();
      await updateAssetIssueStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("rejects a disallowed status transition", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        status: "open",
        type: "damage",
      });
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "resolved" },
      });
      const res = makeRes();
      await updateAssetIssueStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("Cannot transition"),
        }),
      );
      expect(db.assetIssue.update).not.toHaveBeenCalled();
    });

    it("moves open to in_review, stamping the reviewer", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        status: "open",
        type: "damage",
      });
      db.assetIssue.update.mockResolvedValue({});
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "in_review" },
      });
      const res = makeRes();
      await updateAssetIssueStatus(req, res);
      expect(db.assetIssue.update).toHaveBeenCalledWith({
        where: { id: "i1" },
        data: expect.objectContaining({
          status: "in_review",
          reviewedBy: "u1",
        }),
      });
    });

    it("retires the asset and closes the assignment when a lost issue is resolved", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        status: "approved",
        type: "lost",
        assetId: "a1",
        assignmentId: "as1",
      });
      db.assetIssue.update.mockResolvedValue({});
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" }); // still current
      db.asset.update.mockResolvedValue({});
      db.assetAssignment.update.mockResolvedValue({});
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "resolved" },
      });
      const res = makeRes();

      await updateAssetIssueStatus(req, res);

      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { status: "retired" },
      });
      expect(db.assetAssignment.update).toHaveBeenCalledWith({
        where: { id: "as1" },
        data: expect.objectContaining({ conditionIn: "damaged" }),
      });
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "asset.retired",
        expect.objectContaining({ assetId: "a1", reason: "lost" }),
      );
    });

    it("sends the asset to maintenance when a damage issue is resolved", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        status: "approved",
        type: "damage",
        assetId: "a1",
        assignmentId: "as1",
      });
      db.assetIssue.update.mockResolvedValue({});
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" });
      db.asset.update.mockResolvedValue({});
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "resolved" },
      });
      const res = makeRes();

      await updateAssetIssueStatus(req, res);

      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { status: "maintenance", condition: "damaged" },
      });
    });

    it("closes the assignment and frees the asset when a return_request issue is resolved", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        status: "approved",
        type: "return_request",
        assetId: "a1",
        assignmentId: "as1",
      });
      db.assetIssue.update.mockResolvedValue({});
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as1" });
      db.asset.update.mockResolvedValue({});
      db.assetAssignment.update.mockResolvedValue({});
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "resolved" },
      });
      const res = makeRes();

      await updateAssetIssueStatus(req, res);

      expect(db.asset.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { status: "available" },
      });
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "asset.returned",
        expect.objectContaining({ via: "return_request" }),
      );
    });

    it("skips auto-effects when the asset has since been returned/reassigned to a different assignment", async () => {
      db.assetIssue.findUnique.mockResolvedValue({
        id: "i1",
        status: "approved",
        type: "damage",
        assetId: "a1",
        assignmentId: "as1",
      });
      db.assetIssue.update.mockResolvedValue({});
      db.asset.findUnique.mockResolvedValue({ id: "a1", assetCode: "LAP-01" });
      db.assetAssignment.findFirst.mockResolvedValue({ id: "as2" }); // different assignment now current
      const req = makeReq({
        params: { issueId: "i1" },
        body: { status: "resolved" },
      });
      const res = makeRes();

      await updateAssetIssueStatus(req, res);

      expect(db.asset.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("effect was skipped"),
        }),
      );
    });
  });

  describe("getAssetSummary", () => {
    it("rejects a non-HR employee", async () => {
      const req = makeReq(EMPLOYEE);
      const res = makeRes();
      await getAssetSummary(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("aggregates counts by status and category", async () => {
      db.asset.findMany.mockResolvedValue([
        { status: "available", category: "IT" },
        { status: "available", category: "IT" },
        { status: "assigned", category: "Furniture" },
      ]);
      db.assetIssue.count.mockResolvedValue(2);
      db.assetAssignment.count.mockResolvedValue(1);
      const req = makeReq();
      const res = makeRes();

      await getAssetSummary(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total: 3,
            byStatus: { available: 2, assigned: 1 },
            byCategory: { IT: 2, Furniture: 1 },
            openIssues: 2,
            pendingAcks: 1,
          }),
        }),
      );
    });
  });

  describe("asset categories", () => {
    it("lists active categories ordered by name", async () => {
      db.assetCategory.findMany.mockResolvedValue([]);
      const req = makeReq();
      const res = makeRes();
      await listAssetCategories(req, res);
      expect(db.assetCategory.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
    });

    it("rejects a non-HR employee creating a category", async () => {
      const req = makeReq(EMPLOYEE);
      const res = makeRes();
      await createAssetCategory(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns FORBIDDEN without an active tenant", async () => {
      (getTenantId as jest.Mock).mockReturnValueOnce(null);
      const req = makeReq({ body: { name: "IT" } });
      const res = makeRes();
      await createAssetCategory(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("trims the category name on create", async () => {
      db.assetCategory.create.mockResolvedValue({ id: "cat1", name: "IT" });
      const req = makeReq({ body: { name: "  IT  " } });
      const res = makeRes();
      await createAssetCategory(req, res);
      expect(db.assetCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "IT" }),
      });
    });

    it("treats a duplicate category (P2002) as a success, not an error", async () => {
      db.assetCategory.create.mockRejectedValue({ code: "P2002" });
      const req = makeReq({ body: { name: "IT" } });
      const res = makeRes();
      await createAssetCategory(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          message: "Asset category already exists",
        }),
      );
    });
  });
});
