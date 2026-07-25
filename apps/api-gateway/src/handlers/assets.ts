/**
 * Asset Management handler – gateway-direct.
 *
 * State machine:
 *   available → assigned   (assignAsset)
 *   assigned  → available  (returnAsset)
 *   any       → maintenance | retired (updateAsset)
 *
 * Security:
 *  – Create/update/assign/return restricted to HR/admin/owner.
 *  – Employees can view their own assigned assets.
 *  – assetCode is scoped to tenantId (@@unique([tenantId, assetCode])).
 *  – An asset already assigned cannot be re-assigned without return first.
 */

import { Request, Response } from "express";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  apiResponse,
  RESPONSE_STATUS,
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
  hasPrivilegedRole,
  HR_ROLES,
} from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest, AuthUser } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import { notify } from "@hrms/notifications";

// Prisma's MongoDB connector treats an explicit `null` and "field was never
// set" as different states — `{ returnedOn: null }` alone only matches rows
// where the field was explicitly written as null, not rows where it was
// simply omitted at creation (which every AssetAssignment.create() call here
// used to do). All creates below now write `returnedOn: null` explicitly, but
// this still has to match existing/legacy rows created before that fix.
const NOT_RETURNED = {
  OR: [{ returnedOn: null }, { returnedOn: { isSet: false } }],
};

// Same story for acknowledgedAt.
const NOT_ACKNOWLEDGED = {
  OR: [{ acknowledgedAt: null }, { acknowledgedAt: { isSet: false } }],
};

