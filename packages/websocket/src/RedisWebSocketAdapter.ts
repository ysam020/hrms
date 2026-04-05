import type { Server as SocketServer, Socket } from "socket.io";
import { logger } from "@hrms/logger";
import {
  getWebSocketRedis,
  closeWebSocketRedisConnections,
} from "./connection";

type AuthenticatedSocket = Socket & { username: string };

export class RedisWebSocketAdapter {
  private io: SocketServer;
  /** Local map: username → socket.id (only sockets on this process) */
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
      const username = (socket as AuthenticatedSocket).username;
      const socketEntry = `${process.pid}:${socket.id}`;
      const redisClient = getWebSocketRedis("client");

      this.userSockets.set(username, socket.id);

      redisClient
        .hset("user:sockets", username, socketEntry)
        .then(() =>
          logger.info(
            `[WS] Worker ${process.pid} registered socket: ${username} => ${socketEntry}`,
          ),
        )
        .catch((err) =>
          logger.error(`Worker ${process.pid} - hset error for ${username}:`, {
            err,
          }),
        );

      socket.on("disconnect", async () => {
        this.userSockets.delete(username);
        try {
          // Only delete if this socket is still the current entry in Redis.
          // A reconnect to another worker may have already replaced it.
          const current = await redisClient.hget("user:sockets", username);
          if (current === socketEntry) {
            await redisClient.hdel("user:sockets", username);
          }
        } catch (err) {
          logger.error(`Worker ${process.pid} - hdel error for ${username}:`, {
            err,
          });
        }
      });

      socket.on("error", (err) => {
        logger.error(`Socket error for user ${username}:`, { err });
      });
    });
  }

  private handleUserMessage(data: {
    username: string;
    eventName: string;
    payload: unknown;
  }): void {
    const { username, eventName, payload } = data;
    const socketId = this.userSockets.get(username);
    if (socketId) {
      this.io.to(socketId).emit(eventName, payload);
    } else {
      logger.warn(
        `[WS] Worker ${process.pid} - user ${username} not in local socket map, dropping message`,
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
    username: string,
    eventName: string,
    payload: unknown,
  ): Promise<boolean> {
    const redisClient = getWebSocketRedis("client");
    const publisher = getWebSocketRedis("publisher");

    const socketEntry = await redisClient.hget("user:sockets", username);

    if (!socketEntry) {
      logger.warn(
        `[sendToUser] ${username} not in Redis user:sockets — user may be offline`,
      );
      return false;
    }

    const [pid] = socketEntry.split(":");

    if (parseInt(pid, 10) === process.pid) {
      // User is on this worker — use local map for accuracy (avoids stale Redis socket ID)
      const localSocketId = this.userSockets.get(username);
      if (localSocketId) {
        this.io.to(localSocketId).emit(eventName, payload);
        return true;
      }
      // PID matches but socket gone — fall through to pub/sub
      logger.warn(
        `[sendToUser] PID matches but ${username} not in local userSockets — falling through to pub/sub`,
      );
    }

    // User is on a different worker/process — route via pub/sub
    await publisher.publish(
      `socket:worker-${pid}`,
      JSON.stringify({ username, eventName, payload }),
    );
    return true;
  }

  /** Broadcast an event to every connected socket across all workers. */
  async broadcast(eventName: string, payload: unknown): Promise<void> {
    const publisher = getWebSocketRedis("publisher");
    await publisher.publish(
      "socket:broadcast",
      JSON.stringify({ eventName, payload }),
    );
  }

  /** Publish a notification to all workers which emit it to all their sockets. */
  async sendNotification(notification: unknown): Promise<void> {
    const publisher = getWebSocketRedis("publisher");
    await publisher.publish(
      "socket:notification",
      JSON.stringify({ notification }),
    );
  }

  async cleanup(): Promise<void> {
    await closeWebSocketRedisConnections();
  }
}
