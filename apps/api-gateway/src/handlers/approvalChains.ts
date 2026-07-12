import { Response } from "express";
import { recruitment } from "@hrms/proto";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import {
  actOnStep,
  getPendingApprovalsFor,
  type ApprovalDecision,
  type ActOnStepResult,
} from "@hrms/approval-engine";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";
import { leaveClient, recruitmentClient, grpcCall } from "../grpc/clients";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { getWorkingDays, isHoliday, eachDate } from "../utils/workingDays";
import { getActiveSettings } from "./tenantSettings";

dayjs.extend(utc);

export async function isPrivileged(req: AuthRequest): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  const superUser = await isSuperUser(userId);
  return superUser || ["owner", "admin"].includes(tenantRole ?? "");
}

function requireTenantId(req: AuthRequest, res: Response): string | null {
  const { tenantId } = req.user!;
  if (!tenantId) {
    apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
    return null;
  }
  return tenantId;
}

// ─── Approval Chains ────────────────────────────────────────────────────────

/** GET /approval-chains?module=leave */
export async function listApprovalChains(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { module } = req.query as { module?: string };
    const chains = await (prisma as any).approvalChain.findMany({
      where: { tenantId, ...(module ? { module } : {}) },
      orderBy: [{ module: "asc" }, { priority: "desc" }],
    });
    const steps = await (prisma as any).approvalChainStep.findMany({
      where: { chainId: { in: chains.map((c: any) => c.id) } },
      orderBy: { order: "asc" },
    });
    const stepsByChain = new Map<string, any[]>();
    for (const s of steps) {
      const list = stepsByChain.get(s.chainId) ?? [];
      list.push(s);
      stepsByChain.set(s.chainId, list);
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: chains.map((c: any) => ({
        ...c,
        steps: stepsByChain.get(c.id) ?? [],
      })),
    });
  } catch (error: unknown) {
    logger.error("listApprovalChains error:", { error });
    return handleError(res, error);
  }
}

/** POST /approval-chains */
export async function createApprovalChain(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure approval chains.",
    });
  }
  try {
    const { userId } = req.user!;
    const {
      module,
      name,
      conditionField,
      conditionOp,
      conditionValue,
      priority,
      steps,
    } = req.body;

    const chain = await (prisma as any).approvalChain.create({
      data: {
        tenantId,
        module,
        name,
        conditionField: conditionField ?? null,
        conditionOp: conditionOp ?? null,
        conditionValue: conditionValue ?? null,
        priority: priority ?? 0,
        createdBy: userId,
      },
    });

    await (prisma as any).approvalChainStep.createMany({
      data: steps.map((s: any, i: number) => ({
        tenantId,
        chainId: chain.id,
        order: i + 1,
        approverType: s.approverType,
        approverUserId: s.approverUserId ?? null,
        approverRole: s.approverRole ?? null,
      })),
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Approval chain created.",
      data: { id: chain.id },
    });
  } catch (error: unknown) {
    logger.error("createApprovalChain error:", { error });
    return handleError(res, error);
  }
}

