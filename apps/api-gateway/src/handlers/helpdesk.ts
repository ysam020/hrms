/**
 * HR Helpdesk handler – gateway-direct.
 *
 * SLA hours by priority:
 *   critical → 4 h  |  high → 8 h  |  medium → 24 h  |  low → 72 h
 *
 * SLA breach is checked lazily on read (no real-time cron needed for MVP).
 * A BullMQ delayed job fires at slaDeadline to flip slaBreached=true and
 * send a notification (registered in scheduler at creation time).
 *
 * Security:
 *  – Any authenticated employee can raise a ticket.
 *  – Only HR/admin/owner can assign or update tickets raised by others.
 *  – Employees can only see their own tickets; HR sees all.
 *  – Internal comments are hidden from the ticket raiser.
 */

import { Request, Response } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  apiResponse,
  RESPONSE_STATUS,
  hasPrivilegedRole,
  HR_ROLES,
} from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest, AuthUser } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import { getSchedulerQueue } from "@hrms/queue";
import { notify } from "@hrms/notifications";
import dayjs from "dayjs";

// SLA hours keyed by priority.
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};

// tenantRole comes from the JWT (resolved from TenantMembership at login) —
// User.role is a legacy, never-populated field and must not be used here
// (same bug already found and fixed in assets.ts/wfh.ts). Falls through to
// the explicit Helpdesk:manage permission grant for anyone else.
// Exported for the MCP helpdesk tools (mcp/tools.ts), so they apply exactly
// this rule rather than a copy of it.
export async function assertHrRole(
  authUser: AuthUser | undefined,
): Promise<boolean> {
  if (!authUser) return false;
  if (hasPrivilegedRole(authUser.tenantRole ?? "", HR_ROLES)) return true;
  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return ((user.permissions as string[]) ?? []).includes("Helpdesk:manage");
}

/**
 * Every user who can act as HR on tickets for this tenant — owner/admin/hr
 * tenantRole, isSuperUser, or an explicit Helpdesk:manage grant — used to
 * resolve notification recipients. "Assign to HR" has no single owner in
 * this app's model, so a ticket is implicitly owned by this whole group
 * from creation; an individual only gets recorded in `assignedTo` once they
 * actually pick it up (existing auto-assign-on-first-response behavior).
 */
async function getHelpdeskRecipientIds(
  tenantId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const [roleHolders, otherHolders] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId, role: { in: ["owner", "admin", "hr"] } },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { isSuperUser: true },
          { permissions: { has: "Helpdesk:manage" } },
        ],
      },
      select: { id: true },
    }),
  ]);
  return [
    ...new Set([
      ...roleHolders.map((r: any) => r.userId),
      ...otherHolders.map((u) => u.id),
    ]),
  ].filter((id) => id !== excludeUserId);
}

/** Fire-and-forget in-app + push notification to a set of user IDs. */
async function notifyTicketEvent(
  tenantId: string,
  recipientIds: string[],
  title: string,
  message: string,
  priority: "high" | "medium" | "low",
): Promise<void> {
  if (recipientIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, username: true },
  });
  if (users.length === 0) return;
  await notify({
    tenantId,
    event: "helpdeskNotification",
    recipients: users.map((u) => u.id),
    pushTargets: users.map((u) => u.username),
    inApp: {
      title,
      message,
      eventType: "helpdesk_notification",
      priority,
    },
    push: { enabled: true },
  });
}

