import Redis from "ioredis";

class RedisWebSocketAdapter {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map();

    // Create Redis connections for pub/sub
    this.publisher = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Redis client for storing user-socket mappings
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.setupSubscriber();
    this.setupSocketHandlers();
  }

  setupSubscriber() {
    // Subscribe to WebSocket events
    this.subscriber.subscribe(
      "socket:user-message",
      "socket:broadcast",
      "socket:notification"
    );

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

  // Cleanup method
  async cleanup() {
    await this.subscriber.disconnect();
    await this.publisher.disconnect();
    await this.redisClient.disconnect();
  }
}

export default RedisWebSocketAdapter;
