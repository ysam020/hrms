import type { Server as SocketServer, Socket } from "socket.io";
import {
  prismaWithTenant as prisma,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { sendPushNotifications } from "@hrms/firebase";
import type { RedisWebSocketAdapter } from "@hrms/websocket";

type AuthenticatedSocket = Socket & {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
};

export function setupChatSocket(
  io: SocketServer,
  redisAdapter: RedisWebSocketAdapter,
): void {
  io.on("connection", (socket) => {
    const userId = (socket as AuthenticatedSocket).userId;
    const tenantId = (socket as AuthenticatedSocket).tenantId;
    const dbName = (socket as AuthenticatedSocket).dbName ?? null;

    // Per-connection cache of roomId → participants[] to avoid repeated DB hits
    const roomParticipantsCache = new Map<string, string[]>();

    // Tenant-scoped queries (unlike REST requests) get no automatic
    // AsyncLocalStorage context, so every DB call here must be run through
    // this helper or it silently falls back to the wrong (master) DB.
    const tenantClient = tenantId && dbName ? getClientForDb(dbName) : null;
    const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
      tenantId ? runWithTenant(tenantId, tenantClient, fn) : fn();

    const getParticipants = async (roomId: string): Promise<string[]> => {
      if (roomParticipantsCache.has(roomId))
        return roomParticipantsCache.get(roomId)!;
      const room = await withTenant(() =>
        prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: { participants: true },
        }),
      );
      const participants = room?.participants ?? [];
      roomParticipantsCache.set(roomId, participants);
      return participants;
    };

    // Client joins a room — pre-fetch participants into cache
    socket.on("chat:join", async ({ roomId }: { roomId: string }) => {
      try {
        await getParticipants(roomId);
      } catch (err) {
        logger.error(`chat:join error for ${userId}:`, { err });
      }
    });

    // Client sends a new message
    socket.on(
      "chat:send",
      async ({
        roomId,
        content,
        type,
        replyTo,
        fileUrl,
        fileName,
        fileMimeType,
        fileSize,
      }: {
        roomId: string;
        content?: string;
        type?: string;
        replyTo?: string;
        fileUrl?: string;
        fileName?: string;
        fileMimeType?: string;
        fileSize?: number;
      }) => {
        try {
          // Verify sender is a participant of this room
          const participants = await getParticipants(roomId);
          if (!participants.includes(userId)) {
            socket.emit("chat:error", {
              message: "Not a participant of this room",
            });
            return;
          }

          // Enforce message content size limit (10 000 chars)
          if (content && content.length > 10_000) {
            socket.emit("chat:error", {
              message: "Message too long (max 10 000 characters)",
            });
            return;
          }

          const createMessage = () =>
            prisma.message.create({
              data: {
                tenantId: tenantId!,
                chatRoomId: roomId,
                senderId: userId,
                content: content ?? null,
                type: type ?? "text",
                fileUrl: fileUrl ?? null,
                fileName: fileName ?? null,
                fileMimeType: fileMimeType ?? null,
                fileSize: fileSize ?? null,
                replyToId: replyTo ?? null,
                readBy: [],
                isDeleted: false,
              },
            });
          const message = await withTenant(createMessage);

          // Update room's lastMessage pointer and lastActivity timestamp
          await withTenant(() =>
            prisma.chatRoom.update({
              where: { id: roomId },
              data: {
                lastMessageId: message.id,
                lastActivity: message.createdAt,
              },
            }),
          );

          const msgObj = {
            ...message,
            _id: message.id,
            chatRoom: message.chatRoomId,
            replyTo: message.replyToId ?? null,
          };

          await Promise.all(
            participants.map((p) =>
              redisAdapter.sendToUser(p, "chat:message", msgObj),
            ),
          );

          // FCM push to other participants (non-blocking)
          const others = participants.filter((p) => p !== userId);
          if (others.length > 0) {
            const pushBody =
              type === "image"
                ? "📷 Sent an image"
                : type === "video"
                  ? "Sent a video"
                  : type === "file"
                    ? `${fileName || "Sent a file"}`
                    : (content ?? "");
            sendPushNotifications(others, userId, pushBody, {
              latestOnly: true,
            }).catch((err) =>
              logger.error("[chat:send] FCM push error:", { err }),
            );
          }
        } catch (err) {
          logger.error(`chat:send error for ${userId}:`, { err });
          socket.emit("chat:error", { message: "Failed to send message" });
        }
      },
    );

    // Typing started — forward to other participants only
    socket.on("chat:typing", async ({ roomId }: { roomId: string }) => {
      try {
        const participants = await getParticipants(roomId);
        await Promise.all(
          participants
            .filter((p) => p !== userId)
            .map((p) =>
              redisAdapter.sendToUser(p, "chat:typing", { roomId, userId }),
            ),
        );
      } catch {
        /* non-critical */
      }
    });

    // Typing stopped — forward to other participants only
    socket.on("chat:stop-typing", async ({ roomId }: { roomId: string }) => {
      try {
        const participants = await getParticipants(roomId);
        await Promise.all(
          participants
            .filter((p) => p !== userId)
            .map((p) =>
              redisAdapter.sendToUser(p, "chat:stop-typing", {
                roomId,
                userId,
              }),
            ),
        );
      } catch {
        /* non-critical */
      }
    });

    // Mark room messages as read and notify other participants
    socket.on("chat:read", async ({ roomId }: { roomId: string }) => {
      try {
        const unread = await withTenant(() =>
          prisma.message.findMany({
            where: {
              chatRoomId: roomId,
              isDeleted: false,
              NOT: [{ senderId: userId }, { readBy: { has: userId } }],
            },
            select: { id: true },
          }),
        );

        if (unread.length > 0) {
          await withTenant(() =>
            Promise.all(
              unread.map((m: any) =>
                prisma.message.update({
                  where: { id: m.id },
                  data: { readBy: { push: userId } },
                }),
              ),
            ),
          );
        }

        const participants = await getParticipants(roomId);
        await Promise.all(
          participants
            .filter((p) => p !== userId)
            .map((p) =>
              redisAdapter.sendToUser(p, "chat:read", {
                roomId,
                reader: userId,
              }),
            ),
        );
      } catch (err) {
        logger.error(`chat:read error for ${userId}:`, { err });
      }
    });

    // Notify all participants that a message was deleted
    socket.on(
      "chat:delete-message",
      async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
        try {
          const participants = await getParticipants(roomId);
          await Promise.all(
            participants.map((p) =>
              redisAdapter.sendToUser(p, "chat:message-deleted", {
                messageId,
                roomId,
              }),
            ),
          );
        } catch (err) {
          logger.error(`chat:delete-message error for ${userId}:`, { err });
        }
      },
    );

    socket.on("disconnect", () => {
      roomParticipantsCache.clear();
    });
  });
}
