import { Worker } from "bullmq";
import {
  prisma,
  prismaWithTenant,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { getBullMQConnection, getDeadLetterQueue } from "@hrms/queue";
import { logger } from "@hrms/logger";
import { getNotificationPublisher } from "@hrms/websocket";
import { sendPushNotifications } from "@hrms/firebase";
import type { NotificationJobData } from "@hrms/queue";

export function startNotificationWorker(): Worker {
  const worker = new Worker<NotificationJobData>(
    "notificationQueue",
    async (job) => {
      const {
        tenantId,
        title,
        message,
        recipients = [],
        pushTargets = [],
        targetUser,
        eventType = "general",
        sendPushNotification = true,
        priority = "medium",
        socketEvent,
        socketPayload,
      } = job.data;

      if (!tenantId) {
        // Every notification in this app belongs to a tenant. Writing it
        // without one used to silently fall back to the shared master DB
        // (prisma.notification.create with no tenant scoping) — refuse
        // instead, so a missing tenantId fails loudly at the producer.
        throw new Error(
          `Notification job ${job.id} is missing tenantId — refusing to process.`,
        );
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { dbName: true },
      });
      if (!tenant?.dbName) {
        // A null tenantClient here would make prismaWithTenant silently fall
        // back to the master DB (the exact bug this fix closes) — refuse
        // instead of writing into the wrong database.
        throw new Error(
          `Notification job ${job.id}: tenant ${tenantId} has no resolvable database.`,
        );
      }
      const tenantClient = getClientForDb(tenant.dbName);

      return runWithTenant(tenantId, tenantClient, async () => {
        // Resolve DB recipients: prefer explicit user IDs, else resolve from usernames
        let resolvedRecipients = [...recipients];
        if (resolvedRecipients.length === 0) {
          const targetUsernames =
            pushTargets.length > 0
              ? pushTargets
              : targetUser
                ? Array.isArray(targetUser)
                  ? targetUser
                  : [targetUser]
                : [];
          if (targetUsernames.length > 0) {
            const users = await prismaWithTenant.user.findMany({
              where: { username: { in: targetUsernames } },
              select: { id: true },
            });
            resolvedRecipients = users.map((u) => u.id);
          }
        }

        // Persist notification to the tenant's own database
        const notification = await (
          prismaWithTenant.notification.create as any
        )({
          data: {
            tenantId,
            title,
            message,
            eventType,
            priority,
            timeStamp: new Date(),
            ...(resolvedRecipients.length > 0
              ? {
                  recipients: {
                    create: resolvedRecipients.map((userId) => ({
                      tenantId,
                      userId,
                    })),
                  },
                }
              : {}),
          },
          include: { recipients: true },
        });

        // Deliver via WebSocket to connected clients through the API gateway.
        // sendToUser()/the socket registry are keyed by userId, not username —
        // resolvedRecipients above already is that userId list (either passed
        // directly as `recipients`, or resolved from pushTargets/targetUser),
        // so reuse it here instead of re-deriving anything from usernames.
        const wsPublisher = getNotificationPublisher();

        if (resolvedRecipients.length > 0) {
          await Promise.all(
            resolvedRecipients.map((userId) =>
              wsPublisher.sendToUser(userId, "notification", notification),
            ),
          );
          if (socketEvent) {
            await Promise.all(
              resolvedRecipients.map((userId) =>
                wsPublisher.sendToUser(
                  userId,
                  socketEvent,
                  socketPayload ?? notification,
                ),
              ),
            );
          }
        } else {
          await wsPublisher.sendNotification(notification);
        }

        // FCM push notifications
        let fcmResult = { sentCount: 0, failedCount: 0, success: false };
        if (sendPushNotification) {
          let targets: string[] = pushTargets;
          if (!targets.length && targetUser) {
            targets = Array.isArray(targetUser) ? targetUser : [targetUser];
          }

          const result =
            targets.length > 0
              ? await sendPushNotifications(targets, title, message)
              : await sendPushNotifications("ALL_USERS", title, message);

          fcmResult = {
            sentCount: result.sentCount,
            failedCount: result.failedCount,
            success: result.success,
          };
        }

        logger.info(`Notification job ${job.id} processed`, {
          notificationId: notification.id,
          dbRecipients: recipients.length,
          fcmSent: fcmResult.sentCount,
        });

        return {
          success: true,
          notificationId: notification.id,
          dbRecipients: recipients.length,
          pushNotificationResult: fcmResult,
        };
      });
    },
    {
      connection: getBullMQConnection(),
      concurrency: 10,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`Notification job ${job?.id} failed:`, { err });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      getDeadLetterQueue()
        .add("failed-notification", {
          originalQueue: "notificationQueue",
          originalJobId: job.id,
          originalJobData: job.data,
          failureReason: err.message,
          failedAt: new Date().toISOString(),
        })
        .catch((dlqErr) =>
          logger.error("Failed to forward job to DLQ:", { dlqErr }),
        );
    }
  });

  worker.on("stalled", (jobId) => {
    logger.warn(`Notification job ${jobId} stalled`);
  });

  worker.on("error", (err) => {
    logger.error("Notification worker error:", { err });
  });

  return worker;
}
