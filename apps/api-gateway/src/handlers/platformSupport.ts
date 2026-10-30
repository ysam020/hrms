/**
 * Tenant support — the Praesto team's side (/platform/support/*), behind
 * requireSupportAgent. Agents see every organisation's tickets, but only
 * support data: ticket fields, the conversation, the reporter's and
 * participants' names/emails, and a few organisation facts (name, plan,
 * subscription state). No HR records are read here.
 *
 * Every state change is a version-guarded update in a transaction with its
 * activity entry (services/supportStore.ts), so two agents acting at once
 * get a 409 instead of silently overwriting each other.
 */
import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { AuthRequest } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import { ACTIVE_STATUSES, type SupportStatus } from "../config/support";
import {
  attachmentView,
  canStaffTransition,
  statusSideEffects,
} from "../services/supportPolicy";
import {
  SupportError,
  claimAttachments,
  guardedTicketUpdate,
  inTransaction,
  isSupportAgentUser,
  supportAgentIds,
  peopleById,
  recordActivity,
} from "../services/supportStore";
import { presignDownload } from "../services/supportFiles";
import {
  notifyAgent,
  notifyStaffReply,
  notifyTenantOfChange,
} from "../services/supportNotifications";
import {
  completeUpload,
  listFilters,
  startUpload,
  supportFail,
} from "./support";

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A security ticket's views are logged at most once per agent per window. */
const SECURITY_VIEW_LOG_WINDOW_MS = 30 * 60 * 1000;

const agentId = (req: Request) => (req as AuthRequest).user!.userId;

async function findTicket(id: string) {
  if (!OBJECT_ID.test(id)) throw new SupportError(404, "Ticket not found");
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new SupportError(404, "Ticket not found");
  return ticket;
}

function staffTicketView(t: any) {
  return {
    id: t.id,
    ticketNo: t.ticketNo,
    tenantId: t.tenantId,
    reporterId: t.reporterId,
    subject: t.subject,
    description: t.description,
    category: t.category,
    module: t.module ?? null,
    details: t.details ?? null,
    requestedPriority: t.requestedPriority,
    priority: t.priority,
    status: t.status,
    assigneeId: t.assigneeId ?? null,
    duplicateOfId: t.duplicateOfId ?? null,
    version: t.version,
    firstResponseAt: t.firstResponseAt ?? null,
    resolvedAt: t.resolvedAt ?? null,
    closedAt: t.closedAt ?? null,
    reopenCount: t.reopenCount ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

async function tenantsById(ids: string[]) {
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true,
      name: true,
      slug: true,
      planTier: true,
      subscriptionStatus: true,
      isActive: true,
      createdAt: true,
    },
  });
  return new Map(tenants.map((t) => [t.id, t]));
}

const average = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * GET /platform/support/stats
 * Response/resolution metrics cover the last 30 days and say how many
 * tickets they're based on:
 *  - first response: createdAt → first public agent reply, over tickets
 *    created in the window that have had one;
 *  - resolution: createdAt → resolvedAt, over tickets resolved in the window
 *    (a reopened ticket counts from its latest resolution).
 */
