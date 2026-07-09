import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import type {
  ApprovalContext,
  ApprovalDecision,
  ApprovalModule,
  ActOnStepResult,
  InstantiateApprovalResult,
  PendingApproval,
} from "./types";

// ─── Condition evaluation ──────────────────────────────────────────────────────

function matchesCondition(
  chain: {
    conditionField: string | null;
    conditionOp: string | null;
    conditionValue: unknown;
  },
  context: ApprovalContext,
): boolean {
  if (!chain.conditionField || !chain.conditionOp) return true; // unconditional/default chain
  const actual = context[chain.conditionField];
  if (actual === undefined) return false;
  const expected = chain.conditionValue;
  switch (chain.conditionOp) {
    case "gte":
      return Number(actual) >= Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "eq":
      return actual === expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    default:
      return false;
  }
}

/** Picks the highest-priority active chain whose condition matches, else the unconditional default. */
async function resolveChain(
  tenantId: string,
  module: ApprovalModule,
  context: ApprovalContext,
) {
  const chains = await (prisma as any).approvalChain.findMany({
    where: { tenantId, module, isActive: true },
    orderBy: { priority: "desc" },
  });
  const matched = chains.find(
    (c: any) => c.conditionField && matchesCondition(c, context),
  );
  if (matched) return matched;
  return chains.find((c: any) => !c.conditionField) ?? null;
}

// ─── Approver resolution ────────────────────────────────────────────────────────

/** Requester's team leader, falling back to any owner/admin tenant membership. */
async function resolveReportingManager(
  tenantId: string,
  requestedBy: string,
): Promise<string> {
  const team = await (prisma as any).team.findFirst({
    where: { tenantId, members: { has: requestedBy } },
  });
  if (team?.teamLeaderId && team.teamLeaderId !== requestedBy) {
    return team.teamLeaderId;
  }
  const fallback = await (prisma as any).tenantMembership.findFirst({
    where: { tenantId, role: { in: ["owner", "admin"] } },
    orderBy: { joinedAt: "asc" },
  });
  if (!fallback) {
    throw new Error(
      `No reporting manager or owner/admin found to approve for tenant ${tenantId}.`,
    );
  }
  return fallback.userId;
}

async function resolveStepApprover(
  tenantId: string,
  requestedBy: string,
  step: {
    approverType: string;
    approverUserId: string | null;
    approverRole: string | null;
  },
): Promise<string> {
  switch (step.approverType) {
    case "specific_user":
      if (!step.approverUserId)
        throw new Error("specific_user step missing approverUserId.");
      return step.approverUserId;
    case "role": {
      if (!step.approverRole)
        throw new Error("role step missing approverRole.");
      const member = await (prisma as any).tenantMembership.findFirst({
        where: { tenantId, role: step.approverRole },
        orderBy: { joinedAt: "asc" },
      });
      if (!member) {
        throw new Error(
          `No tenant member with role "${step.approverRole}" found.`,
        );
      }
      return member.userId;
    }
    case "reporting_manager":
    case "team_leader":
    default:
      return resolveReportingManager(tenantId, requestedBy);
  }
}

