import { getWebSocketRedis } from "../connection";
import {
  RedisNotificationPublisher,
  getNotificationPublisher,
} from "../RedisNotificationPublisher";

jest.mock("../connection", () => ({
  getWebSocketRedis: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockClient = { hget: jest.fn() };
const mockPublisher = { publish: jest.fn().mockResolvedValue(1) };
const mockGetRedis = getWebSocketRedis as jest.Mock;

describe("RedisNotificationPublisher", () => {
  let publisher: RedisNotificationPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPublisher.publish.mockResolvedValue(1);
    mockGetRedis.mockImplementation((type: string) =>
      type === "client" ? mockClient : mockPublisher,
    );
    publisher = new RedisNotificationPublisher();
  });

  describe("sendToUser", () => {
    it("returns false and does not publish when the user has no active socket", async () => {
      mockClient.hget.mockResolvedValue(null);
      const result = await publisher.sendToUser("u1", "notify", { x: 1 });
      expect(result).toBe(false);
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it("routes the event to the worker holding the user's socket", async () => {
      mockClient.hget.mockResolvedValue("1234:socket-abc");
      const result = await publisher.sendToUser("u1", "notify", { x: 1 });
      expect(result).toBe(true);
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        "socket:worker-1234",
        JSON.stringify({
          userId: "u1",
          eventName: "notify",
          payload: { x: 1 },
        }),
      );
    });

    it("returns false without throwing when Redis errors", async () => {
      mockClient.hget.mockRejectedValue(new Error("redis down"));
      const result = await publisher.sendToUser("u1", "notify", {});
      expect(result).toBe(false);
    });
  });

  describe("broadcast", () => {
    it("publishes to the global broadcast channel", async () => {
      await publisher.broadcast("announcement", { msg: "hi" });
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        "socket:broadcast",
        JSON.stringify({ eventName: "announcement", payload: { msg: "hi" } }),
      );
    });

    it("swallows publish errors without throwing", async () => {
      mockPublisher.publish.mockRejectedValue(new Error("redis down"));
      await expect(publisher.broadcast("x", {})).resolves.toBeUndefined();
    });
  });

  describe("sendNotification", () => {
    it("publishes to the notification channel", async () => {
      await publisher.sendNotification({ title: "Hi" });
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        "socket:notification",
        JSON.stringify({ notification: { title: "Hi" } }),
      );
    });

    it("swallows publish errors without throwing", async () => {
      mockPublisher.publish.mockRejectedValue(new Error("redis down"));
      await expect(publisher.sendNotification({})).resolves.toBeUndefined();
    });
  });
});

describe("getNotificationPublisher", () => {
  it("memoizes a single instance across calls", () => {
    const a = getNotificationPublisher();
    const b = getNotificationPublisher();
    expect(a).toBe(b);
  });
});
