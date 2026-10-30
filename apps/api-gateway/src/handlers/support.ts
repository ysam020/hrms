/**
 * Tenant support — the organisation side (/support/*). Tickets go to the
 * Praesto team, not to the organisation's own HR (that is /helpdesk).
 *
 * Tenant isolation: the tenant is always req.user.tenantId from the verified
 * JWT. Every query below carries it in its `where`; nothing reads a tenant id
 * from the body, query or params. A ticket outside the caller's visibility is
 * a 404, so ids can't be probed. Internal notes, internal attachments and
 * internal activity are excluded in the queries themselves (visibility:
 * "public"), and responses are built from allow-listed fields
 * (services/supportPolicy.ts).
 *
 * Mounted without the active-subscription guard (routes/index.ts): an
 * organisation whose subscription lapsed still needs to reach billing support.
 */
import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { AuthRequest } from "../middleware/authenticate";
import { handleError } from "../utils/handleError";
import { parsePagination } from "../utils/pagination";
import {
  DETAIL_FIELDS,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_CATEGORY_KEYS,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "../config/support";
import {
  attachmentView,
  canActOnTicket,
  canViewTicket,
  capabilitiesOf,
  filterPublic,
  reopenEligibility,
  statusAfterTenantReply,
  statusSideEffects,
  tenantListScope,
  tenantTicketView,
  type TenantActor,
} from "../services/supportPolicy";
import {
  SupportError,
  claimAttachments,
  guardedTicketUpdate,
  inTransaction,
  nextTicketNo,
  peopleById,
  recordActivity,
} from "../services/supportStore";
import {
  deleteUpload,
  inspectUpload,
  newStorageKey,
  presignDownload,
  presignUpload,
  sniffContentType,
  validateUploadRequest,
} from "../services/supportFiles";
import {
  notifyTenantActivity,
  notifyTicketCreated,
} from "../services/supportNotifications";

const OBJECT_ID = /^[a-f0-9]{24}$/i;
/** Same reporter, same text, this recently → the earlier ticket is returned. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
/** Upload URLs one person may hold open (pending/ready, unattached) per hour. */
const MAX_OPEN_UPLOADS_PER_HOUR = 30;

export function supportFail(res: Response, err: unknown, route: string) {
  if (err instanceof SupportError) {
    return apiResponse(res, err.status, { message: err.message });
  }
  // Ticket contents are deliberately not logged.
  logger.error(`${route} error`, { error: err });
  return handleError(res, err);
}

/**
 * The caller as the support module sees them. isSuperUser and permissions
 * are honoured only when the user record belongs to the token's tenant —
 * they are per-organisation grants.
 */
export async function loadTenantActor(req: Request): Promise<TenantActor> {
  const { user } = req as AuthRequest;
  const record = await prisma.user.findUnique({
    where: { id: user!.userId },
    select: { tenantId: true, isSuperUser: true, permissions: true },
  });
  const sameTenant = record?.tenantId === user!.tenantId;
  return {
    userId: user!.userId,
    tenantId: user!.tenantId!,
    tenantRole: user!.tenantRole ?? null,
    isSuperUser: sameTenant && !!record?.isSuperUser,
    permissions: sameTenant ? ((record?.permissions as string[]) ?? []) : [],
  };
}

/** A ticket the actor may see, or a 404 — never a hint that it exists. */
async function findVisibleTicket(actor: TenantActor, id: string) {
  if (!OBJECT_ID.test(id)) throw new SupportError(404, "Ticket not found");
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, tenantId: actor.tenantId },
  });
  if (!ticket || !canViewTicket(actor, ticket)) {
    throw new SupportError(404, "Ticket not found");
  }
  return ticket;
}

