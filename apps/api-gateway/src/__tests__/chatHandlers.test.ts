import { prisma } from "@hrms/db";
import {
  getConversations,
  startConversation,
  getMessages,
  markMessagesRead,
  getUnreadCounts,
  deleteMessage,
  deleteConversation,
  ogPreview,
} from "../handlers/chat";

jest.mock("dns", () => ({
  promises: {
    lookup: jest.fn(),
  },
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    chatRoom: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    INTERNAL_SERVER_ERROR: 500,
    UN_AUTHORIZED: 401,
  },
  // isSafeUrl/isSafeHostname's only dependency is `dns` (mocked above via
  // jest.mock("dns", ...)) — using the real implementation here instead of
  // hand-rolling a fake keeps these tests exercising the actual SSRF-guard
  // logic (shared with webhooks.ts) rather than a parallel copy of it.
  isSafeUrl: jest.requireActual("@hrms/common").isSafeUrl,
  isSafeHostname: jest.requireActual("@hrms/common").isSafeHostname,
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import dns from "dns";

const mockApiResponse = apiResponse as jest.Mock;
const mockDnsLookup = (dns as any).promises.lookup as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockChatRoomFindMany = (prisma as any).chatRoom.findMany as jest.Mock;
const mockChatRoomFindUnique = (prisma as any).chatRoom.findUnique as jest.Mock;
const mockChatRoomFindFirst = (prisma as any).chatRoom.findFirst as jest.Mock;
const mockChatRoomCreate = (prisma as any).chatRoom.create as jest.Mock;
const mockChatRoomUpdate = (prisma as any).chatRoom.update as jest.Mock;
const mockMessageFindMany = (prisma as any).message.findMany as jest.Mock;
const mockMessageFindUnique = (prisma as any).message.findUnique as jest.Mock;
const mockMessageGroupBy = (prisma as any).message.groupBy as jest.Mock;
const mockMessageUpdate = (prisma as any).message.update as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("chatHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getConversations", () => {
    it("returns conversations with participantDetails and unreadCount", async () => {
      const room = {
        id: "r1",
        participants: ["user-1", "user-2"],
        lastMessageId: null,
        lastActivity: new Date(),
        deletedFor: [],
      };
      mockChatRoomFindMany.mockResolvedValue([room]);
      mockMessageFindMany.mockResolvedValue([]);
      mockUserFindMany.mockResolvedValue([
        {
          id: "user-1",
          username: "alice",
          first_name: "Alice",
          last_name: "Doe",
          employee_photo: null,
          designation: "HR",
        },
        {
          id: "user-2",
          username: "bob",
          first_name: "Bob",
          last_name: "Smith",
          employee_photo: null,
          designation: "Dev",
        },
      ]);
      mockMessageGroupBy.mockResolvedValue([
        { chatRoomId: "r1", _count: { id: 2 } },
      ]);
      const res = makeRes();
      await getConversations(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ _id: "r1", unreadCount: 2 }),
          ]),
        }),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockChatRoomFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getConversations(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("startConversation", () => {
    it("returns BAD_REQUEST when recipientUserId missing", async () => {
      const res = makeRes();
      await startConversation(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when starting conversation with self", async () => {
      const res = makeRes();
      await startConversation(
        makeReq({ body: { recipientUserId: "user-1" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns existing conversation when one already exists", async () => {
      const room = {
        id: "r1",
        participants: ["user-1", "user-2"],
        type: "direct",
        deletedFor: [],
      };
      mockChatRoomFindFirst.mockResolvedValue(room);
      const res = makeRes();
      await startConversation(
        makeReq({ body: { recipientUserId: "user-2" } }),
        res,
      );
      expect(mockChatRoomCreate).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ _id: "r1" }),
        }),
      );
    });

    it("creates new room when none exists", async () => {
      mockChatRoomFindFirst.mockResolvedValue(null);
      const newRoom = {
        id: "r2",
        participants: ["user-1", "user-2"],
        type: "direct",
        deletedFor: [],
        lastActivity: new Date(),
      };
      mockChatRoomCreate.mockResolvedValue(newRoom);
      const res = makeRes();
      await startConversation(
        makeReq({ body: { recipientUserId: "user-2" } }),
        res,
      );
      expect(mockChatRoomCreate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ _id: "r2" }),
        }),
      );
    });
  });

  describe("getMessages", () => {
    it("returns NOT_FOUND when room does not exist", async () => {
      mockChatRoomFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await getMessages(makeReq({ params: { roomId: "r-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns FORBIDDEN when caller is not a participant", async () => {
      mockChatRoomFindUnique.mockResolvedValue({
        id: "r1",
        participants: ["user-2", "user-3"],
      });
      const res = makeRes();
      await getMessages(makeReq({ params: { roomId: "r1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
    });

    it("returns messages in chronological order", async () => {
      mockChatRoomFindUnique.mockResolvedValue({
        id: "r1",
        participants: ["user-1", "user-2"],
      });
      const messages = [
        {
          id: "m1",
          content: "Hello",
          senderId: "user-1",
          chatRoomId: "r1",
          replyToId: null,
          createdAt: new Date("2024-03-01"),
        },
        {
          id: "m2",
          content: "Hi",
          senderId: "user-2",
          chatRoomId: "r1",
          replyToId: null,
          createdAt: new Date("2024-03-02"),
        },
      ];
      mockMessageFindMany.mockResolvedValue([...messages].reverse()); // simulates desc order from DB
      const res = makeRes();
      await getMessages(makeReq({ params: { roomId: "r1" } }), res);
      const call = mockApiResponse.mock.calls[0];
      // DB returns desc order [m2, m1], handler calls .reverse() → [m1, m2]
      expect(call[2].data[0]._id).toBe("m1");
      expect(call[1]).toBe(RESPONSE_STATUS.SUCCESS);
    });
  });

  describe("markMessagesRead", () => {
    it("marks messages read via single $runCommandRaw bulk update", async () => {
      mockChatRoomFindUnique.mockResolvedValue({
        id: "r1",
        participants: ["user-1"],
      });
      (prisma as any).$runCommandRaw = jest
        .fn()
        .mockResolvedValue({ n: 2, ok: 1 });
      const res = makeRes();
      await markMessagesRead(makeReq({ params: { roomId: "r1" } }), res);
      expect((prisma as any).$runCommandRaw).toHaveBeenCalledWith(
        expect.objectContaining({ update: "messages" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when chat room does not exist", async () => {
      mockChatRoomFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await markMessagesRead(makeReq({ params: { roomId: "r1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });
  });

  describe("getUnreadCounts", () => {
    it("returns unread counts keyed by roomId", async () => {
      mockChatRoomFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
      mockMessageGroupBy.mockResolvedValue([
        { chatRoomId: "r1", _count: { id: 3 } },
      ]);
      const res = makeRes();
      await getUnreadCounts(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[1]).toBe(RESPONSE_STATUS.SUCCESS);
      expect(call[2].data.r1).toBe(3);
      expect(call[2].data.r2).toBe(0);
    });
  });

  describe("deleteMessage", () => {
    it("returns NOT_FOUND when message does not exist", async () => {
      mockMessageFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteMessage(makeReq({ params: { messageId: "m-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns FORBIDDEN when caller is not the sender", async () => {
      mockMessageFindUnique.mockResolvedValue({
        id: "m1",
        senderId: "user-2",
        chatRoomId: "r1",
      });
      const res = makeRes();
      await deleteMessage(makeReq({ params: { messageId: "m1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.FORBIDDEN,
        expect.any(Object),
      );
    });

    it("soft-deletes message when caller is sender", async () => {
      mockMessageFindUnique.mockResolvedValue({
        id: "m1",
        senderId: "user-1",
        chatRoomId: "r1",
      });
      mockChatRoomFindUnique.mockResolvedValue({
        participants: ["user-1", "user-2"],
      });
      mockMessageUpdate.mockResolvedValue({
        id: "m1",
        chatRoomId: "r1",
        isDeleted: true,
        content: null,
      });
      const res = makeRes();
      await deleteMessage(makeReq({ params: { messageId: "m1" } }), res);
      expect(mockMessageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m1" },
          data: expect.objectContaining({ isDeleted: true, content: null }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ messageId: "m1" }),
        }),
      );
    });
  });

  describe("deleteConversation", () => {
    it("returns NOT_FOUND when room does not exist", async () => {
      mockChatRoomFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteConversation(makeReq({ params: { roomId: "r-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("pushes userId to deletedFor list", async () => {
      mockChatRoomFindUnique.mockResolvedValue({ id: "r1", deletedFor: [] });
      mockChatRoomUpdate.mockResolvedValue({});
      const res = makeRes();
      await deleteConversation(makeReq({ params: { roomId: "r1" } }), res);
      expect(mockChatRoomUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r1" },
          data: { deletedFor: { push: "user-1" } },
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("does not update deletedFor when already in list", async () => {
      mockChatRoomFindUnique.mockResolvedValue({
        id: "r1",
        deletedFor: ["user-1"],
      });
      const res = makeRes();
      await deleteConversation(makeReq({ params: { roomId: "r1" } }), res);
      expect(mockChatRoomUpdate).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("ogPreview", () => {
    it("returns BAD_REQUEST when URL missing", async () => {
      const res = makeRes();
      await ogPreview(makeReq({ query: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for non-https URL", async () => {
      const res = makeRes();
      await ogPreview(makeReq({ query: { url: "http://example.com" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for localhost URL", async () => {
      const res = makeRes();
      await ogPreview(
        makeReq({ query: { url: "https://localhost/page" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for private IP range URL", async () => {
      const res = makeRes();
      await ogPreview(
        makeReq({ query: { url: "https://192.168.1.1/page" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when DNS resolves to private IP", async () => {
      mockDnsLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      const res = makeRes();
      await ogPreview(
        makeReq({ query: { url: "https://evil.example.com/page" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("extracts og meta tags and returns SUCCESS", async () => {
      mockDnsLookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);
      global.fetch = jest.fn().mockResolvedValue({
        text: async () =>
          '<html><head><meta property="og:title" content="Example Domain"/><meta property="og:description" content="Test desc"/></head></html>',
      }) as any;
      const res = makeRes();
      await ogPreview(makeReq({ query: { url: "https://example.com" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Example Domain",
            url: "https://example.com",
          }),
        }),
      );
    });

    it("returns null data on fetch error (graceful fallback)", async () => {
      mockDnsLookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error("Network error")) as any;
      const res = makeRes();
      await ogPreview(makeReq({ query: { url: "https://example.com" } }), res);
      // ogPreview catches all fetch errors and returns SUCCESS with null data
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ title: null }),
        }),
      );
    });
  });
});
