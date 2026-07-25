import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma, prisma as masterPrisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  apiResponse,
  RESPONSE_STATUS,
  isSafeUrl,
  isSafeHostname,
} from "@hrms/common";
import { handleError } from "../utils/handleError";
import { parsePagination } from "../utils/pagination";

function withId<
  T extends { id: string; chatRoomId?: string; replyToId?: string | null },
>(obj: T): T & { _id: string; chatRoom?: string; replyTo?: string | null } {
  const out: any = { ...obj, _id: obj.id };
  if ("chatRoomId" in obj) out.chatRoom = obj.chatRoomId;
  if ("replyToId" in obj) out.replyTo = obj.replyToId ?? null;
  return out;
}

const MAX_PINNED_MESSAGES = 5;

// Populates each message's `replyTo` (currently just a raw replyToId on the
// stored doc) with a lightweight preview of the message it replies to —
// content/fileName/sender/isDeleted. Without this, the frontend reply
// preview only ever worked for the sender's own optimistic render (it
// already holds the full clicked message client-side); anyone loading
// history or receiving the message in real time saw nothing useful.
async function resolveReplyTo(messages: any[]): Promise<any[]> {
  const replyIds = [
    ...new Set(messages.map((m) => m.replyToId).filter(Boolean)),
  ] as string[];

  const withIds = messages.map(withId);
  if (replyIds.length === 0) return withIds;

  const replySources = await prisma.message.findMany({
    where: { id: { in: replyIds } },
    select: {
      id: true,
      content: true,
      type: true,
      fileName: true,
      senderId: true,
      isDeleted: true,
    },
  });
  const replyMap = new Map(replySources.map((r: any) => [r.id, r]));

  return withIds.map((m: any) => {
    if (!m.replyTo) return m;
    const src = replyMap.get(m.replyTo);
    return {
      ...m,
      replyTo: src
        ? {
            _id: src.id,
            content: src.isDeleted ? null : src.content,
            type: src.type,
            fileName: src.isDeleted ? null : src.fileName,
            senderId: src.senderId,
            isDeleted: src.isDeleted,
          }
        : null,
    };
  });
}

export async function getConversations(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;

    const rooms = await prisma.chatRoom.findMany({
      where: {
        participants: { has: userId },
        NOT: { deletedFor: { has: userId } },
      },
      orderBy: { lastActivity: "desc" },
    });

    const roomIds = rooms.map((r: any) => r.id);
    const lastMessageIds = rooms
      .map((r: any) => r.lastMessageId)
      .filter(Boolean) as string[];

    const allParticipantIds = [
      ...new Set(rooms.flatMap((r: any) => r.participants)),
    ];

    const [lastMessages, participantUsers] = await Promise.all([
      lastMessageIds.length
        ? prisma.message.findMany({
            where: { id: { in: lastMessageIds } },
            select: {
              id: true,
              content: true,
              senderId: true,
              type: true,
              createdAt: true,
              isDeleted: true,
            },
          })
        : Promise.resolve([]),
      // Use base masterPrisma (no tenantId filter) so participants from any
      // tenant context can be resolved to their display name.
      masterPrisma.user.findMany({
        where: { id: { in: allParticipantIds } },
        select: {
          id: true,
          username: true,
          first_name: true,
          last_name: true,
          employee_photo: true,
          designation: true,
        },
      }),
    ]);

    const msgMap = new Map(lastMessages.map((m: any) => [m.id, m]));
    const userMap = new Map(participantUsers.map((u: any) => [u.id, u]));

    const rawCounts = await prisma.message.groupBy({
      by: ["chatRoomId"],
      where: {
        chatRoomId: { in: roomIds },
        isDeleted: false,
        NOT: [{ senderId: userId }, { readBy: { has: userId } }],
      },
      _count: { id: true },
    });
    const countByRoom = new Map(
      rawCounts.map((r: any) => [r.chatRoomId, r._count.id]),
    );
    const unreadCounts = roomIds.map((id: string) => countByRoom.get(id) ?? 0);

    const result = rooms.map((room: any, i: any) => {
      const lastMsg = room.lastMessageId
        ? (msgMap.get(room.lastMessageId) ?? null)
        : null;
      return withId({
        ...room,
        lastMessage: lastMsg ? withId(lastMsg as any) : null,
        participantDetails: room.participants.map(
          (p: any) => userMap.get(p) ?? { id: p },
        ),
        unreadCount: unreadCounts[i],
      });
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Conversations retrieved",
      data: result,
    });
  } catch (error: unknown) {
    logger.error("GET /chat/conversations error:", { error });
    return handleError(res, error);
  }
}