function pickDetails(category: string, details?: Record<string, string>) {
  const allowed = DETAIL_FIELDS[category] ?? [];
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const v = details?.[key]?.trim();
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

const csv = (v: unknown) =>
  typeof v === "string" && v ? v.split(",").map((x) => x.trim()) : [];

/** Shared filter parsing for both the tenant and the platform lists. */
export function listFilters(q: Record<string, unknown>) {
  const and: Record<string, unknown>[] = [];
  const statuses = csv(q.status).flatMap((s) =>
    s === "active" ? ["open", "in_progress", "waiting_for_tenant"] : [s],
  );
  if (statuses.length) {
    if (
      statuses.some((s) => !(SUPPORT_STATUSES as readonly string[]).includes(s))
    )
      throw new SupportError(400, "Invalid status filter");
    and.push({ status: { in: statuses } });
  }
  const categories = csv(q.category);
  if (categories.length) {
    if (
      categories.some((c) => !(SUPPORT_CATEGORY_KEYS as string[]).includes(c))
    )
      throw new SupportError(400, "Invalid category filter");
    and.push({ category: { in: categories } });
  }
  const priorities = csv(q.priority);
  if (priorities.length) {
    if (
      priorities.some(
        (p) => !(SUPPORT_PRIORITIES as readonly string[]).includes(p),
      )
    )
      throw new SupportError(400, "Invalid priority filter");
    and.push({ priority: { in: priorities } });
  }
  const sort = String(q.sort ?? "updated_desc");
  const [field, dir] = sort.split("_");
  if (!["updated", "created"].includes(field) || !["asc", "desc"].includes(dir))
    throw new SupportError(400, "Invalid sort");
  const orderBy = {
    [field === "updated" ? "updatedAt" : "createdAt"]: dir as "asc" | "desc",
  };
  const search =
    typeof q.search === "string" ? q.search.trim().slice(0, 100) : "";
  return { and, orderBy, search };
}

// ─────────────────────────────────────────────────────────────────────────────

/** GET /support/context — what this person can do here (UI hints only). */
export async function getSupportContext(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support context",
      data: capabilitiesOf(actor),
    });
  } catch (err) {
    return supportFail(res, err, "GET /support/context");
  }
}

/** GET /support/stats?scope=mine|org */
export async function getSupportStats(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const scope = req.query.scope === "org" ? "org" : "mine";
    const where = tenantListScope(actor, scope);
    if (!where) throw new SupportError(403, "Forbidden");
    const count = (extra: Record<string, unknown>) =>
      prisma.supportTicket.count({ where: { AND: [where, extra] } as any });
    const [total, open, awaiting, resolved] = await Promise.all([
      count({}),
      count({ status: { in: ["open", "in_progress"] } }),
      count({ status: "waiting_for_tenant" }),
      count({ status: { in: ["resolved", "closed"] } }),
    ]);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support stats",
      data: { total, open, awaitingYou: awaiting, resolved },
    });
  } catch (err) {
    return supportFail(res, err, "GET /support/stats");
  }
}

/** GET /support/tickets?scope&status&category&priority&search&sort&page&limit */
export async function listSupportTickets(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const scope = req.query.scope === "org" ? "org" : "mine";
    const scoped = tenantListScope(actor, scope);
    if (!scoped) throw new SupportError(403, "Forbidden");
    const { and, orderBy, search } = listFilters(req.query);
    if (search) {
      and.push({
        OR: [
          { ticketNo: { contains: search, mode: "insensitive" } },
          { subject: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    const where = { AND: [scoped, ...and] } as any;
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
    const people = await peopleById(tickets.map((t) => t.reporterId));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support tickets",
      data: {
        tickets: tickets.map((t) => ({
          ...tenantTicketView(t),
          reporterName: people.get(t.reporterId)?.name ?? "Former member",
          isMine: t.reporterId === actor.userId,
        })),
        total,
        page,
        limit,
      },
    });
  } catch (err) {
    return supportFail(res, err, "GET /support/tickets");
  }
}

/** POST /support/tickets */
export async function createSupportTicket(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    if (!capabilitiesOf(actor).canRaise) {
      throw new SupportError(
        403,
        "Your role can’t raise support tickets. Ask an owner or admin.",
      );
    }
    const body = req.body as {
      category: string;
      subject: string;
      description: string;
      priority: string;
      module?: string;
      details?: Record<string, string>;
      attachmentIds: string[];
    };

    // A double-click or a retried request that slipped past the client and
    // the Idempotency-Key middleware: hand back the ticket just created.
    const recent = await prisma.supportTicket.findFirst({
      where: {
        tenantId: actor.tenantId,
        reporterId: actor.userId,
        subject: body.subject,
        description: body.description,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
    });
    if (recent) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "This ticket was already submitted",
        data: { ...tenantTicketView(recent), duplicate: true },
      });
    }

    const ticketNo = await nextTicketNo();
    const ticket = await inTransaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          ticketNo,
          tenantId: actor.tenantId,
          reporterId: actor.userId,
          subject: body.subject,
          description: body.description,
          category: body.category,
          module: body.module || null,
          details: pickDetails(body.category, body.details) ?? undefined,
          requestedPriority: body.priority,
          // The reporter's urgency is a request, not a triage decision: an
          // "urgent" ticket starts at high until the support team confirms.
          priority: body.priority === "urgent" ? "high" : body.priority,
          status: "open",
          assigneeId: null,
          duplicateOfId: null,
          participantIds: [actor.userId],
        },
      });
      await claimAttachments(tx, body.attachmentIds, {
        uploaderId: actor.userId,
        ticketId: created.id,
        tenantId: actor.tenantId,
        messageId: null,
        visibility: "public",
      });
      await recordActivity(tx, created, {
        actorId: actor.userId,
        actorType: "tenant",
        type: "created",
        toValue: "open",
        metadata: { requestedPriority: body.priority },
        visibility: "public",
      });
      return created;
    });

    void notifyTicketCreated(ticket);
    logger.info(`Support ticket created: ${ticket.ticketNo}`, {
      tenantId: actor.tenantId,
      category: ticket.category,
    });
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Ticket submitted",
      data: tenantTicketView(ticket),
    });
  } catch (err) {
    return supportFail(res, err, "POST /support/tickets");
  }
}

