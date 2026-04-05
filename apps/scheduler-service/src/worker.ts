import { Worker } from "bullmq";
import { getBullMQConnection } from "@hrms/queue";
import { logger } from "@hrms/logger";
import type { SchedulerJobData, SchedulerJobName } from "@hrms/queue";
import { updateExpiredHrActivities } from "./jobs/updateExpiredHrActivities";
import { updateExpiredJobOpenings } from "./jobs/updateExpiredJobOpenings";
import { updateEmployeeStatus } from "./jobs/updateEmployeeStatus";
import { reconcileAttendance } from "./jobs/reconcileAttendance";
import { updateLeaveBalance } from "./jobs/updateLeaveBalance";
import { sendKycReminders } from "./jobs/sendKycReminders";
import { cleanupFcmTokens } from "./jobs/cleanupFcmTokens";

const jobHandlers: Record<SchedulerJobName, () => Promise<void>> = {
  updateExpiredHrActivities,
  updateExpiredJobOpenings,
  updateEmployeeStatus,
  reconcileAttendance,
  updateLeaveBalance,
  sendKycReminders,
  cleanupFcmTokens,
};

export function startSchedulerWorker(): Worker {
  const worker = new Worker<SchedulerJobData>(
    "schedulerQueue",
    async (job) => {
      const { jobName } = job.data;
      const handler = jobHandlers[jobName];

      if (!handler) {
        logger.warn(`Unknown scheduler job: ${jobName}`);
        return;
      }

      logger.info(`Running scheduled job: ${jobName}`);
      const start = Date.now();
      await handler();
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
