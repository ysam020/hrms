import type { Server as SocketServer, Socket } from "socket.io";
import {
  prismaWithTenant as prisma,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { sendPushNotifications } from "@hrms/firebase";
import type { RedisWebSocketAdapter } from "@hrms/websocket";
import { withoutDoNotDisturb } from "../services/presenceConnectivity";

type AuthenticatedSocket = Socket & {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
};

// Membership is re-read from the room on every event that writes data or
// reaches other people (send, read receipts, delete/pin relays), so a
// removed participant is refused on their very next attempt. Only typing
// indicators — sent on keystrokes, changing nothing — may reuse a check
// this recent, which bounds what a removed participant can still do to
// showing "typing…" for at most this long.
const TYPING_MEMBERSHIP_MAX_AGE_MS = 5 * 1000;

export function setupChatSocket(
  io: SocketServer,
  redisAdapter: RedisWebSocketAdapter,
): void {
  io.on("connection", (socket) => {
    const userId = (socket as AuthenticatedSocket).userId;
    const tenantId = (socket as AuthenticatedSocket).tenantId;
    const dbName = (socket as AuthenticatedSocket).dbName ?? null;

    // Per-connection record of this user's last confirmed membership per
    // room — only consulted by typing indicators (see above).
    const confirmedMembership = new Map<
      string,
      { participants: string[]; checkedAt: number }
    >();

    // Tenant-scoped queries (unlike REST requests) get no automatic
    // AsyncLocalStorage context, so every DB call here must be run through
    // this helper or it silently falls back to the wrong (master) DB.
    const tenantClient = tenantId && dbName ? getClientForDb(dbName) : null;
    const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
      tenantId ? runWithTenant(tenantId, tenantClient, fn) : fn();

    // The room's participants, read now from this tenant's database, if
    // this socket's user is one of them; otherwise null. A socket without a
    // tenant has no database to check against (the lookup would reach the
    // master database), so it is refused.
    const readMembership = async (roomId: string): Promise<string[] | null> => {
      if (!tenantId) return null;
      const room = await withTenant(() =>
        prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: { participants: true },
        }),
      );
      const participants = room?.participants ?? [];
      if (!participants.includes(userId)) {
        confirmedMembership.delete(roomId);
        return null;
      }
      confirmedMembership.set(roomId, { participants, checkedAt: Date.now() });
      return participants;
    };

    // Participants of roomId if this socket's user is one of them, else
    // null (and the client is told why). Re-checked against the database
    // unless `maxAgeMs` allows a check that recent.
    const participantsIfMember = async (
      roomId: string,
      { maxAgeMs = 0 }: { maxAgeMs?: number } = {},
    ): Promise<string[] | null> => {
      const confirmed = confirmedMembership.get(roomId);
      const participants =
        confirmed && Date.now() - confirmed.checkedAt < maxAgeMs
          ? confirmed.participants
          : await readMembership(roomId);
      if (participants) return participants;
      socket.emit("chat:error", { message: "Not a participant of this room" });
      return null;
    };

    // Client opens a room — confirm membership up front so the first typing
    // indicators don't each need a lookup.
    socket.on("chat:join", async ({ roomId }: { roomId: string }) => {
      try {
        await readMembership(roomId);
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
          // Re-checked against the room now: a removed participant is
          // refused on this attempt, not after a cache expires.
          const participants = await participantsIfMember(roomId);
          if (!participants) return;

          // Enforce message content size limit (10 000 chars)
          if (content && content.length > 10_000) {
            socket.emit("chat:error", {
              message: "Message too long (max 10 000 characters)",
            });
            return;
          }

          // Resolve the replied-to message into a preview object before
          // broadcasting — the sender already has it client-side (they
          // clicked reply on a rendered message), but recipients only get
          // whatever we put on the wire here.
          let replyToObj: any = null;
          if (replyTo) {
            const replySrc = await withTenant(() =>
              prisma.message.findUnique({
                where: { id: replyTo },
                select: {
                  id: true,
                  content: true,
                  type: true,
                  fileName: true,
                  senderId: true,
                  isDeleted: true,
                },
              }),
            );
            if (replySrc) {
              replyToObj = {
                _id: replySrc.id,
                content: replySrc.isDeleted ? null : replySrc.content,
                type: replySrc.type,
                fileName: replySrc.isDeleted ? null : replySrc.fileName,
                senderId: replySrc.senderId,
                isDeleted: replySrc.isDeleted,
              };
            }
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
            replyTo: replyToObj,
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
            // Chat is a non-essential notification: Do Not Disturb holds
            // back the push (the message itself still arrives in-app).
            // Participants are user IDs, scoped to this tenant by
            // sendPushNotifications; a socket without a tenant sends none.
            (tenantId
              ? withoutDoNotDisturb(tenantId, others)
              : Promise.resolve([] as string[])
            )
              .then(async (recipients) => {
                if (!tenantId || recipients.length === 0) return;
                const sender = await withTenant(() =>
                  prisma.user.findUnique({
                    where: { id: userId },
                    select: {
                      first_name: true,
                      last_name: true,
                      username: true,
                    },
                  }),
                );
                const senderName =
                  [sender?.first_name, sender?.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                  sender?.username ||
                  "New message";
                await sendPushNotifications(
                  { tenantId, userIds: recipients },
                  senderName,
                  pushBody,
                  { latestOnly: true },
                );
              })
              .catch((err) =>
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
        const participants = await participantsIfMember(roomId, {
          maxAgeMs: TYPING_MEMBERSHIP_MAX_AGE_MS,
        });
        if (!participants) return;
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
        const participants = await participantsIfMember(roomId, {
          maxAgeMs: TYPING_MEMBERSHIP_MAX_AGE_MS,
        });
        if (!participants) return;
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
        // Only a participant may mark a room's messages as read.
        const participants = await participantsIfMember(roomId);
        if (!participants) return;
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
          // Re-checked against the room now: a removed participant is
          // refused on this attempt, not after a cache expires.
          const participants = await participantsIfMember(roomId);
          if (!participants) return;
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

    // Notify all participants that a message was pinned. The pin/unpin
    // mutation itself happens over REST (POST/DELETE .../pin) — this is
    // relay-only, matching the chat:delete-message pattern above.
    socket.on(
      "chat:pin-message",
      async ({
        messageId,
        roomId,
        pinnedAt,
        pinnedBy,
      }: {
        messageId: string;
        roomId: string;
        pinnedAt: string;
        pinnedBy: string;
      }) => {
        try {
          // Re-checked against the room now: a removed participant is
          // refused on this attempt, not after a cache expires.
          const participants = await participantsIfMember(roomId);
          if (!participants) return;
          await Promise.all(
            participants.map((p) =>
              redisAdapter.sendToUser(p, "chat:message-pinned", {
                messageId,
                roomId,
                pinnedAt,
                pinnedBy,
              }),
            ),
          );
        } catch (err) {
          logger.error(`chat:pin-message error for ${userId}:`, { err });
        }
      },
    );

    // Notify all participants that a message was unpinned.
    socket.on(
      "chat:unpin-message",
      async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
        try {
          // Re-checked against the room now: a removed participant is
          // refused on this attempt, not after a cache expires.
          const participants = await participantsIfMember(roomId);
          if (!participants) return;
          await Promise.all(
            participants.map((p) =>
              redisAdapter.sendToUser(p, "chat:message-unpinned", {
                messageId,
                roomId,
              }),
            ),
          );
        } catch (err) {
          logger.error(`chat:unpin-message error for ${userId}:`, { err });
        }
      },
    );

    socket.on("disconnect", () => {
      confirmedMembership.clear();
    });
  });
}
