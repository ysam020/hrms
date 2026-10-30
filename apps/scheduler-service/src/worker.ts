import { Worker, Job } from "bullmq";
import {
  getBullMQConnection,
  getWebhookQueue,
  getDeadLetterQueue,
} from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
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
import { sendTrialReminders } from "./jobs/sendTrialReminders";
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
  sendTrialReminders,
  checkTicketSla,
  retryFailedWebhooks,
};

async function processSchedulerJob(job: Job<SchedulerJobData>) {
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
  logger.info(`Completed scheduled job: ${jobName} in ${Date.now() - start}ms`);
}

/** Cron / scheduler queue worker (serial, concurrency=1). */
export function startSchedulerWorker(): Worker {
  const worker = new Worker<SchedulerJobData>(
    "schedulerQueue",
    // Almost always undefined here — these are timer-driven, not enqueued
    // from a request — but a manually-triggered job (if one is ever added)
    // gets its correlation ID threaded through for free.
    (job) =>
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () =>
            processSchedulerJob(job),
          )
        : processSchedulerJob(job),
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

async function processWebhookJob(job: Job<WebhookDeliveryJobData>) {
  const { deliveryId } = job.data;
  if (!deliveryId) {
    logger.warn(`webhookWorker: job ${job.id} missing deliveryId`);
    return;
  }
  await deliverWebhook({ deliveryId });
}

/**
 * Webhook delivery worker (high-concurrency, separate queue).
 * Processes deliverWebhook jobs enqueued by webhookEmitter.ts.
 * Runs concurrently (up to 10) since each job is an independent HTTP call.
 */
export function startWebhookWorker(): Worker {
  const worker = new Worker<WebhookDeliveryJobData>(
    "webhookQueue",
    (job) =>
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () => processWebhookJob(job))
        : processWebhookJob(job),
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
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      getDeadLetterQueue()
        .add("failed-webhook", {
          originalQueue: "webhookQueue",
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
    logger.warn(`Webhook job ${jobId} stalled`);
  });
  worker.on("error", (err) => {
    logger.error("Webhook worker error:", { err });
  });

  return worker;
}
