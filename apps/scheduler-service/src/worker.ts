import { Worker, Job } from "bullmq";
import { getBullMQConnection } from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
import type { SchedulerJobData, SchedulerJobName } from "@hrms/queue";
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
import { acquireJobLease, leaseIdFor, releaseJobLease } from "./utils/jobLease";

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
};

async function processSchedulerJob(job: Job<SchedulerJobData>) {
  const { jobName, ticketId } = job.data;
  const handler = jobHandlers[jobName];

  if (!handler) {
    logger.warn(`Unknown scheduler job: ${jobName}`);
    return;
  }

  // Cron runs are leased per period in the shared database so a second
  // scheduler (or a retry) can't repeat a job's effect — see jobLease.ts.
  // Per-ticket SLA checks are ad-hoc delayed jobs, not cron fires.
  const leaseId = ticketId
    ? null
    : leaseIdFor(
        jobName,
        new Date((job.timestamp ?? Date.now()) + (job.opts?.delay ?? 0)),
      );
  if (leaseId && !(await acquireJobLease(leaseId))) {
    logger.info(
      `Skipping scheduled job: ${jobName} — already run (${leaseId})`,
    );
    return;
  }

  logger.info(`Running scheduled job: ${jobName}`);
  const start = Date.now();
  try {
    // Pass extra job data (e.g. ticketId for checkTicketSla).
    await handler({ ticketId });
  } catch (err) {
    if (leaseId)
      await releaseJobLease(
        leaseId,
        "failed",
        String((err as Error)?.message ?? err),
      );
    throw err;
  }
  if (leaseId) await releaseJobLease(leaseId, "done");
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