export async function startConversation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;

    const { recipientUserId } = req.body;
    if (!recipientUserId)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "recipientUserId is required",
      });
    if (recipientUserId === userId)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot start a conversation with yourself",
      });

    const existing = await prisma.chatRoom.findFirst({
      where: {
        type: "direct",
        participants: { hasEvery: [userId, recipientUserId] },
      },
    });

    if (existing) {
      const room = existing.deletedFor?.includes(userId)
        ? await prisma.chatRoom.update({
            where: { id: existing.id },
            data: {
              deletedFor: {
                set: existing.deletedFor.filter((u: any) => u !== userId),
              },
            },
          })
        : existing;
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Conversation started",
        data: withId(room),
      });
    }

    const room = await prisma.chatRoom.create({
      data: {
        tenantId: (req as AuthRequest).user!.tenantId!,
        participants: [userId, recipientUserId],
        type: "direct",
        lastActivity: new Date(),
        deletedFor: [],
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Conversation started",
      data: withId(room),
    });
  } catch (error: unknown) {
    logger.error("POST /chat/conversations/start error:", { error });
    return handleError(res, error);
  }
}

export async function getMessages(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const roomId = String(req.params.roomId);
    const { limit } = parsePagination(req.query, 50);
    const before = req.query.before as string | undefined;

    const userId = user!.userId;

    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Conversation not found",
      });
    if (!room.participants.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    const where: any = { chatRoomId: roomId };
    if (before) {
      const cursorMsg = await prisma.message.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (cursorMsg) where.createdAt = { lt: cursorMsg.createdAt };
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Messages retrieved",
      data: await resolveReplyTo(messages.reverse()),
    });
  } catch (error: unknown) {
    logger.error("GET /chat/conversations/:roomId/messages error:", { error });
    return handleError(res, error);
  }
}

export async function markMessagesRead(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const roomId = String(req.params.roomId);

    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Conversation not found",
      });
    if (!room.participants.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    // Single Prisma bulk update — replaces findMany + N individual updates.
    // Previously a raw $runCommandRaw (bypassed attachAuditLogging, which
    // only hooks Prisma model actions). The `NOT: { readBy: { has: userId } }`
    // filter guarantees `push` can't create a duplicate, since every matched
    // doc is one where userId isn't already in readBy.
    await prisma.message.updateMany({
      where: {
        chatRoomId: roomId,
        isDeleted: false,
        senderId: { not: userId },
        NOT: { readBy: { has: userId } },
      },
      data: { readBy: { push: userId } },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Messages marked as read",
      data: null,
    });
  } catch (error: unknown) {
    logger.error("POST /chat/conversations/:roomId/read error:", { error });
    return handleError(res, error);
  }
}

export async function getUnreadCounts(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;

    const rooms = await prisma.chatRoom.findMany({
      where: {
        participants: { has: userId },
        NOT: { deletedFor: { has: userId } },
      },
      select: { id: true },
    });

    const roomIds = rooms.map((r: any) => r.id);
    const rawCounts = await prisma.message.groupBy({
      by: ["chatRoomId"],
      where: {
        chatRoomId: { in: roomIds },
        isDeleted: false,
        NOT: [{ senderId: userId }, { readBy: { has: userId } }],
      },
      _count: { id: true },
    });

    const countMap = Object.fromEntries(
      rawCounts.map((r: any) => [r.chatRoomId, r._count.id]),
    );
    const counts = Object.fromEntries(
      roomIds.map((id: string) => [id, countMap[id] ?? 0]),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Unread counts retrieved",
      data: counts,
    });
  } catch (error: unknown) {
    logger.error("GET /chat/unread-counts error:", { error });
    return handleError(res, error);
  }
}