// Generate a sequential, human-readable ticket number: TICK-00001.
async function generateTicketNo(tenantId: string): Promise<string> {
  const count = await prisma.ticket.count({ where: { tenantId } });
  return `TICK-${String(count + 1).padStart(5, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /helpdesk/tickets
 * Any employee raises a new support ticket.
 */
export async function createTicket(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { title, description, category, priority, attachments } =
      req.body as {
        title: string;
        description: string;
        category: string;
        priority: string;
        attachments?: string[];
      };

    const tenantId = getTenantId()!;
    const ticketNo = await generateTicketNo(tenantId);
    const slaHours = SLA_HOURS[priority] ?? 24;
    const slaDeadline = dayjs().add(slaHours, "hour").toDate();

    const ticket = await prisma.ticket.create({
      data: {
        tenantId,
        ticketNo,
        title,
        description,
        category,
        priority,
        status: "open",
        raisedBy: user!.userId,
        slaDeadline,
        attachments: attachments ?? [],
      },
    });

    // Schedule a BullMQ delayed job to mark SLA as breached if unresolved.
    try {
      const queue = getSchedulerQueue();
      await queue.add(
        "checkTicketSla",
        { jobName: "checkTicketSla", ticketId: ticket.id },
        {
          delay: slaHours * 60 * 60 * 1000,
          jobId: `sla:${ticket.id}`, // idempotent — won't duplicate on restart
          removeOnComplete: true,
        },
      );
    } catch (qErr) {
      // Non-fatal: SLA can be checked lazily on read.
      logger.warn(`Failed to schedule SLA job for ticket ${ticket.id}`, {
        qErr,
      });
    }

    // Auto-assigned to the HR group (owner/admin/hr/superuser/explicit
    // Helpdesk:manage) as a whole, not a specific person — notify all of
    // them so someone actually picks it up. Fire-and-forget: a slow
    // recipient lookup or queue failure must never block ticket creation.
    void (async () => {
      try {
        const recipientIds = await getHelpdeskRecipientIds(
          tenantId,
          user!.userId,
        );
        await notifyTicketEvent(
          tenantId,
          recipientIds,
          "New support ticket",
          `${ticketNo}: ${title} (${priority} priority)`,
          priority === "critical"
            ? "high"
            : (priority as "high" | "medium" | "low"),
        );
      } catch (err) {
        logger.warn(`ticket-created notification failed for ${ticketNo}`, {
          err,
        });
      }
    })();

    logger.info(`Ticket created: ${ticketNo}`, {
      userId: user!.userId,
      category,
      priority,
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Ticket created",
      data: { ticketId: ticket.id, ticketNo, slaDeadline },
    });
  } catch (error) {
    logger.error("POST /helpdesk/tickets error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /helpdesk/tickets
 * HR sees all tickets; employees see their own.
 * Lazily checks and updates SLA breach status.
 */
export async function listTickets(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isHr = await assertHrRole(user);
    const { status, category, priority, search } = req.query as Record<
      string,
      string
    >;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {};
    if (!isHr) where.raisedBy = user!.userId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { ticketNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.ticket.count({ where }),
    ]);

    // Lazy SLA breach: mark any ticket past deadline as breached.
    const now = new Date();
    const toBreachIds = (tickets as any[])
      .filter(
        (t: any) =>
          !t.slaBreached &&
          t.slaDeadline &&
          new Date(t.slaDeadline) < now &&
          !["resolved", "closed"].includes(t.status),
      )
      .map((t: any) => t.id);

    if (toBreachIds.length > 0) {
      await prisma.ticket.updateMany({
        where: { id: { in: toBreachIds } },
        data: { slaBreached: true },
      });
      // Reflect in the response.
      for (const t of tickets as any[]) {
        if (toBreachIds.includes(t.id)) t.slaBreached = true;
      }
    }

    // Enrich with user names.
    const allIds = [
      ...new Set(
        (tickets as any[]).flatMap((t: any) =>
          [t.raisedBy, t.assignedTo].filter(Boolean),
        ),
      ),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: allIds as string[] } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Tickets retrieved",
      data: (tickets as any[]).map((t: any) => ({
        ...t,
        raisedByUser: uMap.get(t.raisedBy),
        assignedToUser: t.assignedTo ? uMap.get(t.assignedTo) : null,
        commentsCount: undefined, // stripped — load on demand
      })),
      total,
    });
  } catch (error) {
    logger.error("GET /helpdesk/tickets error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /helpdesk/tickets/:ticketId
 * Full ticket detail with comments (internal comments hidden from non-HR).
 */
export async function getTicket(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isHr = await assertHrRole(user);

    const ticket = await prisma.ticket.findUnique({
      where: { id: String(req.params.ticketId) },
      include: { comments: { orderBy: { createdAt: "asc" } } },
    });
    if (!ticket) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Ticket not found",
      });
    }

    // Non-HR can only view their own tickets.
    if (!isHr && (ticket as any).raisedBy !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    // Filter internal comments for non-HR.
    const visibleComments = isHr
      ? (ticket as any).comments
      : (ticket as any).comments.filter((c: any) => !c.isInternal);

    // Enrich comment authors.
    // Enrich comment authors and the ticket's own raisedBy/assignedTo/
    // resolvedBy in one query — listTickets already does this for
    // raisedBy/assignedTo (as raisedByUser/assignedToUser), but getTicket
    // previously returned those as raw ObjectId strings, so the frontend's
    // "Raised By" display always rendered blank.
    const allUserIds = [
      ...new Set([
        ...visibleComments.map((c: any) => c.userId),
        (ticket as any).raisedBy,
        (ticket as any).assignedTo,
        (ticket as any).resolvedBy,
      ]),
    ].filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds as string[] } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Ticket retrieved",
      data: {
        ...ticket,
        raisedByUser: uMap.get((ticket as any).raisedBy),
        assignedToUser: (ticket as any).assignedTo
          ? uMap.get((ticket as any).assignedTo)
          : null,
        resolvedByUser: (ticket as any).resolvedBy
          ? uMap.get((ticket as any).resolvedBy)
          : null,
        comments: visibleComments.map((c: any) => ({
          ...c,
          author: uMap.get(c.userId),
        })),
      },
    });
  } catch (error) {
    logger.error("GET /helpdesk/tickets/:ticketId error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /helpdesk/tickets/:ticketId
 * Update ticket metadata. HR/admin only for most fields;
 * ticket raiser can add attachments while status is "open".
 */
export async function updateTicket(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isHr = await assertHrRole(user);

    const ticket = await prisma.ticket.findUnique({
      where: { id: String(req.params.ticketId) },
    });
    if (!ticket) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Ticket not found",
      });
    }

    if (!isHr && (ticket as any).raisedBy !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { title, description, category, priority, status, assignedTo } =
      req.body;

    // Non-HR cannot change status, priority, or assignment.
    const data: any = {};
    if (isHr) {
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description;
      if (category !== undefined) data.category = category;
      if (priority !== undefined) data.priority = priority;
      if (assignedTo !== undefined) data.assignedTo = assignedTo;
      if (status !== undefined) {
        data.status = status;
        if (
          status === "in_progress" &&
          !(ticket as any).assignedTo &&
          !assignedTo
        ) {
          data.assignedTo = user!.userId; // auto-assign to the HR who picked it up
        }
        if (status === "resolved") {
          data.resolvedBy = user!.userId;
          data.resolvedAt = new Date();
        }
      }
    } else {
      // Employees can only update title/description while open.
      if ((ticket as any).status !== "open") {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "You can only edit a ticket while it is open",
        });
      }
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description;
    }

    if (Object.keys(data).length === 0) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No valid fields to update",
      });
    }

    await prisma.ticket.update({
      where: { id: String(req.params.ticketId) },
      data,
    });

    // Notify the HR group + the ticket's raiser (whoever of those isn't the
    // one who just made this change).
    const tenantId = getTenantId()!;
    const changes: string[] = [];
    if (data.status !== undefined) changes.push(`status → ${data.status}`);
    if (data.priority !== undefined)
      changes.push(`priority → ${data.priority}`);
    if (data.assignedTo !== undefined) changes.push("reassigned");
    if (data.category !== undefined)
      changes.push(`category → ${data.category}`);
    if (data.title !== undefined || data.description !== undefined)
      changes.push("details edited");
    const changeSummary =
      changes.length > 0 ? changes.join(", ") : "was updated";

    void (async () => {
      try {
        const hrIds = await getHelpdeskRecipientIds(tenantId, user!.userId);
        const recipientIds = [
          ...new Set([...hrIds, (ticket as any).raisedBy]),
        ].filter((id) => id !== user!.userId);
        await notifyTicketEvent(
          tenantId,
          recipientIds,
          "Ticket updated",
          `${(ticket as any).ticketNo}: ${changeSummary}`,
          "medium",
        );
      } catch (err) {
        logger.warn(
          `ticket-update notification failed for ${(ticket as any).ticketNo}`,
          { err },
        );
      }
    })();

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Ticket updated",
    });
  } catch (error) {
    logger.error("PATCH /helpdesk/tickets/:ticketId error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /helpdesk/tickets/:ticketId/comments
 * Add a comment. HR can mark isInternal=true to leave internal notes.
 */
export async function addComment(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isHr = await assertHrRole(user);

    const ticket = await prisma.ticket.findUnique({
      where: { id: String(req.params.ticketId) },
    });
    if (!ticket) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Ticket not found",
      });
    }
    if (!isHr && (ticket as any).raisedBy !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }
    if ((ticket as any).status === "closed") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot comment on a closed ticket",
      });
    }

    const { comment, isInternal } = req.body as {
      comment: string;
      isInternal?: boolean;
    };
    const internal = isInternal === true && isHr; // only HR can post internal notes

    const newComment = await prisma.ticketComment.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        ticketId: String(req.params.ticketId),
        userId: user!.userId,
        comment,
        isInternal: internal,
      },
    });

    // Auto-move to in_progress when HR first responds.
    if (isHr && (ticket as any).status === "open") {
      await prisma.ticket.update({
        where: { id: String(req.params.ticketId) },
        data: {
          status: "in_progress",
          assignedTo: (ticket as any).assignedTo ?? user!.userId,
        },
      });
    }

    // Notify the HR group + the raiser — except for internal notes, which
    // the raiser can't even see, so they must not be tipped off one exists.
    const tenantId = getTenantId()!;
    void (async () => {
      try {
        const hrIds = await getHelpdeskRecipientIds(tenantId, user!.userId);
        const recipientIds = internal
          ? hrIds
          : [...new Set([...hrIds, (ticket as any).raisedBy])].filter(
              (id) => id !== user!.userId,
            );
        await notifyTicketEvent(
          tenantId,
          recipientIds,
          "New ticket comment",
          `New comment on ${(ticket as any).ticketNo}`,
          "medium",
        );
      } catch (err) {
        logger.warn(
          `ticket-comment notification failed for ${(ticket as any).ticketNo}`,
          { err },
        );
      }
    })();

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Comment added",
      data: { commentId: newComment.id },
    });
  } catch (error) {
    logger.error("POST /helpdesk/tickets/:ticketId/comments error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /helpdesk/stats
 * Aggregated helpdesk metrics for the HR dashboard.
 */
export async function getHelpdeskStats(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const [byStatus, byCategory, byPriority, slaBreached] = await Promise.all([
      prisma.ticket.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.ticket.groupBy({ by: ["category"], _count: { id: true } }),
      prisma.ticket.groupBy({ by: ["priority"], _count: { id: true } }),
      prisma.ticket.count({
        where: { slaBreached: true, status: { notIn: ["resolved", "closed"] } },
      }),
    ]);

    // Avg resolution time (resolved tickets).
    const resolved = await prisma.ticket.findMany({
      where: {
        status: { in: ["resolved", "closed"] },
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true },
    });
    const avgResolutionHours =
      resolved.length > 0
        ? resolved.reduce((sum: number, t: any) => {
            return sum + dayjs(t.resolvedAt).diff(dayjs(t.createdAt), "hour");
          }, 0) / resolved.length
        : null;

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Helpdesk stats",
      data: {
        byStatus: Object.fromEntries(
          (byStatus as any[]).map((g: any) => [g.status, g._count.id]),
        ),
        byCategory: Object.fromEntries(
          (byCategory as any[]).map((g: any) => [g.category, g._count.id]),
        ),
        byPriority: Object.fromEntries(
          (byPriority as any[]).map((g: any) => [g.priority, g._count.id]),
        ),
        slaBreachedOpen: slaBreached,
        avgResolutionHours: avgResolutionHours
          ? parseFloat(avgResolutionHours.toFixed(1))
          : null,
      },
    });
  } catch (error) {
    logger.error("GET /helpdesk/stats error:", { error });
    return handleError(res, error);
  }
}
