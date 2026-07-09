import { Worker } from "bullmq";
import { getBullMQConnection, getWebhookQueue } from "@hrms/queue";
import { logger } from "@hrms/logger";
import type {
  SchedulerJobData,
  SchedulerJobName,
  WebhookDeliveryJobData,
} from "@hrms/queue";
import { updateExpiredHrActivities } from "./jobs/updateExpiredHrActivities";
import { updateExpiredJobOpenings } from "./jobs/updateExpiredJobOpenings";
import { updateEmployeeStatus } from "./jobs/updateEmployeeStatus";
import { reconcileAttendance } from "./jobs/reconcileAttendance";
import { updateLeaveBalance } from "./jobs/updateLeaveBalance";
import { sendKycReminders } from "./jobs/sendKycReminders";
import { cleanupFcmTokens } from "./jobs/cleanupFcmTokens";
import { checkSubscriptionExpiry } from "./jobs/checkSubscriptionExpiry";
import { checkTicketSla } from "./jobs/checkTicketSla";
import { retryFailedWebhooks } from "./jobs/retryFailedWebhooks";
import { deliverWebhook } from "./jobs/deliverWebhook";

// Typed handler map — TypeScript enforces every SchedulerJobName is handled.
const jobHandlers: Record<SchedulerJobName, (data?: any) => Promise<void>> = {
  updateExpiredHrActivities,
  updateExpiredJobOpenings,
  updateEmployeeStatus,
  reconcileAttendance,
  updateLeaveBalance,
  sendKycReminders,
  cleanupFcmTokens,
  checkSubscriptionExpiry,
  checkTicketSla,
  retryFailedWebhooks,
};

/** Cron / scheduler queue worker (serial, concurrency=1). */
export function startSchedulerWorker(): Worker {
  const worker = new Worker<SchedulerJobData>(
    "schedulerQueue",
    async (job) => {
      const { jobName, ticketId } = job.data;
      const handler = jobHandlers[jobName];

      if (!handler) {
        logger.warn(`Unknown scheduler job: ${jobName}`);
        return;
      }

      logger.info(`Running scheduled job: ${jobName}`);
      const start = Date.now();
      // Pass extra job data (e.g. ticketId for checkTicketSla).
      await handler({ ticketId });
      logger.info(
        `Completed scheduled job: ${jobName} in ${Date.now() - start}ms`,
      );
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1, // cron jobs run serially to avoid DB contention
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
      stalledInterval: 60 * 1000,
      maxStalledCount: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`Scheduler job ${job?.data?.jobName ?? job?.id} failed:`, {
      err,
    });
  });
  worker.on("stalled", (jobId) => {
    logger.warn(`Scheduler job ${jobId} stalled`);
  });
  worker.on("error", (err) => {
    logger.error("Scheduler worker error:", { err });
  });

  return worker;
}

/**
 * Webhook delivery worker (high-concurrency, separate queue).
 * Processes deliverWebhook jobs enqueued by webhookEmitter.ts.
 * Runs concurrently (up to 10) since each job is an independent HTTP call.
 */
export function startWebhookWorker(): Worker {
  const worker = new Worker<WebhookDeliveryJobData>(
    "webhookQueue",
    async (job) => {
      const { deliveryId } = job.data;
      if (!deliveryId) {
        logger.warn(`webhookWorker: job ${job.id} missing deliveryId`);
        return;
      }
      await deliverWebhook({ deliveryId });
    },
    {
      connection: getBullMQConnection(),
      concurrency: 10, // webhooks are I/O-bound HTTP calls — safe to parallelise
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
      stalledInterval: 30 * 1000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      `Webhook delivery ${job?.data?.deliveryId ?? job?.id} failed:`,
      { err },
    );
  });
  worker.on("stalled", (jobId) => {
    logger.warn(`Webhook job ${jobId} stalled`);
  });
  worker.on("error", (err) => {
    logger.error("Webhook worker error:", { err });
  });

  return worker;
}