/** GET /support/tickets/:ticketId — ticket + public conversation. */
export async function getSupportTicket(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const ticket = await findVisibleTicket(actor, String(req.params.ticketId));
    const scope = {
      ticketId: ticket.id,
      tenantId: actor.tenantId,
      visibility: "public",
    };
    const [messages, activities, attachments] = await Promise.all([
      prisma.supportMessage.findMany({
        where: scope,
        orderBy: { createdAt: "asc" },
      }),
      prisma.supportActivity.findMany({
        where: scope,
        orderBy: { createdAt: "asc" },
      }),
      prisma.supportAttachment.findMany({
        where: { ...scope, status: "attached" },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const publicMessages = filterPublic(messages);
    const publicActivities = filterPublic(activities);
    const people = await peopleById([
      ticket.reporterId,
      ...publicMessages.map((m) => m.authorId),
      ...publicActivities.map((a) => a.actorId),
    ]);
    // Support agents appear by first name + team, never their email or org.
    const who = (id: string | null, type: string) => {
      if (!id) return { name: "Praesto", isStaff: true };
      const p = people.get(id);
      if (type === "staff") {
        const first = p?.name.split(" ")[0];
        return {
          name: first ? `${first} · Praesto Support` : "Praesto Support",
          isStaff: true,
        };
      }
      return { name: p?.name ?? "Former member", isStaff: false };
    };
    const caps = capabilitiesOf(actor);
    const reopen = reopenEligibility(ticket);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Support ticket",
      data: {
        ticket: {
          ...tenantTicketView(ticket),
          reporterName: people.get(ticket.reporterId)?.name ?? "Former member",
          isMine: ticket.reporterId === actor.userId,
        },
        messages: publicMessages.map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.createdAt,
          author: who(m.authorId, m.authorType),
        })),
        activities: publicActivities.map((a) => ({
          id: a.id,
          type: a.type,
          fromValue: a.fromValue,
          toValue: a.toValue,
          createdAt: a.createdAt,
          actor: who(a.actorId, a.actorType),
        })),
        attachments: filterPublic(attachments).map(attachmentView),
        permissions: {
          canReply:
            canActOnTicket(actor, ticket) &&
            statusAfterTenantReply(ticket.status).ok,
          canReopen: canActOnTicket(actor, ticket) && reopen.ok,
          canClose:
            canActOnTicket(actor, ticket) && ticket.status === "resolved",
          canRaise: caps.canRaise,
        },
      },
    });
  } catch (err) {
    return supportFail(res, err, "GET /support/tickets/:id");
  }
}

