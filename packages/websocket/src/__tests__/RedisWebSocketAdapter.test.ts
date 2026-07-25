import {
  getWebSocketRedis,
  closeWebSocketRedisConnections,
} from "../connection";
import { RedisWebSocketAdapter } from "../RedisWebSocketAdapter";

jest.mock("../connection", () => ({
  getWebSocketRedis: jest.fn(),
  closeWebSocketRedisConnections: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  websocketPublishFailuresTotal: { inc: jest.fn() },
}));

const mockGetRedis = getWebSocketRedis as jest.Mock;

function makeIo() {
  const toEmit = jest.fn();
  const io: any = {
    on: jest.fn(),
    to: jest.fn(() => ({ emit: toEmit })),
    emit: jest.fn(),
    sockets: { sockets: new Map() },
    __toEmit: toEmit,
  };
  return io;
}

describe("RedisWebSocketAdapter", () => {
  let io: any;
  let subscriber: any;
  let client: any;
  let publisher: any;
  let adapter: RedisWebSocketAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    subscriber = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    client = {
      hset: jest.fn().mockResolvedValue(1),
      hget: jest.fn(),
      hdel: jest.fn().mockResolvedValue(1),
    };
    publisher = { publish: jest.fn().mockResolvedValue(1) };
    mockGetRedis.mockImplementation((type: string) =>
      type === "subscriber"
        ? subscriber
        : type === "client"
          ? client
          : publisher,
    );
    io = makeIo();
    adapter = new RedisWebSocketAdapter(io);
  });

  describe("construction", () => {
    it("subscribes to the worker-specific, broadcast, and notification channels", () => {
      expect(subscriber.subscribe).toHaveBeenCalledWith(
        `socket:worker-${process.pid}`,
        "socket:broadcast",
        "socket:notification",
      );
    });

    it("logs (but does not throw) when the subscribe call fails", async () => {
      const { logger } = require("@hrms/logger");
      subscriber.subscribe.mockReturnValue(
        Promise.reject(new Error("redis down")),
      );
      expect(() => new RedisWebSocketAdapter(io)).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Redis subscribe error:"),
        { err: expect.any(Error) },
      );
    });
  });

  describe("socket connection lifecycle", () => {
    function connect(userId = "u1", socketId = "sock1") {
      const connectionHandler = io.on.mock.calls.find(
        ([event]: any[]) => event === "connection",
      )[1];
      const handlers: Record<string, (...args: any[]) => any> = {};
      const socket: any = {
        id: socketId,
        userId,
        on: jest.fn((event: string, handler: any) => {
          handlers[event] = handler;
        }),
      };
      connectionHandler(socket);
      return { socket, handlers };
    }

    it("registers the socket in Redis on connect", async () => {
      connect("u1", "sock1");
      await new Promise((resolve) => setImmediate(resolve));
      expect(client.hset).toHaveBeenCalledWith(
        "user:sockets",
        "u1",
        `${process.pid}:sock1`,
      );
    });

    it("logs (but does not throw) when hset fails", async () => {
      const { logger } = require("@hrms/logger");
      client.hset.mockReturnValue(Promise.reject(new Error("redis down")));
      connect("u1", "sock1");
      await new Promise((resolve) => setImmediate(resolve));
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("hset error for u1"),
        { err: expect.any(Error) },
      );
    });

    it("removes the local map entry and the Redis entry on disconnect when it's still current", async () => {
      const { handlers } = connect("u1", "sock1");
      client.hget.mockResolvedValue(`${process.pid}:sock1`);

      await handlers.disconnect();

      expect(client.hdel).toHaveBeenCalledWith("user:sockets", "u1");
    });

    it("does not delete the Redis entry on disconnect if it was already replaced by a reconnect", async () => {
      const { handlers } = connect("u1", "sock1");
      client.hget.mockResolvedValue(`${process.pid}:sock-newer`);

      await handlers.disconnect();

      expect(client.hdel).not.toHaveBeenCalled();
    });

    it("logs (but does not throw) when the disconnect hdel lookup fails", async () => {
      const { logger } = require("@hrms/logger");
      const { handlers } = connect("u1", "sock1");
      client.hget.mockRejectedValue(new Error("redis down"));

      await handlers.disconnect();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("hdel error for u1"),
        { err: expect.any(Error) },
      );
    });

    it("logs socket-level errors", () => {
      const { logger } = require("@hrms/logger");
      const { handlers } = connect("u1", "sock1");
      handlers.error(new Error("socket boom"));
      expect(logger.error).toHaveBeenCalledWith("Socket error for user u1:", {
        err: expect.any(Error),
      });
    });
  });

  describe("pub/sub message routing", () => {
    function getMessageHandler() {
      return subscriber.on.mock.calls.find(
        ([event]: any[]) => event === "message",
      )[1];
    }
    function connect(userId = "u1", socketId = "sock1") {
      const connectionHandler = io.on.mock.calls.find(
        ([event]: any[]) => event === "connection",
      )[1];
      const socket: any = { id: socketId, userId, on: jest.fn() };
      connectionHandler(socket);
    }

    it("relays a message on this worker's own channel to the local socket", async () => {
      connect("u1", "sock1");
      const onMessage = getMessageHandler();

      await onMessage(
        `socket:worker-${process.pid}`,
        JSON.stringify({
          userId: "u1",
          eventName: "chat:message",
          payload: { text: "hi" },
        }),
      );

      expect(io.to).toHaveBeenCalledWith("sock1");
      expect(io.__toEmit).toHaveBeenCalledWith("chat:message", { text: "hi" });
    });

    it("warns and drops the message when the target user isn't in the local socket map", async () => {
      const { logger } = require("@hrms/logger");
      const onMessage = getMessageHandler();

      await onMessage(
        `socket:worker-${process.pid}`,
        JSON.stringify({
          userId: "offline-user",
          eventName: "chat:message",
          payload: {},
        }),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("user offline-user not in local socket map"),
      );
      expect(io.to).not.toHaveBeenCalled();
    });

    it("broadcasts a socket:broadcast message to every connected socket", async () => {
      const onMessage = getMessageHandler();
      await onMessage(
        "socket:broadcast",
        JSON.stringify({
          eventName: "announcement",
          payload: { text: "hello all" },
        }),
      );
      expect(io.emit).toHaveBeenCalledWith("announcement", {
        text: "hello all",
      });
    });

    it("emits a socket:notification message to every socket in io.sockets.sockets", async () => {
      const socketA = { emit: jest.fn() };
      const socketB = { emit: jest.fn() };
      io.sockets.sockets.set("a", socketA);
      io.sockets.sockets.set("b", socketB);

      const onMessage = getMessageHandler();
      await onMessage(
        "socket:notification",
        JSON.stringify({ notification: { title: "Ping" } }),
      );

      expect(socketA.emit).toHaveBeenCalledWith("notification", {
        title: "Ping",
      });
      expect(socketB.emit).toHaveBeenCalledWith("notification", {
        title: "Ping",
      });
    });

    it("logs (but does not throw) on malformed pub/sub JSON", async () => {
      const { logger } = require("@hrms/logger");
      const onMessage = getMessageHandler();
      await expect(
        onMessage("socket:broadcast", "not-json{"),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        "Error processing Redis pub/sub message:",
        { err: expect.any(Error) },
      );
    });
  });

  describe("sendToUser", () => {
    it("returns false and does not publish when the user has no active socket anywhere", async () => {
      client.hget.mockResolvedValue(null);
      const result = await adapter.sendToUser("u1", "chat:message", {
        text: "hi",
      });
      expect(result).toBe(false);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it("emits directly (no publish) when the user's socket is on this same worker", async () => {
      const connectionHandler = io.on.mock.calls.find(
        ([event]: any[]) => event === "connection",
      )[1];
      connectionHandler({ id: "sock1", userId: "u1", on: jest.fn() });

      client.hget.mockResolvedValue(`${process.pid}:sock1`);
      const result = await adapter.sendToUser("u1", "chat:message", {
        text: "hi",
      });

      expect(result).toBe(true);
      expect(io.to).toHaveBeenCalledWith("sock1");
      expect(io.__toEmit).toHaveBeenCalledWith("chat:message", { text: "hi" });
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it("falls through to pub/sub when the pid matches but the local map entry is stale", async () => {
      client.hget.mockResolvedValue(`${process.pid}:sock-stale`);
      const result = await adapter.sendToUser("u1", "chat:message", {
        text: "hi",
      });

      expect(result).toBe(true);
      expect(publisher.publish).toHaveBeenCalledWith(
        `socket:worker-${process.pid}`,
        JSON.stringify({
          userId: "u1",
          eventName: "chat:message",
          payload: { text: "hi" },
        }),
      );
    });

    it("routes via pub/sub when the user's socket is on a different worker process", async () => {
      client.hget.mockResolvedValue("99999:sock-on-other-worker");
      const result = await adapter.sendToUser("u1", "chat:message", {
        text: "hi",
      });

      expect(result).toBe(true);
      expect(publisher.publish).toHaveBeenCalledWith(
        "socket:worker-99999",
        JSON.stringify({
          userId: "u1",
          eventName: "chat:message",
          payload: { text: "hi" },
        }),
      );
    });
  });

  describe("broadcast / sendNotification / cleanup", () => {
    it("publishes a broadcast message", async () => {
      await adapter.broadcast("announcement", { text: "hi all" });
      expect(publisher.publish).toHaveBeenCalledWith(
        "socket:broadcast",
        JSON.stringify({
          eventName: "announcement",
          payload: { text: "hi all" },
        }),
      );
    });

    it("publishes a notification message", async () => {
      await adapter.sendNotification({ title: "Ping" });
      expect(publisher.publish).toHaveBeenCalledWith(
        "socket:notification",
        JSON.stringify({ notification: { title: "Ping" } }),
      );
    });

    it("closes the Redis connections on cleanup", async () => {
      await adapter.cleanup();
      expect(closeWebSocketRedisConnections).toHaveBeenCalled();
    });
  });
});