// tenantRole comes from the JWT (resolved from TenantMembership at login) —
// User.role is a legacy, never-populated field and must not be used here.
// Falls through to the explicit Assets:manage permission grant for anyone
// else (e.g. a non-HR employee given delegated asset-management access).
async function assertHrRole(authUser: AuthUser | undefined): Promise<boolean> {
  if (!authUser) return false;
  if (hasPrivilegedRole(authUser.tenantRole ?? "", HR_ROLES)) {
    return true;
  }
  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return ((user.permissions as string[]) ?? []).includes("Assets:manage");
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /assets
 * Create a new asset in inventory.
 */
export async function createAsset(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const {
      assetCode,
      name,
      category,
      brand,
      model: assetModel,
      serialNumber,
      purchaseDate,
      purchaseValue,
      condition,
      notes,
    } = req.body;

    const asset = await prisma.asset.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        assetCode: assetCode.toUpperCase(),
        name,
        category,
        brand: brand ?? null,
        model: assetModel ?? null,
        serialNumber: serialNumber ?? null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchaseValue: purchaseValue ?? null,
        condition: condition ?? "good",
        notes: notes ?? null,
        createdBy: user!.userId,
      },
    });

    logger.info(`Asset created: ${asset.id} (${assetCode})`, {
      userId: user!.userId,
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Asset created successfully",
      data: { assetId: asset.id, assetCode: asset.assetCode },
    });
  } catch (error) {
    logger.error("POST /assets error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /assets
 * List assets with optional status/category filter.
 */
export async function listAssets(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isHr = await assertHrRole(user);
    const { status, category, search, userId } = req.query as Record<
      string,
      string
    >;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { assetCode: { contains: search, mode: "insensitive" } },
        { serialNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    if (!isHr) {
      // Non-HR employees see only their own currently assigned assets.
      const myAssignments = await prisma.assetAssignment.findMany({
        where: { userId: user!.userId, ...NOT_RETURNED },
        select: { assetId: true },
      });
      where.id = { in: myAssignments.map((a: any) => a.assetId) };
    } else if (userId) {
      // HR viewing a specific employee's currently assigned assets (e.g. the
      // Employee profile page's Assets card).
      const theirAssignments = await prisma.assetAssignment.findMany({
        where: { userId, ...NOT_RETURNED },
        select: { assetId: true },
      });
      where.id = { in: theirAssignments.map((a: any) => a.assetId) };
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          // No `where`/`take` here — Prisma's MongoDB connector doesn't
          // reliably apply a filter on a nested relation include (it can
          // silently return an empty array instead of erroring), so fetch
          // a small unfiltered window and resolve the active (non-returned)
          // assignment in application code below instead.
          assignments: {
            orderBy: { assignedOn: "desc" },
            take: 5,
          },
        },
      }),
      prisma.asset.count({ where }),
    ]);

    // Resolve each asset's current (non-returned) assignment in JS.
    const activeAssignmentByAsset = new Map<string, any>();
    for (const a of assets as any[]) {
      const active = (a.assignments ?? []).find((x: any) => !x.returnedOn);
      if (active) activeAssignmentByAsset.set(a.id, active);
    }

    // Enrich with current holder's username.
    const holderIds = [...activeAssignmentByAsset.values()].map(
      (a) => a.userId,
    );
    const holders = await prisma.user.findMany({
      where: { id: { in: holderIds } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const holderMap = new Map(holders.map((h) => [h.id, h]));

    const enriched = (assets as any[]).map((a: any) => {
      const active = activeAssignmentByAsset.get(a.id);
      return {
        ...a,
        currentHolder: active ? (holderMap.get(active.userId) ?? null) : null,
        assignments: undefined, // strip raw relation from response
      };
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Assets retrieved",
      data: enriched,
      total,
    });
  } catch (error) {
    logger.error("GET /assets error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /assets/:assetId
 * Full asset detail including assignment history.
 */
export async function getAsset(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: String(req.params.assetId) },
      include: {
        assignments: {
          orderBy: { assignedOn: "desc" },
          take: 20,
        },
      },
    });
    if (!asset) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Asset not found",
      });
    }

    const isHr = await assertHrRole(user);
    const currentAssignment = (asset as any).assignments.find(
      (a: any) => !a.returnedOn,
    );

    // Non-HR can only view if they currently hold it.
    if (!isHr && currentAssignment?.userId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    // Enrich assignment history with names.
    const allUserIds = [
      ...(asset as any).assignments.flatMap((a: any) =>
        [a.userId, a.assignedBy, a.returnedTo].filter(Boolean),
      ),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(allUserIds)] as string[] } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    const enrichedAssignments = (asset as any).assignments.map((a: any) => ({
      ...a,
      holder: uMap.get(a.userId),
      assignedByUser: uMap.get(a.assignedBy),
      returnedToUser: a.returnedTo ? uMap.get(a.returnedTo) : null,
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset retrieved",
      data: { ...asset, assignments: enrichedAssignments },
    });
  } catch (error) {
    logger.error("GET /assets/:assetId error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /assets/:assetId
 * Update asset metadata (not assignment state — use assign/return endpoints).
 */
export async function updateAsset(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: String(req.params.assetId) },
    });
    if (!asset) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Asset not found",
      });
    }

    const {
      name,
      category,
      brand,
      model: assetModel,
      serialNumber,
      purchaseDate,
      purchaseValue,
      condition,
      status,
      notes,
    } = req.body;

    // Guard: cannot mark as "available" if currently assigned.
    if (status === "available" && (asset as any).status === "assigned") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Cannot mark an assigned asset as available. Use the return endpoint instead.",
      });
    }
    // Retirement is terminal — a retired asset cannot transition anywhere
    // else (maintenance assets can still come back to available).
    if (status !== undefined && (asset as any).status === "retired") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "A retired asset's status cannot be changed.",
      });
    }

    const updated = await prisma.asset.update({
      where: { id: String(req.params.assetId) },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(brand !== undefined && { brand }),
        ...(assetModel !== undefined && { model: assetModel }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(purchaseDate !== undefined && {
          purchaseDate: new Date(purchaseDate),
        }),
        ...(purchaseValue !== undefined && { purchaseValue }),
        ...(condition !== undefined && { condition }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset updated",
      data: { assetId: updated.id },
    });
  } catch (error) {
    logger.error("PATCH /assets/:assetId error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /assets/assign
 * Assign an available asset to an employee.
 */
export async function assignAsset(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { assetId, userId, expectedReturn, conditionOut, notes } =
      req.body as {
        assetId: string;
        userId: string;
        expectedReturn?: string;
        conditionOut?: string;
        notes?: string;
      };

    // Validate target employee exists.
    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, employeeStatus: true, email: true },
    });
    if (!employee) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Employee not found",
      });
    }
    if (employee.employeeStatus !== "Active") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot assign assets to inactive employees",
      });
    }

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Asset not found",
      });
    }
    if ((asset as any).status !== "available") {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: `Asset is currently '${(asset as any).status}' and cannot be assigned`,
      });
    }

    // Atomic conditional flip closes the race window between the read above
    // and this write — two concurrent assign calls can no longer both
    // succeed against the same asset. Only after this succeeds do we create
    // the assignment row (sequential, non-transactional — MongoDB standalone
    // has no multi-doc transactions).
    const flipped = await prisma.asset.updateMany({
      where: { id: assetId, status: "available" },
      data: { status: "assigned" },
    });
    if (flipped.count === 0) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "Asset was just assigned by someone else. Please retry.",
      });
    }
    await prisma.assetAssignment.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        assetId,
        userId,
        assignedBy: user!.userId,
        expectedReturn: expectedReturn ? new Date(expectedReturn) : null,
        conditionOut: conditionOut ?? (asset as any).condition,
        notes: notes ?? null,
        // Explicit nulls (not omitted) — see NOT_RETURNED/NOT_ACKNOWLEDGED
        // comment above for why this matters on MongoDB.
        returnedOn: null,
        acknowledgedAt: null,
      },
    });

    await emitWebhookEvent("asset.assigned", {
      assetId,
      assetCode: (asset as any).assetCode,
      assignedTo: employee.username,
    });

    logger.info(
      `Asset ${(asset as any).assetCode} assigned to ${employee.username}`,
      {
        assignedBy: user!.userId,
      },
    );

    // Notify the assignee (in-app + email) — fire-and-forget, mirrors
    // reportAssetIssue's notification pattern a few functions down.
    const tenantId = getTenantId();
    if (tenantId) {
      const assetCode = (asset as any).assetCode;
      masterPrisma.tenant
        .findUnique({
          where: { id: tenantId },
          select: { name: true, helpEmail: true },
        })
        .then((tenant) => {
          const tenantName = tenant?.name ?? "your organisation";
          return notify({
            tenantId,
            event: "assetAssigned",
            targetUser: userId,
            inApp: {
              title: "Asset assigned",
              message: `${assetCode} has been assigned to you`,
              eventType: "asset_notification",
              priority: "medium",
            },
            email: employee.email
              ? {
                  to: employee.email,
                  subject: `Asset assigned: ${assetCode}`,
                  html: renderEmailHtml({
                    title: "Asset Assigned",
                    tenantName,
                    bodyHtml: `<h2>Hello ${employee.username},</h2><p><strong>${assetCode}</strong> has been assigned to you.${notes ? ` Notes: ${notes}` : ""}</p>`,
                  }),
                  from: tenantFrom(tenantName),
                  replyTo: tenantReplyTo(tenant?.helpEmail),
                }
              : undefined,
          });
        })
        .catch((error: unknown) =>
          logger.warn("asset-assigned notify failed", { error }),
        );
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Asset assigned to ${employee.username}`,
    });
  } catch (error) {
    logger.error("POST /assets/assign error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /assets/return
 * Record an asset being returned by an employee.
 */
export async function returnAsset(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { assetId, conditionIn, notes } = req.body as {
      assetId: string;
      conditionIn: string;
      notes?: string;
    };

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Asset not found",
      });
    }
    if ((asset as any).status !== "assigned") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "This asset is not currently assigned",
      });
    }

    const activeAssignment = await prisma.assetAssignment.findFirst({
      where: { assetId, ...NOT_RETURNED },
      orderBy: { assignedOn: "desc" },
    });
    if (!activeAssignment) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "No active assignment found for this asset",
      });
    }

    // Sequential writes — MongoDB standalone has no multi-doc transactions.
    await prisma.assetAssignment.update({
      where: { id: (activeAssignment as any).id },
      data: {
        returnedOn: new Date(),
        returnedTo: user!.userId,
        conditionIn,
        notes: notes ?? null,
      },
    });
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: conditionIn === "damaged" ? "maintenance" : "available",
        condition: conditionIn,
      },
    });

    await emitWebhookEvent("asset.returned", {
      assetId,
      assetCode: (asset as any).assetCode,
      conditionIn,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset returned successfully",
    });
  } catch (error) {
    logger.error("POST /assets/return error:", { error });
    return handleError(res, error);
  }
}

/**
 * DELETE /assets/:assetId
 * Soft-delete: marks asset as retired (cannot delete assigned assets).
 */
export async function retireAsset(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: String(req.params.assetId) },
    });
    if (!asset) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Asset not found",
      });
    }
    if ((asset as any).status === "assigned") {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message:
          "Cannot retire an asset that is currently assigned. Return it first.",
      });
    }

    await prisma.asset.update({
      where: { id: String(req.params.assetId) },
      data: { status: "retired" },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset retired",
    });
  } catch (error) {
    logger.error("DELETE /assets/:assetId error:", { error });
    return handleError(res, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACKNOWLEDGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /assets/assignments/:assignmentId/acknowledge
 * Employee confirms they received the asset in the stated condition.
 * Only the employee who holds the assignment may call this.
 */
export async function acknowledgeAssignment(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const assignment = await prisma.assetAssignment.findUnique({
      where: { id: String(req.params.assignmentId) },
    });
    if (!assignment) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Assignment not found",
      });
    }

    // Only the holder can acknowledge.
    if ((assignment as any).userId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only acknowledge your own assignment",
      });
    }

    if ((assignment as any).acknowledgedAt) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "Assignment already acknowledged",
      });
    }

    if ((assignment as any).returnedOn) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot acknowledge a returned assignment",
      });
    }

    await prisma.assetAssignment.update({
      where: { id: (assignment as any).id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedNote: req.body.note ?? null,
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset receipt acknowledged",
    });
  } catch (error) {
    logger.error("POST /assets/assignments/:id/acknowledge error:", { error });
    return handleError(res, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE REPORTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /assets/issues
 * Employee reports an issue (malfunction, damage, lost, stolen, return request, other).
 * The asset must be currently assigned to the reporting employee.
 */
export async function reportAssetIssue(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { assetId, type, priority, title, description } = req.body as {
      assetId: string;
      type: string;
      priority?: string;
      title: string;
      description: string;
    };

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Asset not found",
      });
    }

    // Find the active assignment for this user.
    const activeAssignment = await prisma.assetAssignment.findFirst({
      where: { assetId, userId: user!.userId, ...NOT_RETURNED },
      orderBy: { assignedOn: "desc" },
    });

    const isHr = await assertHrRole(user);

    // Non-HR must currently hold the asset to report an issue.
    if (!isHr && !activeAssignment) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message:
          "You can only report issues on assets currently assigned to you",
      });
    }

    // Prevent duplicate open issues of the same type for the same asset.
    const existingOpen = await prisma.assetIssue.findFirst({
      where: {
        assetId,
        reportedBy: user!.userId,
        type,
        status: { in: ["open", "in_review"] },
      },
    });
    if (existingOpen) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: `An open '${type}' issue already exists for this asset (ID: ${(existingOpen as any).id})`,
      });
    }

    const issue = await prisma.assetIssue.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        assetId,
        assignmentId: activeAssignment ? (activeAssignment as any).id : null,
        reportedBy: user!.userId,
        type,
        priority: priority ?? "medium",
        title,
        description,
      },
    });

    await emitWebhookEvent("asset.issue_reported", {
      issueId: (issue as any).id,
      assetId,
      assetCode: (asset as any).assetCode,
      type,
      priority: (issue as any).priority,
      reportedBy: user!.userId,
    });

    // Notify everyone who can manage assets (in-app + push) — fire-and-forget
    // so a slow recipient lookup or queue failure never blocks the report.
    void (async () => {
      try {
        const tenantId = getTenantId();
        if (!tenantId) return;

        const [roleHolders, permissionHolders] = await Promise.all([
          prisma.tenantMembership.findMany({
            where: { tenantId, role: { in: ["owner", "admin", "hr"] } },
            select: { userId: true },
          }),
          prisma.user.findMany({
            where: { tenantId, permissions: { has: "Assets:manage" } },
            select: { id: true },
          }),
        ]);
        const recipientIds = [
          ...new Set([
            ...roleHolders.map((r: any) => r.userId),
            ...permissionHolders.map((u) => u.id),
          ]),
        ].filter((id) => id !== user!.userId);
        if (recipientIds.length === 0) return;

        const recipientUsers = await prisma.user.findMany({
          where: { id: { in: recipientIds } },
          select: { id: true, username: true },
        });

        const issuePriority = (issue as any).priority as string;
        await notify({
          tenantId,
          event: "assetIssueReported",
          recipients: recipientUsers.map((u) => u.id),
          pushTargets: recipientUsers.map((u) => u.username),
          inApp: {
            title: "Asset issue reported",
            message: `${(asset as any).assetCode} — ${title} (${type})`,
            eventType: "asset_notification",
            priority:
              issuePriority === "critical"
                ? "high"
                : (issuePriority as "high" | "medium" | "low"),
          },
          push: { enabled: true },
        });
      } catch (error) {
        logger.warn("asset-issue notification failed", { error });
      }
    })();

    logger.info(
      `Asset issue reported: ${(issue as any).id} (${type}) on ${(asset as any).assetCode}`,
      {
        reportedBy: user!.userId,
      },
    );

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Issue reported successfully",
      data: { issueId: (issue as any).id },
    });
  } catch (error) {
    logger.error("POST /assets/issues error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /assets/issues
 * HR/admin: all issues across the tenant (with optional filters).
 * Employee: only issues they reported.
 */
export async function listAssetIssues(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isHr = await assertHrRole(user);
    const { status, type, priority, assetId } = req.query as Record<
      string,
      string
    >;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (!isHr) where.reportedBy = user!.userId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (priority) where.priority = priority;
    if (assetId) where.assetId = assetId;

    const [issues, total] = await Promise.all([
      prisma.assetIssue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.assetIssue.count({ where }),
    ]);

    // Enrich with asset info and user names.
    const assetIds = [...new Set((issues as any[]).map((i: any) => i.assetId))];
    const userIds = [
      ...new Set([
        ...(issues as any[]).map((i: any) => i.reportedBy),
        ...(issues as any[]).map((i: any) => i.reviewedBy).filter(Boolean),
      ]),
    ];

    const [assets, users] = await Promise.all([
      prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, assetCode: true, name: true, category: true },
      }),
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, first_name: true, last_name: true },
      }),
    ]);
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = (issues as any[]).map((i: any) => ({
      ...i,
      asset: assetMap.get(i.assetId) ?? null,
      reporter: userMap.get(i.reportedBy) ?? null,
      reviewer: i.reviewedBy ? (userMap.get(i.reviewedBy) ?? null) : null,
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset issues retrieved",
      data: enriched,
      total,
    });
  } catch (error) {
    logger.error("GET /assets/issues error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /assets/issues/:issueId
 * Full detail for a single issue.
 * HR sees any; employee sees only their own.
 */
export async function getAssetIssue(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const issue = await prisma.assetIssue.findUnique({
      where: { id: String(req.params.issueId) },
    });
    if (!issue) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Issue not found",
      });
    }

    const isHr = await assertHrRole(user);
    if (!isHr && (issue as any).reportedBy !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    // Enrich with asset and user details.
    const [asset, userIds] = [
      await prisma.asset.findUnique({
        where: { id: (issue as any).assetId },
        select: {
          id: true,
          assetCode: true,
          name: true,
          category: true,
          status: true,
        },
      }),
      [
        ...new Set(
          [(issue as any).reportedBy, (issue as any).reviewedBy].filter(
            Boolean,
          ),
        ),
      ] as string[],
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Issue retrieved",
      data: {
        ...issue,
        asset,
        reporter: uMap.get((issue as any).reportedBy) ?? null,
        reviewer: (issue as any).reviewedBy
          ? (uMap.get((issue as any).reviewedBy) ?? null)
          : null,
      },
    });
  } catch (error) {
    logger.error("GET /assets/issues/:issueId error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /assets/issues/:issueId/status
 * HR-only — drive the issue through its lifecycle:
 *
 *   open → in_review   (HR acknowledges / starts investigating)
 *   in_review → approved | rejected
 *   approved  → resolved   (HR marks it done; triggers auto-effects)
 *
 * Auto-effects on resolution by issue type:
 *   lost / stolen → asset status set to "retired"
 *   damage        → asset status set to "maintenance", condition = "damaged"
 *   return_request → asset returned: assignment closed, asset set "available"
 */
export async function updateAssetIssueStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { status, notes } = req.body as { status: string; notes?: string };
    const issueId = String(req.params.issueId);

    const issue = await prisma.assetIssue.findUnique({
      where: { id: issueId },
    });
    if (!issue) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Issue not found",
      });
    }

    const currentStatus = (issue as any).status as string;
    const issueType = (issue as any).type as string;

    // Validate allowed transitions.
    const ALLOWED: Record<string, string[]> = {
      open: ["in_review", "rejected"],
      in_review: ["approved", "rejected"],
      approved: ["resolved"],
    };
    const allowed = ALLOWED[currentStatus] ?? [];
    if (!allowed.includes(status)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Cannot transition from '${currentStatus}' to '${status}'. Allowed: ${allowed.join(", ") || "none"}`,
      });
    }

    const isReview = ["in_review", "approved", "rejected"].includes(status);
    const isResolution = status === "resolved";

    // Update the issue.
    await prisma.assetIssue.update({
      where: { id: issueId },
      data: {
        status,
        ...(isReview && {
          reviewedBy: user!.userId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? null,
        }),
        ...(isResolution && {
          resolvedAt: new Date(),
          resolverNotes: notes ?? null,
        }),
      },
    });

    // ── Auto-effects on resolution ────────────────────────────────────────────
    // Guard against a stale issue: if the asset has since been returned and/or
    // reassigned (a different — or no — assignment is now the active one),
    // the auto-effects below must not retire/maintenance/free an asset that's
    // legitimately in someone else's hands, or re-close an assignment that
    // was already closed through the normal return flow.
    let effectsSkipped = false;
    if (isResolution) {
      const asset = await prisma.asset.findUnique({
        where: { id: (issue as any).assetId },
      });
      const currentAssignment = await prisma.assetAssignment.findFirst({
        where: { assetId: (issue as any).assetId, ...NOT_RETURNED },
        orderBy: { assignedOn: "desc" },
      });
      const assignmentStillCurrent =
        !(issue as any).assignmentId ||
        (currentAssignment as any)?.id === (issue as any).assignmentId;

      if (!assignmentStillCurrent) {
        effectsSkipped = true;
        logger.warn(
          `Skipped auto-effects for resolved issue ${issueId}: asset ${(issue as any).assetId} ` +
            "has since been returned/reassigned to a different assignment.",
          { userId: user!.userId },
        );
      } else if (issueType === "lost" || issueType === "stolen") {
        // Asset is gone — retire it.
        await prisma.asset.update({
          where: { id: (issue as any).assetId },
          data: { status: "retired" },
        });
        // Close any open assignment.
        if ((issue as any).assignmentId) {
          await prisma.assetAssignment.update({
            where: { id: (issue as any).assignmentId },
            data: {
              returnedOn: new Date(),
              returnedTo: user!.userId,
              conditionIn: "damaged",
            },
          });
        }
        await emitWebhookEvent("asset.retired", {
          assetId: (issue as any).assetId,
          assetCode: (asset as any)?.assetCode,
          reason: issueType,
        });
      } else if (issueType === "damage") {
        // Send to maintenance — HR decides when to bring it back.
        await prisma.asset.update({
          where: { id: (issue as any).assetId },
          data: { status: "maintenance", condition: "damaged" },
        });
      } else if (issueType === "return_request") {
        // Treat as a normal return — close the assignment and free the asset.
        if ((issue as any).assignmentId) {
          await prisma.assetAssignment.update({
            where: { id: (issue as any).assignmentId },
            data: {
              returnedOn: new Date(),
              returnedTo: user!.userId,
              conditionIn: notes ? "fair" : "good", // HR sets condition via notes
            },
          });
        }
        await prisma.asset.update({
          where: { id: (issue as any).assetId },
          data: { status: "available" },
        });
        await emitWebhookEvent("asset.returned", {
          assetId: (issue as any).assetId,
          assetCode: (asset as any)?.assetCode,
          via: "return_request",
        });
      }
    }

    await emitWebhookEvent("asset.issue_updated", {
      issueId,
      status,
      type: issueType,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: effectsSkipped
        ? `Issue status updated to '${status}'. The asset has since been returned/reassigned, so the automatic ${issueType} effect was skipped.`
        : `Issue status updated to '${status}'`,
    });
  } catch (error) {
    logger.error("PATCH /assets/issues/:issueId/status error:", { error });
    return handleError(res, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /assets/summary
 * Aggregated counts by status and category for the dashboard.
 */
export async function getAssetSummary(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const [all, openIssues, pendingAcks] = await Promise.all([
      prisma.asset.findMany({ select: { status: true, category: true } }),
      // Open issues needing HR attention.
      prisma.assetIssue.count({
        where: { status: { in: ["open", "in_review"] } },
      }),
      // Assignments awaiting employee acknowledgement.
      prisma.assetAssignment.count({
        where: { AND: [NOT_RETURNED, NOT_ACKNOWLEDGED] },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const a of all as any[]) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset summary",
      data: {
        total: all.length,
        byStatus,
        byCategory,
        openIssues, // issues needing HR action
        pendingAcks, // assignments not yet acknowledged by employees
      },
    });
  } catch (error) {
    logger.error("GET /assets/summary error:", { error });
    return handleError(res, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /assets/categories
 * Tenant-scoped lookup of asset categories in use — mirrors listDesignations.
 * Backs the Category autocomplete in the Create Asset dialog.
 */
export async function listAssetCategories(req: Request, res: Response) {
  try {
    const categories = await prisma.assetCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Asset categories retrieved",
      data: categories,
    });
  } catch (error) {
    logger.error("GET /assets/categories error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /assets/categories
 * Persists a newly-typed category so it appears in the dropdown next time —
 * mirrors createDesignation. Relies on the @@unique([tenantId, name])
 * constraint to no-op (via P2002) if it's already known.
 */
export async function createAssetCategory(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }

    const { name } = req.body as { name: string };
    const category = await prisma.assetCategory.create({
      data: {
        tenantId,
        name: name.trim(),
        createdBy: user!.userId,
      },
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Asset category added",
      data: category,
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      // Already exists for this tenant — not an error from the caller's
      // perspective (ensureAssetCategorySaved treats this as success).
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Asset category already exists",
      });
    }
    logger.error("POST /assets/categories error:", { error });
    return handleError(res, error);
  }
}
