jest.mock("@hrms/db", () => {
  const _db: any = {
    chatRoom: { findUnique: jest.fn(), update: jest.fn() },
    message: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    prismaWithTenant: _db,
    getClientForDb: jest.fn().mockReturnValue({ __client: true }),
    runWithTenant: jest.fn((_tid, _client, fn) => fn()),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@hrms/firebase", () => ({
  sendPushNotifications: jest.fn().mockResolvedValue(undefined),
}));

import {
  prismaWithTenant as prisma,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { sendPushNotifications } from "@hrms/firebase";
import { setupChatSocket } from "../config/chatSocket";

function makeSocket(overrides: Partial<any> = {}) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket: any = {
    userId: "u1",
    tenantId: "t1",
    dbName: "tenant_db",
    on: jest.fn((event: string, handler: any) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    ...overrides,
  };
  return { socket, handlers };
}

function setup(socketOverrides: Partial<any> = {}) {
  const { socket, handlers } = makeSocket(socketOverrides);
  const redisAdapter = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  let connectionHandler: (socket: any) => void = () => {};
  const io: any = {
    on: jest.fn((_event: string, cb: any) => {
      connectionHandler = cb;
    }),
  };

  setupChatSocket(io, redisAdapter);
  connectionHandler(socket);

  return { socket, handlers, redisAdapter };
}

describe("setupChatSocket", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("chat:join", () => {
    it("pre-fetches and caches room participants", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      const { handlers } = setup();

      await handlers["chat:join"]({ roomId: "r1" });

      expect(prisma.chatRoom.findUnique).toHaveBeenCalledWith({
        where: { id: "r1" },
        select: { participants: true },
      });
    });

    it("logs but does not throw when the lookup fails", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockRejectedValue(
        new Error("db down"),
      );
      const { handlers } = setup();

      await expect(
        handlers["chat:join"]({ roomId: "r1" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("chat:send", () => {
    it("rejects a sender who is not a participant of the room", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u2", "u3"],
      });
      const { handlers, socket } = setup();

      await handlers["chat:send"]({ roomId: "r1", content: "hi" });

      expect(socket.emit).toHaveBeenCalledWith("chat:error", {
        message: "Not a participant of this room",
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("rejects a message over the 10,000 character limit", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      const { handlers, socket } = setup();

      await handlers["chat:send"]({
        roomId: "r1",
        content: "x".repeat(10_001),
      });

      expect(socket.emit).toHaveBeenCalledWith("chat:error", {
        message: "Message too long (max 10 000 characters)",
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("creates the message, updates the room, and relays to all participants", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2", "u3"],
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        createdAt: "2026-01-01T00:00:00Z",
        content: "hello",
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:send"]({ roomId: "r1", content: "hello" });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "t1",
            chatRoomId: "r1",
            senderId: "u1",
            content: "hello",
          }),
        }),
      );
      expect(prisma.chatRoom.update).toHaveBeenCalledWith({
        where: { id: "r1" },
        data: { lastMessageId: "m1", lastActivity: "2026-01-01T00:00:00Z" },
      });
      expect(redisAdapter.sendToUser).toHaveBeenCalledTimes(3);
      expect(redisAdapter.sendToUser).toHaveBeenCalledWith(
        "u2",
        "chat:message",
        expect.objectContaining({ _id: "m1", content: "hello" }),
      );
    });

    it("pushes FCM notifications to other participants only, not the sender", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        createdAt: "2026-01-01T00:00:00Z",
        content: "hello",
      });
      const { handlers } = setup();

      await handlers["chat:send"]({ roomId: "r1", content: "hello" });
      await new Promise((resolve) => setImmediate(resolve));

      expect(sendPushNotifications).toHaveBeenCalledWith(
        ["u2"],
        "u1",
        "hello",
        { latestOnly: true },
      );
    });

    it("uses a type-specific push body for image/video/file messages", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        createdAt: "now",
      });
      const { handlers } = setup();

      await handlers["chat:send"]({ roomId: "r1", type: "image" });
      await new Promise((resolve) => setImmediate(resolve));

      expect(sendPushNotifications).toHaveBeenCalledWith(
        ["u2"],
        "u1",
        "📷 Sent an image",
        { latestOnly: true },
      );
    });

    it("does not push when the sender is the only participant", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1"],
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        createdAt: "now",
      });
      const { handlers } = setup();

      await handlers["chat:send"]({ roomId: "r1", content: "hi" });

      expect(sendPushNotifications).not.toHaveBeenCalled();
    });

    it("redacts content and fileName in the reply preview when the replied-to message was deleted", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      (prisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: "orig",
        content: "original secret text",
        type: "text",
        fileName: "secret.pdf",
        senderId: "u2",
        isDeleted: true,
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        createdAt: "now",
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:send"]({
        roomId: "r1",
        content: "hi",
        replyTo: "orig",
      });

      const call = redisAdapter.sendToUser.mock.calls.find(
        ([, event]: any[]) => event === "chat:message",
      );
      expect(call[2].replyTo).toEqual(
        expect.objectContaining({
          _id: "orig",
          content: null,
          fileName: null,
          isDeleted: true,
        }),
      );
    });

    it("emits chat:error and does not throw when persisting the message fails", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      (prisma.message.create as jest.Mock).mockRejectedValue(
        new Error("db down"),
      );
      const { handlers, socket } = setup();

      await expect(
        handlers["chat:send"]({ roomId: "r1", content: "hi" }),
      ).resolves.toBeUndefined();
      expect(socket.emit).toHaveBeenCalledWith("chat:error", {
        message: "Failed to send message",
      });
    });

    it("scopes every DB call to the tenant via runWithTenant", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1"],
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        createdAt: "now",
      });
      const { handlers } = setup();

      await handlers["chat:send"]({ roomId: "r1", content: "hi" });

      expect(getClientForDb).toHaveBeenCalledWith("tenant_db");
      expect(runWithTenant).toHaveBeenCalledWith(
        "t1",
        { __client: true },
        expect.any(Function),
      );
    });
  });

  describe("chat:typing / chat:stop-typing", () => {
    it("relays typing events to every participant except the sender", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2", "u3"],
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:typing"]({ roomId: "r1" });

      expect(redisAdapter.sendToUser).toHaveBeenCalledTimes(2);
      expect(redisAdapter.sendToUser).toHaveBeenCalledWith(
        "u2",
        "chat:typing",
        {
          roomId: "r1",
          userId: "u1",
        },
      );
      expect(redisAdapter.sendToUser).not.toHaveBeenCalledWith(
        "u1",
        "chat:typing",
        expect.anything(),
      );
    });

    it("swallows errors silently since typing indicators are non-critical", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockRejectedValue(
        new Error("db down"),
      );
      const { handlers } = setup();
      await expect(
        handlers["chat:typing"]({ roomId: "r1" }),
      ).resolves.toBeUndefined();
      await expect(
        handlers["chat:stop-typing"]({ roomId: "r1" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("chat:read", () => {
    it("marks unread messages as read and notifies other participants", async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { id: "m1" },
        { id: "m2" },
      ]);
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:read"]({ roomId: "r1" });

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: "m1" },
        data: { readBy: { push: "u1" } },
      });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { readBy: { push: "u1" } },
      });
      expect(redisAdapter.sendToUser).toHaveBeenCalledWith("u2", "chat:read", {
        roomId: "r1",
        reader: "u1",
      });
    });

    it("skips the update step entirely when there is nothing unread", async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1"],
      });
      const { handlers } = setup();

      await handlers["chat:read"]({ roomId: "r1" });

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it("excludes the reader's own and already-read messages from the unread query", async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: [],
      });
      const { handlers } = setup();

      await handlers["chat:read"]({ roomId: "r1" });

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          chatRoomId: "r1",
          isDeleted: false,
          NOT: [{ senderId: "u1" }, { readBy: { has: "u1" } }],
        },
        select: { id: true },
      });
    });
  });

  describe("chat:delete-message / chat:pin-message / chat:unpin-message", () => {
    it("relays a delete event to all participants including the sender", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:delete-message"]({ messageId: "m1", roomId: "r1" });

      expect(redisAdapter.sendToUser).toHaveBeenCalledTimes(2);
      expect(redisAdapter.sendToUser).toHaveBeenCalledWith(
        "u1",
        "chat:message-deleted",
        {
          messageId: "m1",
          roomId: "r1",
        },
      );
    });

    it("relays a pin event with pinnedAt/pinnedBy to all participants", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:pin-message"]({
        messageId: "m1",
        roomId: "r1",
        pinnedAt: "2026-01-01",
        pinnedBy: "u1",
      });

      expect(redisAdapter.sendToUser).toHaveBeenCalledWith(
        "u2",
        "chat:message-pinned",
        {
          messageId: "m1",
          roomId: "r1",
          pinnedAt: "2026-01-01",
          pinnedBy: "u1",
        },
      );
    });

    it("relays an unpin event to all participants", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1", "u2"],
      });
      const { handlers, redisAdapter } = setup();

      await handlers["chat:unpin-message"]({ messageId: "m1", roomId: "r1" });

      expect(redisAdapter.sendToUser).toHaveBeenCalledWith(
        "u2",
        "chat:message-unpinned",
        {
          messageId: "m1",
          roomId: "r1",
        },
      );
    });
  });

  describe("disconnect", () => {
    it("clears the participants cache without throwing", () => {
      const { handlers } = setup();
      expect(() => handlers["disconnect"]()).not.toThrow();
    });
  });

  describe("non-tenant (unauthenticated tenant) socket", () => {
    it("skips runWithTenant entirely when there is no tenantId", async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue({
        participants: ["u1"],
      });
      const { handlers } = setup({ tenantId: null, dbName: null });

      await handlers["chat:join"]({ roomId: "r1" });

      expect(getClientForDb).not.toHaveBeenCalled();
      expect(runWithTenant).not.toHaveBeenCalled();
    });
  });
});