/** PUT /approval-chains/:id */
export async function updateApprovalChain(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure approval chains.",
    });
  }
  try {
    const { id } = req.params;
    const existing = await (prisma as any).approvalChain.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Approval chain not found.",
      });
    }

    const {
      name,
      conditionField,
      conditionOp,
      conditionValue,
      priority,
      isActive,
      steps,
    } = req.body;

    await (prisma as any).approvalChain.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(conditionField !== undefined && {
          conditionField: conditionField ?? null,
        }),
        ...(conditionOp !== undefined && { conditionOp: conditionOp ?? null }),
        ...(conditionValue !== undefined && {
          conditionValue: conditionValue ?? null,
        }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    if (steps !== undefined) {
      await (prisma as any).approvalChainStep.deleteMany({
        where: { chainId: id },
      });
      await (prisma as any).approvalChainStep.createMany({
        data: steps.map((s: any, i: number) => ({
          tenantId,
          chainId: id,
          order: i + 1,
          approverType: s.approverType,
          approverUserId: s.approverUserId ?? null,
          approverRole: s.approverRole ?? null,
        })),
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Approval chain updated.",
    });
  } catch (error: unknown) {
    logger.error("updateApprovalChain error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /approval-chains/:id */
export async function deleteApprovalChain(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure approval chains.",
    });
  }
  try {
    const { id } = req.params;
    const existing = await (prisma as any).approvalChain.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Approval chain not found.",
      });
    }
    const inProgress = await (prisma as any).approvalInstance.findFirst({
      where: { tenantId, chainId: id, status: "pending" },
    });
    if (inProgress) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "This chain has requests currently in progress. Deactivate it instead, or wait until they're resolved.",
      });
    }
    await (prisma as any).approvalChainStep.deleteMany({
      where: { chainId: id },
    });
    await (prisma as any).approvalChain.delete({ where: { id } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Approval chain deleted.",
    });
  } catch (error: unknown) {
    logger.error("deleteApprovalChain error:", { error });
    return handleError(res, error);
  }
}

// ─── Delegates ────────────────────────────────────────────────────────────────

/** GET /approval-delegates */
export async function listApprovalDelegates(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const delegates = await (prisma as any).approvalDelegate.findMany({
      where: { tenantId },
      orderBy: { startDate: "desc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: delegates });
  } catch (error: unknown) {
    logger.error("listApprovalDelegates error:", { error });
    return handleError(res, error);
  }
}

/** POST /approval-delegates — a user may delegate their own approvals; admins may delegate for anyone. */
export async function createApprovalDelegate(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId } = req.user!;
    const { delegateId, startDate, endDate, module, note } = req.body;

    if (new Date(startDate) > new Date(endDate)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "startDate must be before endDate.",
      });
    }

    const delegate = await (prisma as any).approvalDelegate.create({
      data: {
        tenantId,
        delegatorId: userId,
        delegateId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        module: module ?? null,
        note: note ?? null,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Delegate added.",
      data: { id: delegate.id },
    });
  } catch (error: unknown) {
    logger.error("createApprovalDelegate error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /approval-delegates/:id */
export async function deleteApprovalDelegate(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId, tenantRole } = req.user!;
    const { id } = req.params;
    const existing = await (prisma as any).approvalDelegate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Delegate not found.",
      });
    }
    const superUser = await isSuperUser(userId);
    const canRemove =
      superUser ||
      ["owner", "admin"].includes(tenantRole ?? "") ||
      existing.delegatorId === userId;
    if (!canRemove) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only remove your own delegate assignments.",
      });
    }
    await (prisma as any).approvalDelegate.delete({ where: { id } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Delegate removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteApprovalDelegate error:", { error });
    return handleError(res, error);
  }
}

// ─── Pending approvals & acting on a step ──────────────────────────────────────

/** GET /approvals/pending — "my pending approvals" across all modules. */
/**
 * Builds a short human summary + a handful of display fields for one pending
 * approval, so the frontend inbox can render a card without needing to know
 * anything module-specific. A module with no entry here still shows up with
 * a generic summary — this is presentation sugar, not a gate.
 */
function summarizePending(
  module: string,
  entity: any,
  requestedByName: string,
): { summary: string; detail: Record<string, unknown> } {
  if (!entity) {
    return { summary: `${module} request from ${requestedByName}`, detail: {} };
  }
  if (module === "leave") {
    const isCancellation = entity.status === "Cancellation Requested";
    const dayWord = entity.days === 1 ? "day" : "days";
    return {
      summary: isCancellation
        ? `${requestedByName} requested to cancel ${entity.leaveType} leave (${entity.days} ${dayWord})`
        : `${requestedByName} applied for ${entity.leaveType} leave (${entity.days} ${dayWord})`,
      detail: {
        leaveType: entity.leaveType,
        from: entity.from,
        to: entity.to,
        days: entity.days,
        unit: entity.unit,
        reason: entity.reason,
        isCancellation,
      },
    };
  }
  if (module === "resignation") {
    return {
      summary: `${requestedByName} submitted resignation (${entity.exitType})`,
      detail: {
        exitType: entity.exitType,
        resignationDate: entity.resignationDate,
        lastWorkingDay: entity.lastWorkingDay,
        noticePeriodDays: entity.noticePeriodDays,
        reason: entity.reason,
      },
    };
  }
  if (module === "overtime") {
    return {
      summary: `${requestedByName} requested ${entity.plannedHours}h overtime`,
      detail: {
        date: entity.date,
        plannedHours: entity.plannedHours,
        reason: entity.reason,
      },
    };
  }
  if (module === "wfh") {
    return {
      summary: `${requestedByName} requested WFH`,
      detail: {
        date: entity.date,
        reason: entity.reason,
      },
    };
  }
  return { summary: `${module} request from ${requestedByName}`, detail: {} };
}