export async function getPlatformSupportStats(req: Request, res: Response) {
  try {
    const me = agentId(req);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const count = (where: Record<string, unknown>) =>
      prisma.supportTicket.count({ where: where as any });
    const [
      total,
      open,
      inProgress,
      waiting,
      resolved,
      urgent,
      mine,
      unassigned,
      responded,
      resolvedRecently,
      recent,
    ] = await Promise.all([
      count({}),
      count({ status: "open" }),
      count({ status: "in_progress" }),
      count({ status: "waiting_for_tenant" }),
      count({ status: "resolved" }),
      count({ priority: "urgent", status: { in: ACTIVE_STATUSES } }),
      count({ assigneeId: me, status: { in: ACTIVE_STATUSES } }),
      count({ assigneeId: null, status: { in: ACTIVE_STATUSES } }),
      prisma.supportTicket.findMany({
        where: { createdAt: { gte: since }, firstResponseAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true },
        take: 5000,
      }),
      prisma.supportTicket.findMany({
        where: { resolvedAt: { gte: since } },
        select: { createdAt: true, resolvedAt: true },
        take: 5000,
      }),
      prisma.supportTicket.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);
    const hours = (a: Date, b: Date) =>
      (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
    const firstResponse = average(
      responded.map((t) => hours(t.createdAt, t.firstResponseAt!)),
    );
    const resolution = average(
      resolvedRecently.map((t) => hours(t.createdAt, t.resolvedAt!)),
    );
    const tenants = await tenantsById(recent.map((t) => t.tenantId));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support stats",
      data: {
        counts: {
          total,
          open,
          inProgress,
          waiting,
          resolved,
          urgent,
          mine,
          unassigned,
        },
        metrics: {
          windowDays: 30,
          avgFirstResponseHours:
            firstResponse === null ? null : Number(firstResponse.toFixed(1)),
          firstResponseSample: responded.length,
          avgResolutionHours:
            resolution === null ? null : Number(resolution.toFixed(1)),
          resolutionSample: resolvedRecently.length,
        },
        recent: recent.map((t) => ({
          ...staffTicketView(t),
          tenantName: tenants.get(t.tenantId)?.name ?? "Unknown organisation",
        })),
      },
    });
  } catch (err) {
    return supportFail(res, err, "GET /platform/support/stats");
  }
}

/** GET /platform/support/agents — who tickets can be assigned to. */
export async function listSupportAgents(req: Request, res: Response) {
  try {
    const people = await peopleById(await supportAgentIds());
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support agents",
      data: [...people.values()].map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
      })),
    });
  } catch (err) {
    return supportFail(res, err, "GET /platform/support/agents");
  }
}

/**
 * GET /platform/support/tickets
 *   ?status&category&priority (comma lists) &tenantId &assignee=me|unassigned|<id>
 *   &from&to (created, ISO dates) &search (ticket no, subject, organisation)
 *   &sort=updated_desc|updated_asc|created_desc|created_asc &page&limit
 */
export async function listPlatformSupportTickets(req: Request, res: Response) {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { and, orderBy, search } = listFilters(q);
    if (q.tenantId) {
      if (!OBJECT_ID.test(q.tenantId))
        throw new SupportError(400, "Invalid organisation filter");
      and.push({ tenantId: q.tenantId });
    }
    if (q.assignee === "me") and.push({ assigneeId: agentId(req) });
    else if (q.assignee === "unassigned") and.push({ assigneeId: null });
    else if (q.assignee) {
      if (!OBJECT_ID.test(q.assignee))
        throw new SupportError(400, "Invalid assignee filter");
      and.push({ assigneeId: q.assignee });
    }
    const range: Record<string, Date> = {};
    for (const [key, op] of [
      ["from", "gte"],
      ["to", "lte"],
    ] as const) {
      if (!q[key]) continue;
      const d = new Date(q[key]!);
      if (Number.isNaN(d.getTime()))
        throw new SupportError(400, "Invalid date");
      // "to" is inclusive of that whole day.
      range[op] = key === "to" ? new Date(d.getTime() + DAY_MS - 1) : d;
    }
    if (Object.keys(range).length) and.push({ createdAt: range });
    if (search) {
      const matchingTenants = await prisma.tenant.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      });
      and.push({
        OR: [
          { ticketNo: { contains: search, mode: "insensitive" } },
          { subject: { contains: search, mode: "insensitive" } },
          ...(matchingTenants.length
            ? [{ tenantId: { in: matchingTenants.map((t) => t.id) } }]
            : []),
        ],
      });
    }
    const where = (and.length ? { AND: and } : {}) as any;
    const { page, limit } = parsePagination(req.query);
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    const [tenants, people] = await Promise.all([
      tenantsById(tickets.map((t) => t.tenantId)),
      peopleById(tickets.flatMap((t) => [t.reporterId, t.assigneeId])),
    ]);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support tickets",
      data: {
        tickets: tickets.map((t) => ({
          ...staffTicketView(t),
          tenantName: tenants.get(t.tenantId)?.name ?? "Unknown organisation",
          reporterName: people.get(t.reporterId)?.name ?? "Unknown",
          assigneeName: t.assigneeId
            ? (people.get(t.assigneeId)?.name ?? "Unknown")
            : null,
        })),
        total,
        page,
        limit,
      },
    });
  } catch (err) {
    return supportFail(res, err, "GET /platform/support/tickets");
  }
}

