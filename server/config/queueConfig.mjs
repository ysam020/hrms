import { Queue } from "bullmq";
import Redis from "ioredis";

// Create Redis connection with BullMQ-specific options
export const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false, // Recommended for BullMQ
  retryDelayOnFailover: 100,
  lazyConnect: true,
});

export const emailQueue = new Queue("emailQueue", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

export const notificationQueue = new Queue("notificationQueue", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});
