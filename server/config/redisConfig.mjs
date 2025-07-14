import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? process.env.REDIS_PORT : 6379,
});

redisClient.on("error", (error) => {
  console.error("Redis error:", error);
});

export default redisClient;