/** POST /support/tickets/:ticketId/replies */
export async function replyToSupportTicket(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const ticket = await findVisibleTicket(actor, String(req.params.ticketId));
    if (!canActOnTicket(actor, ticket))
      throw new SupportError(403, "Forbidden");
    const next = statusAfterTenantReply(ticket.status);
    if (!next.ok) throw new SupportError(400, next.reason);
    const { body, attachmentIds } = req.body as {
      body: string;
      attachmentIds: string[];
    };

    const message = await inTransaction(async (tx) => {
      await guardedTicketUpdate(tx, ticket.id, ticket.version, {
        status: next.next,
        participantIds: [...new Set([...ticket.participantIds, actor.userId])],
      });
      const msg = await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          tenantId: ticket.tenantId,
          authorId: actor.userId,
          authorType: "tenant",
          body,
          visibility: "public",
        },
      });
      await claimAttachments(tx, attachmentIds, {
        uploaderId: actor.userId,
        ticketId: ticket.id,
        tenantId: ticket.tenantId,
        messageId: msg.id,
        visibility: "public",
      });
      await recordActivity(tx, ticket, {
        actorId: actor.userId,
        actorType: "tenant",
        type: "replied",
        visibility: "public",
      });
      if (next.next !== ticket.status) {
        await recordActivity(tx, ticket, {
          actorId: actor.userId,
          actorType: "tenant",
          type: "status_changed",
          fromValue: ticket.status,
          toValue: next.next,
          visibility: "public",
        });
      }
      return msg;
    });

    void notifyTenantActivity(ticket, actor.userId, "replied");
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Reply sent",
      data: { messageId: message.id, status: next.next },
    });
  } catch (err) {
    return supportFail(res, err, "POST /support/tickets/:id/replies");
  }
}

/** POST /support/tickets/:ticketId/reopen — resolved → in progress, with a reason. */
export async function reopenSupportTicket(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const ticket = await findVisibleTicket(actor, String(req.params.ticketId));
    if (!canActOnTicket(actor, ticket))
      throw new SupportError(403, "Forbidden");
    const eligible = reopenEligibility(ticket);
    if (!eligible.ok) throw new SupportError(400, eligible.reason);

    await inTransaction(async (tx) => {
      await guardedTicketUpdate(tx, ticket.id, ticket.version, {
        status: "in_progress",
        ...statusSideEffects("in_progress"),
        reopenCount: { increment: 1 },
        lastReopenedAt: new Date(),
        participantIds: [...new Set([...ticket.participantIds, actor.userId])],
      });
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          tenantId: ticket.tenantId,
          authorId: actor.userId,
          authorType: "tenant",
          body: req.body.body,
          visibility: "public",
        },
      });
      await recordActivity(tx, ticket, {
        actorId: actor.userId,
        actorType: "tenant",
        type: "reopened",
        fromValue: "resolved",
        toValue: "in_progress",
        visibility: "public",
      });
    });

    void notifyTenantActivity(ticket, actor.userId, "reopened");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Ticket reopened",
      data: { status: "in_progress" },
    });
  } catch (err) {
    return supportFail(res, err, "POST /support/tickets/:id/reopen");
  }
}

/** POST /support/tickets/:ticketId/close — the tenant confirms a resolution. */
export async function closeSupportTicket(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const ticket = await findVisibleTicket(actor, String(req.params.ticketId));
    if (!canActOnTicket(actor, ticket))
      throw new SupportError(403, "Forbidden");
    if (ticket.status !== "resolved") {
      throw new SupportError(400, "Only a resolved ticket can be closed.");
    }
    await inTransaction(async (tx) => {
      await guardedTicketUpdate(tx, ticket.id, ticket.version, {
        status: "closed",
        closedAt: new Date(),
      });
      await recordActivity(tx, ticket, {
        actorId: actor.userId,
        actorType: "tenant",
        type: "status_changed",
        fromValue: "resolved",
        toValue: "closed",
        visibility: "public",
      });
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Ticket closed",
      data: { status: "closed" },
    });
  } catch (err) {
    return supportFail(res, err, "POST /support/tickets/:id/close");
  }
}

// ── Attachments (shared with the platform handlers) ─────────────────────────