/** GET /platform/support/tickets/:ticketId — everything, internal included. */
export async function getPlatformSupportTicket(req: Request, res: Response) {
  try {
    const me = agentId(req);
    const ticket = await findTicket(String(req.params.ticketId));

    // Security reports: record who looked (internal, throttled per agent).
    if (ticket.category === "security") {
      const recentView = await prisma.supportActivity.findFirst({
        where: {
          ticketId: ticket.id,
          actorId: me,
          type: "security_viewed",
          createdAt: {
            gte: new Date(Date.now() - SECURITY_VIEW_LOG_WINDOW_MS),
          },
        },
      });
      if (!recentView) {
        await recordActivity(prisma, ticket, {
          actorId: me,
          actorType: "staff",
          type: "security_viewed",
          visibility: "internal",
        });
      }
    }

    const [messages, activities, attachments, duplicateOf] = await Promise.all([
      prisma.supportMessage.findMany({
        where: { ticketId: ticket.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.supportActivity.findMany({
        where: { ticketId: ticket.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.supportAttachment.findMany({
        where: { ticketId: ticket.id, status: "attached" },
        orderBy: { createdAt: "asc" },
      }),
      ticket.duplicateOfId
        ? prisma.supportTicket.findUnique({
            where: { id: ticket.duplicateOfId },
            select: { id: true, ticketNo: true },
          })
        : null,
    ]);
    const [tenants, people] = await Promise.all([
      tenantsById([ticket.tenantId]),
      peopleById([
        ticket.reporterId,
        ticket.assigneeId,
        ...ticket.participantIds,
        ...messages.map((m) => m.authorId),
        ...activities.map((a) => a.actorId),
      ]),
    ]);
    const person = (id: string | null) => {
      const p = id ? people.get(id) : undefined;
      return p ? { id: p.id, name: p.name, email: p.email } : null;
    };
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support ticket",
      data: {
        ticket: staffTicketView(ticket),
        tenant: tenants.get(ticket.tenantId) ?? null,
        reporter: person(ticket.reporterId),
        assignee: person(ticket.assigneeId),
        participants: ticket.participantIds.map(person).filter(Boolean),
        duplicateOf,
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          visibility: m.visibility,
          authorType: m.authorType,
          createdAt: m.createdAt,
          author: person(m.authorId),
        })),
        activities: activities.map((a) => ({
          id: a.id,
          type: a.type,
          fromValue: a.fromValue,
          toValue: a.toValue,
          visibility: a.visibility,
          actorType: a.actorType,
          createdAt: a.createdAt,
          actor: person(a.actorId),
        })),
        attachments: attachments.map(attachmentView),
      },
    });
  } catch (err) {
    return supportFail(res, err, "GET /platform/support/tickets/:id");
  }
}

/**
 * POST /platform/support/tickets/:ticketId/replies
 * Public reply: moves the ticket to `status` (default Waiting for Tenant —
 * the explicit rule: an agent's reply hands the ball to the tenant unless
 * the agent says otherwise). Internal note: never changes status and is
 * never sent to the tenant.
 */
export async function replyAsAgent(req: Request, res: Response) {
  try {
    const me = agentId(req);
    const { body, visibility, status, attachmentIds, version } = req.body as {
      body: string;
      visibility: "public" | "internal";
      status?: SupportStatus;
      attachmentIds: string[];
      version: number;
    };
    const ticket = await findTicket(String(req.params.ticketId));
    if (ticket.status === "closed") {
      throw new SupportError(400, "This ticket is closed.");
    }
    const isPublic = visibility === "public";
    const next: SupportStatus = isPublic
      ? (status ?? "waiting_for_tenant")
      : (ticket.status as SupportStatus);
    if (next !== ticket.status && !canStaffTransition(ticket.status, next)) {
      throw new SupportError(
        400,
        `A ${ticket.status.replace(/_/g, " ")} ticket can’t move to ${next.replace(/_/g, " ")}.`,
      );
    }

    const message = await inTransaction(async (tx) => {
      const now = new Date();
      await guardedTicketUpdate(
        tx,
        ticket.id,
        version,
        isPublic
          ? {
              status: next,
              ...(next !== ticket.status ? statusSideEffects(next, now) : {}),
              ...(ticket.firstResponseAt ? {} : { firstResponseAt: now }),
            }
          : {},
      );
      const msg = await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          tenantId: ticket.tenantId,
          authorId: me,
          authorType: "staff",
          body,
          visibility,
        },
      });
      await claimAttachments(tx, attachmentIds, {
        uploaderId: me,
        ticketId: ticket.id,
        tenantId: ticket.tenantId,
        messageId: msg.id,
        visibility,
      });
      await recordActivity(tx, ticket, {
        actorId: me,
        actorType: "staff",
        type: isPublic ? "replied" : "note_added",
        visibility,
      });
      if (next !== ticket.status) {
        await recordActivity(tx, ticket, {
          actorId: me,
          actorType: "staff",
          type: "status_changed",
          fromValue: ticket.status,
          toValue: next,
          visibility: "public",
        });
      }
      return msg;
    });

    if (isPublic) {
      void notifyStaffReply(ticket, body);
    } else if (ticket.assigneeId && ticket.assigneeId !== me) {
      void notifyAgent(ticket, ticket.assigneeId, "note");
    }
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: isPublic ? "Reply sent" : "Internal note added",
      data: { messageId: message.id, status: next },
    });
  } catch (err) {
    return supportFail(res, err, "POST /platform/support/tickets/:id/replies");
  }
}