/** Applies an active date-ranged delegate override on top of a resolved approver, if any. */
async function applyDelegate(
  tenantId: string,
  module: ApprovalModule,
  approverId: string,
): Promise<string> {
  const now = new Date();
  const delegates = await (prisma as any).approvalDelegate.findMany({
    where: {
      tenantId,
      delegatorId: approverId,
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
  if (delegates.length === 0) return approverId;
  const specific = delegates.find((d: any) => d.module === module);
  return (specific ?? delegates[0]).delegateId;
}

async function resolveActiveApprover(
  tenantId: string,
  module: ApprovalModule,
  requestedBy: string,
  step: {
    approverType: string;
    approverUserId: string | null;
    approverRole: string | null;
  } | null,
): Promise<string> {
  const raw = step
    ? await resolveStepApprover(tenantId, requestedBy, step)
    : await resolveReportingManager(tenantId, requestedBy);
  return applyDelegate(tenantId, module, raw);
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Instantiates an approval for a newly-created request. Call this right after
 * creating the owning row (LeaveApplication, Resignation, ...).
 *
 * If the tenant has no configured ApprovalChain for this module, synthesizes a
 * single-step chain resolved to the requester's reporting manager (or an
 * owner/admin) — existing tenants need zero setup and behave exactly as today.
 */
export async function instantiateApproval(
  tenantId: string,
  module: ApprovalModule,
  entityId: string,
  requestedBy: string,
  context: ApprovalContext = {},
): Promise<InstantiateApprovalResult> {
  const chain = await resolveChain(tenantId, module, context);

  const firstStep = chain
    ? await (prisma as any).approvalChainStep.findFirst({
        where: { chainId: chain.id, order: 1 },
      })
    : null;

  const firstApproverId = await resolveActiveApprover(
    tenantId,
    module,
    requestedBy,
    firstStep,
  );

  const instance = await (prisma as any).approvalInstance.create({
    data: {
      tenantId,
      module,
      entityId,
      requestedBy,
      chainId: chain?.id ?? null,
      status: "pending",
      currentStep: 1,
    },
  });

  await (prisma as any).approvalStepInstance.create({
    data: {
      tenantId,
      instanceId: instance.id,
      order: 1,
      resolvedApproverId: firstApproverId,
      status: "pending",
    },
  });

  logger.info("approval-engine: instantiated", {
    tenantId,
    module,
    entityId,
    usedDefaultChain: !chain,
    firstApproverId,
  });

  return { instanceId: instance.id, firstApproverId, usedDefaultChain: !chain };
}

/**
 * Records a decision on the current step of an approval instance.
 *
 * @param allowOverride - when true, skips the "actor must be the resolved
 *   approver" check (callers pass this when the acting user is a tenant
 *   owner/admin, matching today's behavior where any admin can act on any
 *   pending request).
 */
export async function actOnStep(
  instanceId: string,
  actorUserId: string,
  decision: ApprovalDecision,
  comment?: string,
  options: { allowOverride?: boolean } = {},
): Promise<ActOnStepResult> {
  const instance = await (prisma as any).approvalInstance.findUnique({
    where: { id: instanceId },
  });
  if (!instance) throw new Error(`Approval instance ${instanceId} not found.`);
  if (instance.status !== "pending") {
    throw new Error(
      `Approval instance ${instanceId} is already ${instance.status}.`,
    );
  }

  const currentStepInstance = await (
    prisma as any
  ).approvalStepInstance.findFirst({
    where: { instanceId, order: instance.currentStep },
  });
  if (!currentStepInstance) {
    throw new Error(
      `No active step found for approval instance ${instanceId}.`,
    );
  }
  if (
    !options.allowOverride &&
    currentStepInstance.resolvedApproverId !== actorUserId
  ) {
    throw new Error("You are not the approver for this request.");
  }

  await (prisma as any).approvalStepInstance.update({
    where: { id: currentStepInstance.id },
    data: {
      status: decision,
      actedAt: new Date(),
      comment: comment ?? null,
    },
  });

  if (decision === "rejected") {
    await (prisma as any).approvalInstance.update({
      where: { id: instanceId },
      data: { status: "rejected" },
    });
    return { instanceId, decision, isFinal: true, finalStatus: "rejected" };
  }

  // Approved this step — is there a next step in the chain template?
  const nextChainStep = instance.chainId
    ? await (prisma as any).approvalChainStep.findFirst({
        where: { chainId: instance.chainId, order: instance.currentStep + 1 },
      })
    : null;

  if (!nextChainStep) {
    await (prisma as any).approvalInstance.update({
      where: { id: instanceId },
      data: { status: "approved" },
    });
    return { instanceId, decision, isFinal: true, finalStatus: "approved" };
  }

  // Resolve the next step's approver now (not upfront) so delegate overrides
  // reflect who is actually out-of-office by the time the chain reaches them.
  // Reporting-manager-type steps resolve relative to the original requester
  // (instance.requestedBy), not whoever just acted on the previous step.
  const nextApproverId = await resolveActiveApprover(
    instance.tenantId,
    instance.module,
    instance.requestedBy,
    nextChainStep,
  );

  await (prisma as any).approvalStepInstance.create({
    data: {
      tenantId: instance.tenantId,
      instanceId,
      order: instance.currentStep + 1,
      resolvedApproverId: nextApproverId,
      status: "pending",
    },
  });
  await (prisma as any).approvalInstance.update({
    where: { id: instanceId },
    data: { currentStep: instance.currentStep + 1 },
  });

  return { instanceId, decision, isFinal: false, nextApproverId };
}

/** All approvals currently awaiting action from this user, across every module. */
export async function getPendingApprovalsFor(
  tenantId: string,
  userId: string,
): Promise<PendingApproval[]> {
  const steps = await (prisma as any).approvalStepInstance.findMany({
    where: { tenantId, resolvedApproverId: userId, status: "pending" },
  });
  if (steps.length === 0) return [];

  const instances = await (prisma as any).approvalInstance.findMany({
    where: {
      id: { in: steps.map((s: any) => s.instanceId) },
      status: "pending",
    },
  });
  const instanceById = new Map(instances.map((i: any) => [i.id, i]));

  return steps
    .filter((s: any) => {
      const instance = instanceById.get(s.instanceId) as any;
      return instance && instance.currentStep === s.order;
    })
    .map((s: any) => {
      const instance = instanceById.get(s.instanceId) as any;
      return {
        instanceId: s.instanceId,
        module: instance.module,
        entityId: instance.entityId,
        stepOrder: s.order,
      };
    });
}

/** Cancels an in-flight approval (e.g. the requester withdrew the request). */
export async function cancelApproval(instanceId: string): Promise<void> {
  await (prisma as any).approvalInstance.update({
    where: { id: instanceId },
    data: { status: "cancelled" },
  });
}