/** Issue a signed upload URL for one file. `scope` is the key's folder. */
export async function startUpload(
  uploader: {
    userId: string;
    tenantId: string | null;
    type: "tenant" | "staff";
  },
  input: { fileName: string; contentType: string; size: number },
) {
  const check = validateUploadRequest(input);
  if (!check.ok) throw new SupportError(400, check.reason);
  const open = await prisma.supportAttachment.count({
    where: {
      uploaderId: uploader.userId,
      status: { in: ["pending", "ready"] },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (open >= MAX_OPEN_UPLOADS_PER_HOUR) {
    throw new SupportError(
      400,
      "Too many uploads in progress. Try again later.",
    );
  }
  const storageKey = newStorageKey(
    uploader.type === "staff" ? "staff" : uploader.tenantId!,
    check.ext,
  );
  const attachment = await prisma.supportAttachment.create({
    data: {
      ticketId: null,
      messageId: null,
      tenantId: uploader.type === "staff" ? null : uploader.tenantId,
      uploaderId: uploader.userId,
      uploaderType: uploader.type,
      storageKey,
      fileName: input.fileName,
      contentType: input.contentType,
      size: input.size,
      status: "pending",
    },
  });
  const uploadUrl = await presignUpload(
    storageKey,
    input.contentType,
    input.size,
  );
  return { attachmentId: attachment.id, uploadUrl };
}

/**
 * Verify an uploaded object from its own bytes. Anything that doesn't check
 * out is deleted from storage and can never be attached.
 */
export async function completeUpload(uploaderId: string, attachmentId: string) {
  if (!OBJECT_ID.test(attachmentId)) {
    throw new SupportError(404, "Upload not found");
  }
  const attachment = await prisma.supportAttachment.findFirst({
    where: { id: attachmentId, uploaderId, status: "pending" },
  });
  if (!attachment) throw new SupportError(404, "Upload not found");

  const object = await inspectUpload(attachment.storageKey);
  if (!object)
    throw new SupportError(400, "The file hasn’t been uploaded yet.");
  const verifiedType = sniffContentType(object.head, attachment.contentType);
  const reason =
    object.size > SUPPORT_ATTACHMENT_MAX_BYTES ||
    object.size !== attachment.size
      ? "The uploaded file doesn’t match the size that was declared."
      : !verifiedType
        ? "This file’s contents don’t match an allowed file type."
        : null;
  if (reason) {
    await deleteUpload(attachment.storageKey).catch((err) =>
      logger.warn("support: failed to delete rejected upload", { err }),
    );
    await prisma.supportAttachment.update({
      where: { id: attachment.id },
      data: { status: "rejected" },
    });
    throw new SupportError(400, reason);
  }
  await prisma.supportAttachment.update({
    where: { id: attachment.id },
    data: { status: "ready", contentType: verifiedType!, size: object.size },
  });
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: verifiedType,
    size: object.size,
  };
}

/** POST /support/attachments */
export async function createSupportUpload(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const data = await startUpload(
      { userId: actor.userId, tenantId: actor.tenantId, type: "tenant" },
      req.body,
    );
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Upload URL issued",
      data,
    });
  } catch (err) {
    return supportFail(res, err, "POST /support/attachments");
  }
}

/** POST /support/attachments/:attachmentId/complete */
export async function completeSupportUpload(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const data = await completeUpload(
      actor.userId,
      String(req.params.attachmentId),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Upload verified",
      data,
    });
  } catch (err) {
    return supportFail(res, err, "POST /support/attachments/:id/complete");
  }
}

/**
 * GET /support/attachments/:attachmentId/url — a 5-minute signed link, only
 * for a public attachment on a ticket this person can see.
 */
export async function getSupportAttachmentUrl(req: Request, res: Response) {
  try {
    const actor = await loadTenantActor(req);
    const id = String(req.params.attachmentId);
    if (!OBJECT_ID.test(id))
      throw new SupportError(404, "Attachment not found");
    const attachment = await prisma.supportAttachment.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
        visibility: "public",
        status: "attached",
      },
    });
    if (!attachment?.ticketId) {
      throw new SupportError(404, "Attachment not found");
    }
    await findVisibleTicket(actor, attachment.ticketId).catch(() => {
      throw new SupportError(404, "Attachment not found");
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Download link",
      data: { url: await presignDownload(attachment) },
    });
  } catch (err) {
    return supportFail(res, err, "GET /support/attachments/:id/url");
  }
}
