import { prismaWithTenant as prisma } from "@hrms/db";
import {
  instantiateApproval,
  actOnStep,
  getPendingApprovalsFor,
  cancelApproval,
} from "../engine";

jest.mock("@hrms/db", () => {
  const _db: any = {
    approvalChain: { findMany: jest.fn() },
    approvalChainStep: { findFirst: jest.fn() },
    team: { findFirst: jest.fn() },
    tenantMembership: { findFirst: jest.fn() },
    approvalDelegate: { findMany: jest.fn() },
    approvalInstance: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    approvalStepInstance: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return { prismaWithTenant: _db };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const db = prisma as any;

describe("approval-engine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── instantiateApproval (covers resolveChain, matchesCondition, resolveReportingManager, resolveStepApprover, applyDelegate indirectly) ───

  describe("instantiateApproval", () => {
    it("uses the highest-priority chain whose condition matches over a lower-priority match", async () => {
      db.approvalChain.findMany.mockResolvedValue([
        {
          id: "chain-high",
          priority: 10,
          conditionField: "days",
          conditionOp: "gte",
          conditionValue: 3,
        },
        {
          id: "chain-low",
          priority: 1,
          conditionField: "days",
          conditionOp: "gte",
          conditionValue: 1,
        },
      ]);
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "specific_user",
        approverUserId: "approver-1",
        approverRole: null,
      });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      // findMany is mocked to return chains already "ordered by priority desc"
      // as the real Prisma call would; find() picks the first match.
      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
        { days: 5 },
      );

      expect(db.approvalChainStep.findFirst).toHaveBeenCalledWith({
        where: { chainId: "chain-high", order: 1 },
      });
      expect(result.firstApproverId).toBe("approver-1");
      expect(result.usedDefaultChain).toBe(false);
    });

    it("falls back to the unconditional default chain when no conditional chain matches", async () => {
      db.approvalChain.findMany.mockResolvedValue([
        {
          id: "chain-cond",
          priority: 10,
          conditionField: "days",
          conditionOp: "gte",
          conditionValue: 100,
        },
        {
          id: "chain-default",
          priority: 0,
          conditionField: null,
          conditionOp: null,
          conditionValue: null,
        },
      ]);
      db.approvalChainStep.findFirst.mockResolvedValue(null);
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue(null);
      db.tenantMembership.findFirst.mockResolvedValue({ userId: "owner-1" });
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
        {
          days: 5,
        },
      );

      expect(result.usedDefaultChain).toBe(false); // a chain (the default one) was found, just unconditional
      expect(result.firstApproverId).toBe("owner-1");
    });

    it("synthesizes a default reporting-manager chain when the tenant has no chains configured", async () => {
      db.approvalChain.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "leader-1",
        members: ["req-1"],
      });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
      );

      expect(db.approvalChainStep.findFirst).not.toHaveBeenCalled();
      expect(result.usedDefaultChain).toBe(true);
      expect(result.firstApproverId).toBe("leader-1");
    });

    it("falls back to owner/admin when requester's team leader is the requester themself", async () => {
      db.approvalChain.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "req-1",
        members: ["req-1"],
      });
      db.tenantMembership.findFirst.mockResolvedValue({ userId: "admin-1" });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
      );

      expect(result.firstApproverId).toBe("admin-1");
    });

    it("throws when there is no team leader and no owner/admin fallback", async () => {
      db.approvalChain.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue(null);
      db.tenantMembership.findFirst.mockResolvedValue(null);

      await expect(
        instantiateApproval("t1", "leave", "leave-1", "req-1"),
      ).rejects.toThrow(/No reporting manager or owner\/admin found/);
    });

    it("resolves a role-type step approver via earliest-joined tenant member with that role", async () => {
      db.approvalChain.findMany.mockResolvedValue([
        { id: "chain-1", priority: 0, conditionField: null, conditionOp: null },
      ]);
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "role",
        approverUserId: null,
        approverRole: "hr",
      });
      db.tenantMembership.findFirst.mockResolvedValue({ userId: "hr-user-1" });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
      );

      expect(db.tenantMembership.findFirst).toHaveBeenCalledWith({
        where: { tenantId: "t1", role: "hr" },
        orderBy: { joinedAt: "asc" },
      });
      expect(result.firstApproverId).toBe("hr-user-1");
    });

    it("throws for a role step when no tenant member has that role", async () => {
      db.approvalChain.findMany.mockResolvedValue([
        { id: "chain-1", priority: 0, conditionField: null, conditionOp: null },
      ]);
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "role",
        approverUserId: null,
        approverRole: "finance",
      });
      db.tenantMembership.findFirst.mockResolvedValue(null);

      await expect(
        instantiateApproval("t1", "leave", "leave-1", "req-1"),
      ).rejects.toThrow(/No tenant member with role "finance"/);
    });

    it("throws for a specific_user step missing approverUserId", async () => {
      db.approvalChain.findMany.mockResolvedValue([
        { id: "chain-1", priority: 0, conditionField: null, conditionOp: null },
      ]);
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "specific_user",
        approverUserId: null,
        approverRole: null,
      });

      await expect(
        instantiateApproval("t1", "leave", "leave-1", "req-1"),
      ).rejects.toThrow(/specific_user step missing approverUserId/);
    });

    it("applies a module-specific delegate over a generic delegate", async () => {
      db.approvalChain.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "leader-1",
        members: ["req-1"],
      });
      db.approvalDelegate.findMany.mockResolvedValue([
        { module: null, delegateId: "generic-delegate" },
        { module: "leave", delegateId: "leave-delegate" },
      ]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
      );

      expect(result.firstApproverId).toBe("leave-delegate");
    });

    it("applies the generic delegate when no module-specific delegate exists", async () => {
      db.approvalChain.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "leader-1",
        members: ["req-1"],
      });
      db.approvalDelegate.findMany.mockResolvedValue([
        { module: "resignation", delegateId: "resignation-delegate" },
      ]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
      );

      expect(result.firstApproverId).toBe("resignation-delegate");
    });

    it("uses the raw approver when no active delegate is found", async () => {
      db.approvalChain.findMany.mockResolvedValue([]);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "leader-1",
        members: ["req-1"],
      });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });

      const result = await instantiateApproval(
        "t1",
        "leave",
        "leave-1",
        "req-1",
      );

      expect(result.firstApproverId).toBe("leader-1");
    });
  });

  // ─── matchesCondition operators, exercised via resolveChain/instantiateApproval ───

  describe("condition matching operators", () => {
    const setupSingleChain = (conditionOp: string, conditionValue: unknown) => {
      db.approvalChain.findMany.mockResolvedValue([
        {
          id: "chain-1",
          priority: 0,
          conditionField: "days",
          conditionOp,
          conditionValue,
        },
      ]);
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "specific_user",
        approverUserId: "approver-1",
        approverRole: null,
      });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalInstance.create.mockResolvedValue({ id: "inst-1" });
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-1" });
    };

    it("matches lte", async () => {
      setupSingleChain("lte", 5);
      const result = await instantiateApproval("t1", "leave", "l1", "req-1", {
        days: 3,
      });
      expect(result.firstApproverId).toBe("approver-1");
    });

    it("matches eq", async () => {
      setupSingleChain("eq", "urgent");
      const result = await instantiateApproval("t1", "leave", "l1", "req-1", {
        days: "urgent",
      });
      expect(result.firstApproverId).toBe("approver-1");
    });

    it("matches in", async () => {
      setupSingleChain("in", ["urgent", "critical"]);
      const result = await instantiateApproval("t1", "leave", "l1", "req-1", {
        days: "critical",
      });
      expect(result.firstApproverId).toBe("approver-1");
    });

    it("does not match an unknown operator and falls through to default (no chain found → synthesized)", async () => {
      setupSingleChain("unknown_op", 5);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "leader-1",
        members: ["req-1"],
      });
      const result = await instantiateApproval("t1", "leave", "l1", "req-1", {
        days: 5,
      });
      // conditional chain doesn't match (unknown op), no unconditional chain
      // exists either, so instantiateApproval synthesizes a default chain
      expect(result.usedDefaultChain).toBe(true);
      expect(result.firstApproverId).toBe("leader-1");
    });

    it("does not match when the context field is undefined", async () => {
      setupSingleChain("gte", 1);
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "leader-1",
        members: ["req-1"],
      });
      const result = await instantiateApproval(
        "t1",
        "leave",
        "l1",
        "req-1",
        {},
      );
      expect(result.usedDefaultChain).toBe(true);
    });
  });

  // ─── actOnStep ───

  describe("actOnStep", () => {
    it("throws when the instance does not exist", async () => {
      db.approvalInstance.findUnique.mockResolvedValue(null);
      await expect(actOnStep("inst-1", "user-1", "approved")).rejects.toThrow(
        /not found/,
      );
    });

    it("throws when the instance is already decided", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "approved",
      });
      await expect(actOnStep("inst-1", "user-1", "approved")).rejects.toThrow(
        /already approved/,
      );
    });

    it("throws when there is no active step", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
      });
      db.approvalStepInstance.findFirst.mockResolvedValue(null);
      await expect(actOnStep("inst-1", "user-1", "approved")).rejects.toThrow(
        /No active step found/,
      );
    });

    it("throws when the actor is not the resolved approver and override is not set", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      await expect(
        actOnStep("inst-1", "someone-else", "approved"),
      ).rejects.toThrow(/not the approver/);
      expect(db.approvalStepInstance.update).not.toHaveBeenCalled();
    });

    it("allows a non-approver actor when allowOverride is set", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
        chainId: null,
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      db.approvalStepInstance.update.mockResolvedValue({});
      db.approvalInstance.update.mockResolvedValue({});

      const result = await actOnStep(
        "inst-1",
        "admin-override",
        "approved",
        undefined,
        { allowOverride: true },
      );

      expect(result.isFinal).toBe(true);
      expect(result.finalStatus).toBe("approved");
    });

    it("marks the instance rejected and returns final=true on rejection", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
        chainId: "chain-1",
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      db.approvalStepInstance.update.mockResolvedValue({});
      db.approvalInstance.update.mockResolvedValue({});

      const result = await actOnStep("inst-1", "approver-1", "rejected", "no");

      expect(db.approvalInstance.update).toHaveBeenCalledWith({
        where: { id: "inst-1" },
        data: { status: "rejected" },
      });
      expect(result).toEqual({
        instanceId: "inst-1",
        decision: "rejected",
        isFinal: true,
        finalStatus: "rejected",
      });
      expect(db.approvalChainStep.findFirst).not.toHaveBeenCalled();
    });

    it("finalizes as approved when there is no next chain step", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
        chainId: "chain-1",
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      db.approvalStepInstance.update.mockResolvedValue({});
      db.approvalChainStep.findFirst.mockResolvedValue(null);
      db.approvalInstance.update.mockResolvedValue({});

      const result = await actOnStep("inst-1", "approver-1", "approved");

      expect(db.approvalInstance.update).toHaveBeenCalledWith({
        where: { id: "inst-1" },
        data: { status: "approved" },
      });
      expect(result).toEqual({
        instanceId: "inst-1",
        decision: "approved",
        isFinal: true,
        finalStatus: "approved",
      });
    });

    it("finalizes as approved when the instance has no chainId at all (synthesized single-step chain)", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
        chainId: null,
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      db.approvalStepInstance.update.mockResolvedValue({});
      db.approvalInstance.update.mockResolvedValue({});

      const result = await actOnStep("inst-1", "approver-1", "approved");

      expect(db.approvalChainStep.findFirst).not.toHaveBeenCalled();
      expect(result.isFinal).toBe(true);
      expect(result.finalStatus).toBe("approved");
    });

    it("advances to the next step, resolving its approver fresh, when a next chain step exists", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
        chainId: "chain-1",
        tenantId: "t1",
        module: "leave",
        requestedBy: "req-1",
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      db.approvalStepInstance.update.mockResolvedValue({});
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "specific_user",
        approverUserId: "approver-2",
        approverRole: null,
      });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-2" });
      db.approvalInstance.update.mockResolvedValue({});

      const result = await actOnStep("inst-1", "approver-1", "approved");

      expect(db.approvalStepInstance.create).toHaveBeenCalledWith({
        data: {
          tenantId: "t1",
          instanceId: "inst-1",
          order: 2,
          resolvedApproverId: "approver-2",
          status: "pending",
        },
      });
      expect(db.approvalInstance.update).toHaveBeenCalledWith({
        where: { id: "inst-1" },
        data: { currentStep: 2 },
      });
      expect(result).toEqual({
        instanceId: "inst-1",
        decision: "approved",
        isFinal: false,
        nextApproverId: "approver-2",
      });
    });

    it("resolves a reporting_manager-type next step relative to the original requester, not the acting approver", async () => {
      db.approvalInstance.findUnique.mockResolvedValue({
        id: "inst-1",
        status: "pending",
        currentStep: 1,
        chainId: "chain-1",
        tenantId: "t1",
        module: "leave",
        requestedBy: "original-requester",
      });
      db.approvalStepInstance.findFirst.mockResolvedValue({
        id: "step-1",
        resolvedApproverId: "approver-1",
      });
      db.approvalStepInstance.update.mockResolvedValue({});
      db.approvalChainStep.findFirst.mockResolvedValue({
        approverType: "reporting_manager",
        approverUserId: null,
        approverRole: null,
      });
      db.team.findFirst.mockResolvedValue({
        teamLeaderId: "requester-manager",
        members: ["original-requester"],
      });
      db.approvalDelegate.findMany.mockResolvedValue([]);
      db.approvalStepInstance.create.mockResolvedValue({ id: "step-2" });
      db.approvalInstance.update.mockResolvedValue({});

      await actOnStep("inst-1", "approver-1", "approved");

      expect(db.team.findFirst).toHaveBeenCalledWith({
        where: { tenantId: "t1", members: { has: "original-requester" } },
      });
    });
  });

  // ─── getPendingApprovalsFor ───

  describe("getPendingApprovalsFor", () => {
    it("returns an empty array when the user has no pending steps", async () => {
      db.approvalStepInstance.findMany.mockResolvedValue([]);
      const result = await getPendingApprovalsFor("t1", "user-1");
      expect(result).toEqual([]);
      expect(db.approvalInstance.findMany).not.toHaveBeenCalled();
    });

    it("only includes steps whose order matches the instance's current step", async () => {
      db.approvalStepInstance.findMany.mockResolvedValue([
        { instanceId: "inst-1", order: 1 },
        { instanceId: "inst-2", order: 1 }, // stale: instance has since advanced past order 1
      ]);
      db.approvalInstance.findMany.mockResolvedValue([
        { id: "inst-1", module: "leave", entityId: "leave-1", currentStep: 1 },
        {
          id: "inst-2",
          module: "resignation",
          entityId: "res-1",
          currentStep: 2,
        },
      ]);

      const result = await getPendingApprovalsFor("t1", "user-1");

      expect(result).toEqual([
        {
          instanceId: "inst-1",
          module: "leave",
          entityId: "leave-1",
          stepOrder: 1,
        },
      ]);
    });
  });

  // ─── cancelApproval ───

  describe("cancelApproval", () => {
    it("updates the instance status to cancelled", async () => {
      db.approvalInstance.update.mockResolvedValue({});
      await cancelApproval("inst-1");
      expect(db.approvalInstance.update).toHaveBeenCalledWith({
        where: { id: "inst-1" },
        data: { status: "cancelled" },
      });
    });
  });
});
