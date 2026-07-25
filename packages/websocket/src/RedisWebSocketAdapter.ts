import type { Server as SocketServer, Socket } from "socket.io";
import { logger, websocketPublishFailuresTotal } from "@hrms/logger";
import {
  getWebSocketRedis,
  closeWebSocketRedisConnections,
} from "./connection";

const SERVICE_LABEL = process.env.SERVICE_NAME || "api-gateway";

type AuthenticatedSocket = Socket & { userId: string };

export class RedisWebSocketAdapter {
  private io: SocketServer;
  /** Local map: userId → socket.id (only sockets on this process) */
  private userSockets: Map<string, string>;

  constructor(io: SocketServer) {
    this.io = io;
    this.userSockets = new Map();

    this.setupSubscriber();
    this.setupSocketHandlers();
  }

  private setupSubscriber(): void {
    const subscriber = getWebSocketRedis("subscriber");

    subscriber
      .subscribe(
        `socket:worker-${process.pid}`,
        "socket:broadcast",
        "socket:notification",
      )
      .catch((err) =>
        logger.error(`Worker ${process.pid} - Redis subscribe error:`, { err }),
      );

    subscriber.on("message", async (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);

        if (channel === `socket:worker-${process.pid}`) {
          this.handleUserMessage(data);
        } else if (channel === "socket:broadcast") {
          this.handleBroadcast(data);
        } else if (channel === "socket:notification") {
          this.handleNotification(data);
        }
      } catch (err) {
        logger.error("Error processing Redis pub/sub message:", { err });
      }
    });
  }

  private setupSocketHandlers(): void {
    this.io.on("connection", (socket) => {
      const userId = (socket as AuthenticatedSocket).userId;
      const socketEntry = `${process.pid}:${socket.id}`;
      const redisClient = getWebSocketRedis("client");

      this.userSockets.set(userId, socket.id);

      redisClient
        .hset("user:sockets", userId, socketEntry)
        .then(() =>
          logger.info(
            `[WS] Worker ${process.pid} registered socket: ${userId} => ${socketEntry}`,
          ),
        )
        .catch((err) =>
          logger.error(`Worker ${process.pid} - hset error for ${userId}:`, {
            err,
          }),
        );

      socket.on("disconnect", async () => {
        this.userSockets.delete(userId);
        try {
          // Only delete if this socket is still the current entry in Redis.
          // A reconnect to another worker may have already replaced it.
          const current = await redisClient.hget("user:sockets", userId);
          if (current === socketEntry) {
            await redisClient.hdel("user:sockets", userId);
          }
        } catch (err) {
          logger.error(`Worker ${process.pid} - hdel error for ${userId}:`, {
            err,
          });
        }
      });

      socket.on("error", (err) => {
        logger.error(`Socket error for user ${userId}:`, { err });
      });
    });
  }

  private handleUserMessage(data: {
    userId: string;
    eventName: string;
    payload: unknown;
  }): void {
    const { userId, eventName, payload } = data;
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(eventName, payload);
    } else {
      logger.warn(
        `[WS] Worker ${process.pid} - user ${userId} not in local socket map, dropping message`,
      );
    }
  }

  private handleBroadcast(data: { eventName: string; payload: unknown }): void {
    this.io.emit(data.eventName, data.payload);
  }

  private handleNotification(data: { notification: unknown }): void {
    this.io.sockets.sockets.forEach((socket) => {
      socket.emit("notification", data.notification);
    });
  }

  /**
   * Send an event to a specific user, routing to the correct worker via Redis pub/sub
   * if the user is connected to a different process.
   */
  async sendToUser(
    userId: string,
    eventName: string,
    payload: unknown,
  ): Promise<boolean> {
    const redisClient = getWebSocketRedis("client");
    const publisher = getWebSocketRedis("publisher");

    const socketEntry = await redisClient.hget("user:sockets", userId);

    if (!socketEntry) {
      logger.warn(
        `[sendToUser] ${userId} not in Redis user:sockets — user may be offline`,
      );
      return false;
    }

    const [pid] = socketEntry.split(":");

    if (parseInt(pid, 10) === process.pid) {
      // User is on this worker — use local map for accuracy (avoids stale Redis socket ID)
      const localSocketId = this.userSockets.get(userId);
      if (localSocketId) {
        this.io.to(localSocketId).emit(eventName, payload);
        return true;
      }
      // PID matches but socket gone — fall through to pub/sub
      logger.warn(
        `[sendToUser] PID matches but ${userId} not in local userSockets — falling through to pub/sub`,
      );
    }

    // User is on a different worker/process — route via pub/sub
    try {
      await publisher.publish(
        `socket:worker-${pid}`,
        JSON.stringify({ userId, eventName, payload }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "sendToUser",
        service: SERVICE_LABEL,
      });
      logger.error(`[sendToUser] publish failed for ${userId}:`, { err });
      return false;
    }
    return true;
  }

  /** Broadcast an event to every connected socket across all workers. */
  async broadcast(eventName: string, payload: unknown): Promise<void> {
    const publisher = getWebSocketRedis("publisher");
    try {
      await publisher.publish(
        "socket:broadcast",
        JSON.stringify({ eventName, payload }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "broadcast",
        service: SERVICE_LABEL,
      });
      logger.error("[broadcast] publish failed:", { err });
    }
  }

  /** Publish a notification to all workers which emit it to all their sockets. */
  async sendNotification(notification: unknown): Promise<void> {
    const publisher = getWebSocketRedis("publisher");
    try {
      await publisher.publish(
        "socket:notification",
        JSON.stringify({ notification }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "sendNotification",
        service: SERVICE_LABEL,
      });
      logger.error("[sendNotification] publish failed:", { err });
    }
  }

  async cleanup(): Promise<void> {
    await closeWebSocketRedisConnections();
  }
}