/** GET /approvals/pending — enriched with entity summaries for the inbox UI. */
// Shared by the standalone GET /approvals/pending endpoint and the
// aggregated GET /approvals/pending-all endpoint (pendingActions.ts) — pure
// data fetch, no response writing, so it's safe to call from either.
export async function getPendingApprovalItems(
  req: AuthRequest,
): Promise<any[]> {
  const { tenantId, userId } = req.user!;
  if (!tenantId) return [];

  const pending = await getPendingApprovalsFor(tenantId, userId);
  if (pending.length === 0) return [];

  const instances = await (prisma as any).approvalInstance.findMany({
    where: { id: { in: pending.map((p) => p.instanceId) } },
  });
  const instanceById = new Map(instances.map((i: any) => [i.id, i]));

  const idsByModule = (module: string) =>
    pending.filter((p) => p.module === module).map((p) => p.entityId);

  const [leaves, resignations, overtimeRequests, wfhRequests, requesters] =
    await Promise.all([
      (prisma as any).leaveApplication.findMany({
        where: { id: { in: idsByModule("leave") } },
      }),
      (prisma as any).resignation.findMany({
        where: { id: { in: idsByModule("resignation") } },
      }),
      (prisma as any).overtimeRequest.findMany({
        where: { id: { in: idsByModule("overtime") } },
      }),
      (prisma as any).wfhRequest.findMany({
        where: { id: { in: idsByModule("wfh") } },
      }),
      prisma.user.findMany({
        where: {
          id: {
            in: [
              ...new Set(instances.map((i: any) => i.requestedBy as string)),
            ] as string[],
          },
        },
        select: { id: true, username: true },
      }),
    ]);

  const entityByModule: Record<string, Map<string, any>> = {
    leave: new Map(leaves.map((l: any) => [l.id, l])),
    resignation: new Map(resignations.map((r: any) => [r.id, r])),
    overtime: new Map(overtimeRequests.map((o: any) => [o.id, o])),
    wfh: new Map(wfhRequests.map((w: any) => [w.id, w])),
  };
  const requesterNameById = new Map(
    requesters.map((u: any) => [u.id, u.username]),
  );

  const data = pending.map((p) => {
    const instance = instanceById.get(p.instanceId) as any;
    const requestedByName =
      requesterNameById.get(instance?.requestedBy) ??
      instance?.requestedBy ??
      "Someone";
    const entity = entityByModule[p.module]?.get(p.entityId);
    const { summary, detail } = summarizePending(
      p.module,
      entity,
      requestedByName,
    );
    return {
      instanceId: p.instanceId,
      module: p.module,
      entityId: p.entityId,
      stepOrder: p.stepOrder,
      requestedBy: instance?.requestedBy,
      requestedByName,
      createdAt: instance?.createdAt,
      summary,
      detail,
    };
  });

  // Latest first — the underlying step/instance queries have no inherent
  // recency order (Mongo natural order, not guaranteed to be creation
  // order), so this needs to be explicit.
  data.sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime(),
  );

  return data;
}

export async function listPendingApprovals(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const data = await getPendingApprovalItems(req);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (error: unknown) {
    logger.error("listPendingApprovals error:", { error });
    return handleError(res, error);
  }
}