export async function deleteMessage(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const messageId = String(req.params.messageId);
    const msg = await prisma.message.findUnique({ where: { id: messageId } });

    if (!msg)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Message not found",
      });

    // Any participant of the room may delete a message — it deletes for
    // both sides (no sender-only restriction, no "delete for me" variant).
    const room = await prisma.chatRoom.findUnique({
      where: { id: msg.chatRoomId },
      select: { participants: true },
    });
    if (!room || !room.participants.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    const updated = await prisma.message.update({
      where: { id: messageId },
      // A deleted message can't stay pinned — clear pin state too.
      data: {
        isDeleted: true,
        content: null,
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Message deleted",
      data: {
        messageId: updated.id,
        _id: updated.id,
        chatRoomId: updated.chatRoomId,
      },
    });
  } catch (error: unknown) {
    logger.error("DELETE /chat/messages/:messageId error:", { error });
    return handleError(res, error);
  }
}

export async function deleteConversation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const roomId = String(req.params.roomId);
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Conversation not found",
      });

    if (!room.deletedFor.includes(userId)) {
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { deletedFor: { push: userId } },
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Conversation deleted",
      data: null,
    });
  } catch (error: unknown) {
    logger.error("DELETE /chat/conversations/:roomId error:", { error });
    return handleError(res, error);
  }
}

export async function pinMessage(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const messageId = String(req.params.messageId);
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Message not found",
      });
    if (msg.isDeleted)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot pin a deleted message",
      });

    const room = await prisma.chatRoom.findUnique({
      where: { id: msg.chatRoomId },
      select: { participants: true },
    });
    if (!room || !room.participants.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    if (msg.isPinned) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Already pinned",
        data: withId(msg),
      });
    }

    const pinnedCount = await prisma.message.count({
      where: { chatRoomId: msg.chatRoomId, isPinned: true },
    });
    if (pinnedCount >= MAX_PINNED_MESSAGES)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Cannot pin more than ${MAX_PINNED_MESSAGES} messages in a chat. Unpin one first.`,
      });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true, pinnedAt: new Date(), pinnedBy: userId },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Message pinned",
      data: withId(updated),
    });
  } catch (error: unknown) {
    logger.error("POST /chat/messages/:messageId/pin error:", { error });
    return handleError(res, error);
  }
}

export async function unpinMessage(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const messageId = String(req.params.messageId);
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Message not found",
      });

    const room = await prisma.chatRoom.findUnique({
      where: { id: msg.chatRoomId },
      select: { participants: true },
    });
    if (!room || !room.participants.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false, pinnedAt: null, pinnedBy: null },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Message unpinned",
      data: withId(updated),
    });
  } catch (error: unknown) {
    logger.error("DELETE /chat/messages/:messageId/pin error:", { error });
    return handleError(res, error);
  }
}

export async function getPinnedMessages(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const roomId = String(req.params.roomId);
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { participants: true },
    });
    if (!room)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Conversation not found",
      });
    if (!room.participants.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    const pinned = await prisma.message.findMany({
      where: { chatRoomId: roomId, isPinned: true },
      orderBy: { pinnedAt: "desc" },
      take: MAX_PINNED_MESSAGES,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pinned messages retrieved",
      data: pinned.map(withId),
    });
  } catch (error: unknown) {
    logger.error("GET /chat/conversations/:roomId/pinned error:", { error });
    return handleError(res, error);
  }
}

export async function ogPreview(req: Request, res: Response) {
  try {
    const url = String(req.query.url || "");
    if (!url)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "URL required",
      });

    if (!isSafeUrl(url))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid or disallowed URL",
      });

    // Resolve DNS and re-check IPs to prevent DNS rebinding attacks
    const hostname = new URL(url).hostname;
    if (!(await isSafeHostname(hostname)))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid or disallowed URL",
      });

    const response = await fetch(url, {
      redirect: "error", // prevent redirect-based SSRF bypassing isSafeHostname
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    const html = await response.text();
    const getMeta = (prop: string) => {
      const m =
        html.match(
          new RegExp(
            `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
            "i",
          ),
        ) ||
        html.match(
          new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
            "i",
          ),
        );
      return m ? m[1] : null;
    };

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "OK",
      data: {
        title: getMeta("og:title") || getMeta("twitter:title"),
        description:
          getMeta("og:description") || getMeta("twitter:description"),
        image: getMeta("og:image") || getMeta("twitter:image"),
        siteName: getMeta("og:site_name"),
        url,
      },
    });
  } catch {
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "OK",
      data: {
        title: null,
        description: null,
        image: null,
        siteName: null,
        url: req.query.url,
      },
    });
  }
}
