import { Worker } from "bullmq";
import Redis from "ioredis";
import NotificationModel from "../model/notificationModel.mjs";

// Create Redis connection for worker
const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Create notification worker with Redis adapter support
const createNotificationWorker = (io, redisAdapter) => {
  const worker = new Worker(
    "notificationQueue",
    async (job) => {
      const { title, message, targetUser, eventType } = job.data;

      try {
        const notificationEntry = {
          title: title,
          message: message,
          timeStamp: new Date(),
          targetUser: targetUser || null, // Can be string, array, or null
          eventType: eventType || "general",
        };

        const savedNotification = await NotificationModel.create(
          notificationEntry
        );

        // Handle different target user scenarios
        if (targetUser) {
          // Check if targetUser is an array
          if (Array.isArray(targetUser)) {
            // Send to multiple specific users
            const sendPromises = targetUser.map((username) =>
              redisAdapter.sendToUser(
                username,
                "notification",
                savedNotification
              )
            );

            await Promise.all(sendPromises);

            console.log(
              `Notification sent to ${targetUser.length} users via Redis: ${title} - Worker ${process.pid}`
            );
          } else {
            // Send to single specific user (backward compatibility)
            await redisAdapter.sendToUser(
              targetUser,
              "notification",
              savedNotification
            );

            console.log(
              `Notification sent to user ${targetUser} via Redis: ${title} - Worker ${process.pid}`
            );
          }
        } else {
          // Broadcast to all users
          await redisAdapter.sendNotification(savedNotification);

          console.log(
            `Notification broadcast to all users via Redis: ${title} - Worker ${process.pid}`
          );
        }

        return {
          success: true,
          notificationId: savedNotification._id,
          processedBy: process.pid,
          targetUsers: Array.isArray(targetUser)
            ? targetUser
            : targetUser
            ? [targetUser]
            : "all",
        };
      } catch (error) {
        console.error(
          `Error processing notification job ${job.id} in worker ${process.pid}:`,
          error
        );
        throw error;
      }
    },
    {
      connection,
      concurrency: 10, // Process up to 10 jobs concurrently
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50, // Keep last 50 failed jobs
      stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
      maxStalledCount: 1, // Max number of times a job can be stalled
    }
  );

  worker.on("completed", (job, result) => {
    console.log(
      `Notification job ${job.id} completed by worker ${
        result.processedBy
      } for targets: ${JSON.stringify(result.targetUsers)}`
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `Notification job ${job.id} failed in worker ${process.pid}:`,
      err
    );
  });

  worker.on("stalled", (jobId) => {
    console.warn(`Notification job ${jobId} stalled in worker ${process.pid}`);
  });

  worker.on("error", (err) => {
    console.error(`Notification worker error in worker ${process.pid}:`, err);
  });

  return worker;
};

export default createNotificationWorker;