/** PATCH /platform/support/tickets/:ticketId — status, priority, assignee. */
export async function updateTicketAsAgent(req: Request, res: Response) {
  try {
    const me = agentId(req);
    const { status, priority, assigneeId, version } = req.body as {
      status?: SupportStatus;
      priority?: string;
      assigneeId?: string | null;
      version: number;
    };
    const ticket = await findTicket(String(req.params.ticketId));
    const statusChanges = status !== undefined && status !== ticket.status;
    const priorityChanges =
      priority !== undefined && priority !== ticket.priority;
    const assigneeChanges =
      assigneeId !== undefined && assigneeId !== ticket.assigneeId;

    if (statusChanges && !canStaffTransition(ticket.status, status!)) {
      throw new SupportError(
        400,
        `A ${ticket.status.replace(/_/g, " ")} ticket can’t move to ${status!.replace(/_/g, " ")}.`,
      );
    }
    if (
      assigneeChanges &&
      assigneeId &&
      !(await isSupportAgentUser(assigneeId))
    ) {
      throw new SupportError(
        400,
        "Tickets can only be assigned to Praesto team members with support access.",
      );
    }
    if (!statusChanges && !priorityChanges && !assigneeChanges) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Nothing changed",
        data: staffTicketView(ticket),
      });
    }

    await inTransaction(async (tx) => {
      await guardedTicketUpdate(tx, ticket.id, version, {
        ...(statusChanges ? { status, ...statusSideEffects(status!) } : {}),
        ...(priorityChanges ? { priority } : {}),
        ...(assigneeChanges ? { assigneeId } : {}),
      });
      const base = { actorId: me, actorType: "staff" as const };
      if (statusChanges) {
        await recordActivity(tx, ticket, {
          ...base,
          type: "status_changed",
          fromValue: ticket.status,
          toValue: status,
          visibility: "public",
        });
      }
      if (priorityChanges) {
        await recordActivity(tx, ticket, {
          ...base,
          type: "priority_changed",
          fromValue: ticket.priority,
          toValue: priority,
          visibility: "public",
        });
      }
      if (assigneeChanges) {
        // Who works a ticket is the support team's business.
        await recordActivity(tx, ticket, {
          ...base,
          type: "assigned",
          fromValue: ticket.assigneeId,
          toValue: assigneeId ?? null,
          visibility: "internal",
        });
      }
    });

    if (statusChanges)
      void notifyTenantOfChange(ticket, { field: "status", to: status! });
    if (priorityChanges)
      void notifyTenantOfChange(ticket, { field: "priority", to: priority! });
    if (assigneeChanges && assigneeId && assigneeId !== me)
      void notifyAgent(ticket, assigneeId, "assigned");

    const updated = await findTicket(ticket.id);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Ticket updated",
      data: staffTicketView(updated),
    });
  } catch (err) {
    return supportFail(res, err, "PATCH /platform/support/tickets/:id");
  }
}

