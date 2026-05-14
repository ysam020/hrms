import { Request, Response } from "express";
import dns from "dns";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { parsePagination } from "../utils/pagination";

// SSRF protection — block requests to private/loopback/link-local address ranges,
// including IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 etc.)
const PRIVATE_IP_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|::ffff:|fc00:|fe80:)/i;

function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_IP_RE.test(host)) return false;
  // Block 172.16.0.0/12
  const m = host.match(/^172\.(\d+)\./);
  if (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 31) return false;
  return true;
}

// Resolve hostname to IPs and verify none are private — prevents DNS rebinding attacks.
async function isSafeHostname(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (PRIVATE_IP_RE.test(address)) return false;
      // Block 172.16.0.0/12 on resolved IPs
      const m = address.match(/^172\.(\d+)\./);
      if (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function withId<
  T extends { id: string; chatRoomId?: string; replyToId?: string | null },
>(obj: T): T & { _id: string; chatRoom?: string; replyTo?: string | null } {
  const out: any = { ...obj, _id: obj.id };
  if ("chatRoomId" in obj) out.chatRoom = obj.chatRoomId;
  if ("replyToId" in obj) out.replyTo = obj.replyToId ?? null;
  return out;
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
      prisma.user.findMany({
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
      data: messages.reverse().map(withId),
    });
  } catch (error: unknown) {
    logger.error("GET /chat/conversations/:roomId/messages error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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

    // Single MongoDB bulk update — replaces findMany + N individual updates
    await (prisma as any).$runCommandRaw({
      update: "messages",
      updates: [
        {
          q: {
            chatRoomId: roomId,
            isDeleted: false,
            senderId: { $ne: { $oid: userId } },
            readBy: { $not: { $elemMatch: { $eq: { $oid: userId } } } },
          },
          u: { $addToSet: { readBy: { $oid: userId } } },
          multi: true,
        },
      ],
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Messages marked as read",
      data: null,
    });
  } catch (error: unknown) {
    logger.error("POST /chat/conversations/:roomId/read error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    if (msg.senderId !== userId)
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Cannot delete another user's message",
      });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null },
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