/**
 * Per-module callback invoked once an approval instance reaches a final
 * decision, so the owning row (LeaveApplication, Resignation, ...) can be
 * updated — e.g. writing the legacy `approvedById`/`status` fields, crediting
 * a leave balance, etc. Populated as each module is wired up; a module with
 * no callback here still fully tracks the approval instance/step audit trail,
 * it just doesn't yet drive the owning row's status.
 */
type ApprovalSideEffect = (params: {
  tenantId: string;
  entityId: string;
  actorUserId: string;
  finalStatus: "approved" | "rejected";
  comment?: string;
  /** Extra decision fields a module's UI collects beyond the generic
   * decision/comment (e.g. resignation's lastWorkingDay, buyoutAmount). */
  metadata?: Record<string, unknown>;
}) => Promise<void>;

const MODULE_SIDE_EFFECTS: Partial<Record<string, ApprovalSideEffect>> = {
  // A LeaveApplication can go through this chain twice in its lifetime: once
  // for the original apply (status still "Pending" when this fires), and
  // later for a post-approval cancellation request (status "Cancellation
  // Requested" — see leave-service/cancelLeave.ts). The two share this one
  // callback, so disambiguate on the entity's current status rather than
  // tracking instance "kind" separately.
  leave: async ({ entityId, finalStatus, actorUserId }) => {
    const leave = await (prisma as any).leaveApplication.findUnique({
      where: { id: entityId },
    });
    if (!leave) return;
    if (leave.status === "Cancellation Requested") {
      await grpcCall(leaveClient, "finalizeLeaveCancellation", {
        id: entityId,
        approved: finalStatus === "approved",
      });
    } else if (leave.status === "Pending") {
      if (finalStatus === "approved") {
        await grpcCall(leaveClient, "approveLeave", {
          id: entityId,
          approvedById: actorUserId,
        });
      } else {
        await grpcCall(leaveClient, "rejectLeave", { id: entityId });
      }
    }
  },
  resignation: async ({ entityId, finalStatus, comment, metadata }) => {
    // fromPartial fills in every field of the shared UpdateStatusRequest
    // message with its proto zero-value — otherwise an omitted field is
    // `undefined` on the plain object, and the generated encoder tries to
    // write it as a float/bool anyway and throws "Request message
    // serialization failure: invalid float32: undefined".
    if (finalStatus === "approved") {
      await grpcCall(
        recruitmentClient,
        "approveResignation",
        recruitment.UpdateStatusRequest.fromPartial({
          id: entityId,
          remarks: comment || "",
          lastWorkingDay: (metadata?.lastWorkingDay as string) || "",
          noticePeriodWaived:
            (metadata?.noticePeriodWaived as boolean | undefined) ?? false,
          buyoutAmount: (metadata?.buyoutAmount as number | undefined) ?? 0,
          relievedFromDutyOn: (metadata?.relievedFromDutyOn as string) || "",
        }),
      );
    } else {
      await grpcCall(
        recruitmentClient,
        "rejectResignation",
        recruitment.UpdateStatusRequest.fromPartial({
          id: entityId,
          rejectionReason: (metadata?.rejectionReason as string) || "",
          remarks: comment || "",
        }),
      );
    }
  },
  // Overtime requests are REST + Prisma (no gRPC service), so this flips the
  // status directly instead of round-tripping through a service.
  overtime: async ({ entityId, finalStatus }) => {
    await (prisma as any).overtimeRequest.update({
      where: { id: entityId },
      data: {
        status: finalStatus === "approved" ? "Approved" : "Rejected",
        ...(finalStatus === "approved" ? { approvedAt: new Date() } : {}),
      },
    });
  },
  // WFH requests are REST + Prisma (no gRPC service). On approval, also
  // upserts an AttendanceRecord with status="WFH" for that day — both so
  // reconcileAttendance doesn't mark it Absent, and so markAttendance's
  // geofencing check (apps/attendance-service) can recognize the day if the
  // employee does check in.
  wfh: async ({ tenantId, entityId, actorUserId, finalStatus, comment }) => {
    const wfhReq = await (prisma as any).wfhRequest.update({
      where: { id: entityId },
      data:
        finalStatus === "approved"
          ? {
              status: "Approved",
              approvedBy: actorUserId,
              approvedAt: new Date(),
            }
          : { status: "Rejected", rejectionReason: comment ?? null },
    });

    if (finalStatus === "approved") {
      // A request can span a date range — upsert an AttendanceRecord for
      // every working day in it (skipping weekends/holidays, same rule
      // requestWfh used to validate the range in the first place).
      const settings = await getActiveSettings(tenantId);
      const workingDays = getWorkingDays(settings);
      const datesToMark: Date[] = [];
      for (const d of eachDate(wfhReq.date, wfhReq.toDate)) {
        if (!workingDays.includes(dayjs.utc(d).day())) continue;
        if (await isHoliday(d)) continue;
        datesToMark.push(d);
      }
      await Promise.all(
        datesToMark.map((date) =>
          (prisma as any).attendanceRecord.upsert({
            where: {
              tenantId_userId_date: { tenantId, userId: wfhReq.userId, date },
            },
            create: { tenantId, userId: wfhReq.userId, date, status: "WFH" },
            update: { status: "WFH" },
          }),
        ),
      );
      await emitWebhookEvent("wfh.approved", {
        requestId: entityId,
        userId: wfhReq.userId,
        date: wfhReq.date,
        toDate: wfhReq.toDate,
      });
    }
  },
};