/**
 * POST /platform/support/tickets/:ticketId/duplicate — close as a duplicate
 * of another ticket from the same organisation (never another tenant's,
 * whose number the tenant would then see).
 */
export async function markDuplicate(req: Request, res: Response) {
  try {
    const me = agentId(req);
    const { duplicateOfTicketNo, version } = req.body as {
      duplicateOfTicketNo: string;
      version: number;
    };
    const ticket = await findTicket(String(req.params.ticketId));
    const original = await prisma.supportTicket.findFirst({
      where: {
        ticketNo: duplicateOfTicketNo.toUpperCase(),
        tenantId: ticket.tenantId,
      },
    });
    if (!original || original.id === ticket.id) {
      throw new SupportError(
        400,
        "Pick another ticket from the same organisation.",
      );
    }
    if (
      ticket.status !== "closed" &&
      !canStaffTransition(ticket.status, "closed")
    ) {
      throw new SupportError(400, "This ticket can’t be closed.");
    }
    await inTransaction(async (tx) => {
      await guardedTicketUpdate(tx, ticket.id, version, {
        duplicateOfId: original.id,
        status: "closed",
        closedAt: new Date(),
      });
      await recordActivity(tx, ticket, {
        actorId: me,
        actorType: "staff",
        type: "marked_duplicate",
        toValue: original.ticketNo,
        visibility: "public",
      });
      if (ticket.status !== "closed") {
        await recordActivity(tx, ticket, {
          actorId: me,
          actorType: "staff",
          type: "status_changed",
          fromValue: ticket.status,
          toValue: "closed",
          visibility: "public",
        });
      }
    });
    if (ticket.status !== "closed")
      void notifyTenantOfChange(ticket, { field: "status", to: "closed" });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Closed as a duplicate of ${original.ticketNo}`,
    });
  } catch (err) {
    return supportFail(
      res,
      err,
      "POST /platform/support/tickets/:id/duplicate",
    );
  }
}

// ── Attachments ─────────────────────────────────────────────────────────────

export async function createAgentUpload(req: Request, res: Response) {
  try {
    const data = await startUpload(
      { userId: agentId(req), tenantId: null, type: "staff" },
      req.body,
    );
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Upload URL issued",
      data,
    });
  } catch (err) {
    return supportFail(res, err, "POST /platform/support/attachments");
  }
}

export async function completeAgentUpload(req: Request, res: Response) {
  try {
    const data = await completeUpload(
      agentId(req),
      String(req.params.attachmentId),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Upload verified",
      data,
    });
  } catch (err) {
    return supportFail(
      res,
      err,
      "POST /platform/support/attachments/:id/complete",
    );
  }
}

export async function getAgentAttachmentUrl(req: Request, res: Response) {
  try {
    const id = String(req.params.attachmentId);
    if (!OBJECT_ID.test(id))
      throw new SupportError(404, "Attachment not found");
    const attachment = await prisma.supportAttachment.findFirst({
      where: { id, status: "attached" },
    });
    if (!attachment) throw new SupportError(404, "Attachment not found");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Download link",
      data: { url: await presignDownload(attachment) },
    });
  } catch (err) {
    return supportFail(res, err, "GET /platform/support/attachments/:id/url");
  }
}
