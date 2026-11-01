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
  { name: "sendTrialReminders", pattern: "30 9 * * *" }, // 9:30 AM daily
  // ── New feature jobs ────────────────────────────────────────────────────────
  { name: "checkTicketSla", pattern: "0 4 * * *" }, // 4:00 AM — bulk SLA sweep
];

/**
 * Cron jobs only run where SCHEDULER_ENABLED=true is set explicitly
 * (docker-compose.prod.yml). Development and production share one database
 * connection string, so a local stack that ran crons would apply them to
 * production data — on 2026-10-31 a local scheduler ran the month-end leave
 * accrual (docs/performance/attendance-backfill-root-cause.md). Opt-in, not
 * opt-out, so a new environment is safe by default.
 */
export function isSchedulerEnabled(): boolean {
  return process.env.SCHEDULER_ENABLED === "true";
}

/** Removes repeatable cron jobs left in this Redis by an earlier run. */
export async function unregisterScheduledJobs(): Promise<number> {
  const queue = getSchedulerQueue();
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }
  return existing.length;
}

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