async function finalizeIfDone(
  tenantId: string,
  module: string,
  result: ActOnStepResult,
  entityId: string,
  actorUserId: string,
  comment?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!result.isFinal || !result.finalStatus) return;
  const sideEffect = MODULE_SIDE_EFFECTS[module];
  if (sideEffect) {
    await sideEffect({
      tenantId,
      entityId,
      actorUserId,
      finalStatus: result.finalStatus,
      comment,
      metadata,
    });
  }
}

/**
 * Resolves the currently-pending ApprovalInstance for a given (module,
 * entityId) and acts on it — used by module-specific routes (e.g. Leave's
 * update-leave-status) that only know the entity id, not the instance id.
 * An entity may have accumulated earlier, now-terminal instances (see the
 * "leave" comment above `MODULE_SIDE_EFFECTS`), so this always resolves the
 * current pending one rather than assuming a single instance per entity.
 */
export async function actOnApprovalForEntity(
  tenantId: string,
  module: string,
  entityId: string,
  actorUserId: string,
  decision: ApprovalDecision,
  comment: string | undefined,
  privileged: boolean,
  metadata?: Record<string, unknown>,
): Promise<ActOnStepResult> {
  const instance = await (prisma as any).approvalInstance.findFirst({
    where: { tenantId, module, entityId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!instance) {
    throw new Error(`No pending approval found for this ${module} request.`);
  }
  const result = await actOnStep(instance.id, actorUserId, decision, comment, {
    allowOverride: privileged,
  });
  await finalizeIfDone(
    tenantId,
    module,
    result,
    entityId,
    actorUserId,
    comment,
    metadata,
  );
  return result;
}

/** PUT /approvals/:instanceId/act */
export async function actOnApproval(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId } = req.user!;
    const { instanceId } = req.params as { instanceId: string };
    const { decision, comment, metadata } = req.body as {
      decision: ApprovalDecision;
      comment?: string;
      metadata?: Record<string, unknown>;
    };

    const instance = await (prisma as any).approvalInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Approval not found.",
      });
    }

    const privileged = await isPrivileged(req);
    const result = await actOnStep(instanceId, userId, decision, comment, {
      allowOverride: privileged,
    });

    await finalizeIfDone(
      tenantId,
      instance.module,
      result,
      instance.entityId,
      userId,
      comment,
      metadata,
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: result.isFinal
        ? `Request ${result.finalStatus}.`
        : "Approved — forwarded to the next approver.",
      data: result,
    });
  } catch (error: any) {
    if (error?.message && !error?.code) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: error.message,
      });
    }
    logger.error("actOnApproval error:", { error });
    return handleError(res, error);
  }
}
