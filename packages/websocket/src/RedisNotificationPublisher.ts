import { logger, websocketPublishFailuresTotal } from "@hrms/logger";
import { getWebSocketRedis } from "./connection";

const SERVICE_LABEL = process.env.SERVICE_NAME || "notification-service";

/**
 * Lightweight publisher used by the notification service (and any other service)
 * to push messages to WebSocket clients connected to the API gateway.
 *
 * This class only holds the publisher + client Redis connections — it does NOT
 * manage Socket.io or subscribe to any channels. Those concerns belong to the
 * RedisWebSocketAdapter running inside the API gateway process(es).
 */
export class RedisNotificationPublisher {
  /**
   * Send an event to a specific user. Looks up which API gateway worker
   * holds the user's socket via Redis, then routes via pub/sub.
   */
  async sendToUser(
    userId: string,
    eventName: string,
    payload: unknown,
  ): Promise<boolean> {
    try {
      const redisClient = getWebSocketRedis("client");
      const publisher = getWebSocketRedis("publisher");

      const socketEntry = await redisClient.hget("user:sockets", userId);

      if (!socketEntry) {
        logger.warn(
          `[RedisNotificationPublisher] ${userId} not found in user:sockets — user may be offline`,
        );
        return false;
      }

      const [pid] = socketEntry.split(":");

      await publisher.publish(
        `socket:worker-${pid}`,
        JSON.stringify({ userId, eventName, payload }),
      );
      return true;
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "sendToUser",
        service: SERVICE_LABEL,
      });
      logger.error("[RedisNotificationPublisher] sendToUser error:", {
        userId,
        err,
      });
      return false;
    }
  }

  /** Broadcast an event to all connected sockets across all API gateway workers. */
  async broadcast(eventName: string, payload: unknown): Promise<void> {
    try {
      const publisher = getWebSocketRedis("publisher");
      await publisher.publish(
        "socket:broadcast",
        JSON.stringify({ eventName, payload }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "broadcast",
        service: SERVICE_LABEL,
      });
      logger.error("[RedisNotificationPublisher] broadcast error:", { err });
    }
  }

  /**
   * Publish a notification to all API gateway workers which then emit it
   * to every connected socket (equivalent to server's sendNotification).
   */
  async sendNotification(notification: unknown): Promise<void> {
    try {
      const publisher = getWebSocketRedis("publisher");
      await publisher.publish(
        "socket:notification",
        JSON.stringify({ notification }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "sendNotification",
        service: SERVICE_LABEL,
      });
      logger.error("[RedisNotificationPublisher] sendNotification error:", {
        err,
      });
    }
  }
}

let _instance: RedisNotificationPublisher | null = null;

export function getNotificationPublisher(): RedisNotificationPublisher {
  if (!_instance) {
    _instance = new RedisNotificationPublisher();
  }
  return _instance;
}
