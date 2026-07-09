import { getSchedulerQueue } from "@hrms/queue";
import { logger } from "@hrms/logger";
import type { SchedulerJobName } from "@hrms/queue";

interface JobSchedule {
  name: SchedulerJobName;
  pattern: string;
}

const JOB_SCHEDULES: JobSchedule[] = [
  { name: "updateExpiredHrActivities", pattern: "0 1 * * *" }, // 1:00 AM daily
  { name: "updateExpiredJobOpenings", pattern: "0 1 * * *" }, // 1:00 AM daily
  { name: "updateEmployeeStatus", pattern: "15 0 * * *" }, // 12:15 AM daily
  { name: "reconcileAttendance", pattern: "15 0 * * *" }, // 12:15 AM daily
  { name: "updateLeaveBalance", pattern: "30 0 1 * *" }, // 1st of month 12:30 AM
  { name: "sendKycReminders", pattern: "0 9 * * *" }, // 9:00 AM daily
  { name: "cleanupFcmTokens", pattern: "0 2 * * *" }, // 2:00 AM daily
  { name: "checkSubscriptionExpiry", pattern: "0 3 * * *" }, // 3:00 AM daily
  // ── New feature jobs ────────────────────────────────────────────────────────
  { name: "checkTicketSla", pattern: "0 4 * * *" }, // 4:00 AM — bulk SLA sweep
  { name: "retryFailedWebhooks", pattern: "0 6 * * *" }, // 6:00 AM — stale delivery sweep
  // ── Dev-only recurring demo-data seeders (no-op outside local dev) ─────────
  { name: "seedDailyAttendance", pattern: "0 23 * * *" }, // 11:00 PM daily
  { name: "seedHrActivities", pattern: "0 10 1,15 * *" }, // 1st & 15th, 10:00 AM
  { name: "seedJobOpenings", pattern: "0 11 1,15 * *" }, // 1st & 15th, 11:00 AM
  { name: "seedPayroll", pattern: "0 12 1 * *" }, // 1st of month, 12:00 PM
];

export async function registerScheduledJobs(): Promise<void> {
  const queue = getSchedulerQueue();

  // Remove all existing repeatable jobs to avoid duplicates on restart
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  for (const { name, pattern } of JOB_SCHEDULES) {
    await queue.add(name, { jobName: name }, { repeat: { pattern } });
    logger.info(`Scheduled job registered: ${name} (${pattern})`);
  }

  logger.info(`All ${JOB_SCHEDULES.length} scheduled jobs registered`);
}
