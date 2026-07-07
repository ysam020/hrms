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
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import { getSchedulerQueue } from "@hrms/queue";
import dayjs from "dayjs";

// SLA hours keyed by priority.
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};

async function assertHrRole(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isSuperUser: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return user.role.some((r) => ["owner", "admin", "hr"].includes(r));
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
    const isHr = await assertHrRole(user!.userId);
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
    const isHr = await assertHrRole(user!.userId);

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
    const commentAuthorIds = [
      ...new Set(visibleComments.map((c: any) => c.userId)),
    ];
    const authors = await prisma.user.findMany({
      where: { id: { in: commentAuthorIds as string[] } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const aMap = new Map(authors.map((a) => [a.id, a]));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Ticket retrieved",
      data: {
        ...ticket,
        comments: visibleComments.map((c: any) => ({
          ...c,
          author: aMap.get(c.userId),
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
    const isHr = await assertHrRole(user!.userId);

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
    const isHr = await assertHrRole(user!.userId);

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
    if (!(await assertHrRole(user!.userId))) {
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
