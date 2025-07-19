// server/config/redisAdapter.mjs - Updated to use consolidated Redis config
import { RedisConnectionManager } from "./redisConfig.mjs";

class RedisWebSocketAdapter {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map();

    // Use the centralized connection manager
    const redisManager = RedisConnectionManager.getInstance();

    // Create specialized connections for pub/sub and client operations
    this.publisher = redisManager.getConnection("publisher");
    this.subscriber = redisManager.getConnection("subscriber");
    this.redisClient = redisManager.getConnection("websocket");

    this.setupSubscriber();
    this.setupSocketHandlers();
  }

  setupSubscriber() {
    // Wait for subscriber connection to be ready before subscribing
    this.subscriber.on("ready", () => {
      // Subscribe to WebSocket events
      this.subscriber.subscribe(
        "socket:user-message",
        "socket:broadcast",
        "socket:notification"
      );
    });

    this.subscriber.on("message", async (channel, message) => {
      try {
        const data = JSON.parse(message);

        switch (channel) {
          case "socket:user-message":
            await this.handleUserMessage(data);
            break;
          case "socket:broadcast":
            await this.handleBroadcast(data);
            break;
          case "socket:notification":
            await this.handleNotification(data);
            break;
        }
      } catch (error) {
        console.error("Error processing Redis message:", error);
      }
    });
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      const username = socket.username;

      // Store socket locally and in Redis
      this.userSockets.set(username, socket.id);
      this.redisClient.hset(
        "user:sockets",
        username,
        `${process.pid}:${socket.id}`
      );

      socket.on("disconnect", () => {
        this.userSockets.delete(username);
        this.redisClient.hdel("user:sockets", username);
      });

      socket.on("error", (error) => {
        console.error(`Socket error for user ${username}:`, error);
      });
    });
  }

  async handleUserMessage(data) {
    const { username, eventName, payload } = data;
    const socketId = this.userSockets.get(username);

    if (socketId) {
      this.io.to(socketId).emit(eventName, payload);
    }
  }

  async handleBroadcast(data) {
    const { eventName, payload } = data;
    this.io.emit(eventName, payload);
  }

  async handleNotification(data) {
    const { notification } = data;

    // Broadcast to all connected sockets in this worker
    this.io.sockets.sockets.forEach((socket) => {
      socket.emit("notification", notification);
    });
  }

  // Method to send message to specific user across all workers
  async sendToUser(username, eventName, data) {
    const userSocketInfo = await this.redisClient.hget(
      "user:sockets",
      username
    );

    if (userSocketInfo) {
      const [pid, socketId] = userSocketInfo.split(":");

      // If user is connected to this worker, send directly
      if (parseInt(pid) === process.pid && this.userSockets.has(username)) {
        this.io.to(socketId).emit(eventName, data);
        return true;
      } else {
        // Send via Redis pub/sub to other workers
        await this.publisher.publish(
          "socket:user-message",
          JSON.stringify({
            username,
            eventName,
            payload: data,
          })
        );
        return true;
      }
    }

    return false;
  }

  // Method to broadcast to all users across all workers
  async broadcast(eventName, data) {
    await this.publisher.publish(
      "socket:broadcast",
      JSON.stringify({
        eventName,
        payload: data,
      })
    );
  }

  // Method to send notifications across all workers
  async sendNotification(notification) {
    await this.publisher.publish(
      "socket:notification",
      JSON.stringify({
        notification,
      })
    );
  }

  // Cleanup method - now uses the centralized manager
  async cleanup() {
    // The connection manager will handle cleanup of all connections
    return RedisConnectionManager.getInstance().closeAll();
  }
}

export default RedisWebSocketAdapter;
