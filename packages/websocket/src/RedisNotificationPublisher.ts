import { logger, websocketPublishFailuresTotal } from "@hrms/logger";
import { getWebSocketRedis } from "./connection";
import { publishToNodes } from "./SocketRegistry";

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
   * Send an event to every socket of `userId` in `tenantId`, on every API
   * gateway process that holds one (SocketRegistry). Resolves true only if
   * at least one gateway process received it. Each receiving gateway
   * re-authorises the person just before emitting.
   */
  async sendToUser(
    userId: string,
    eventName: string,
    payload: unknown,
    options: { tenantId: string | null },
  ): Promise<boolean> {
    try {
      const reached = await publishToNodes(
        getWebSocketRedis("client"),
        getWebSocketRedis("publisher"),
        options.tenantId ?? null,
        userId,
        eventName,
        payload,
      );
      if (reached === 0) {
        logger.debug?.(
          `[RedisNotificationPublisher] ${userId} has no live socket — offline`,
        );
      }
      return reached > 0;
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
