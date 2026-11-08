import type { Queue } from "bullmq";
import {
  getNotificationQueue,
  getLegacyNotificationQueue,
  NOTIFICATION_QUEUE_NAME,
  LEGACY_NOTIFICATION_QUEUE_NAME,
} from "@hrms/queue";
import type { NotificationJobData } from "@hrms/queue";
import { logger } from "@hrms/logger";

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Replays are a per-job decision; a request naming more jobs is refused. */
export const MAX_REPLAY_JOBS = 50;
export const DEFAULT_REPLAY_MAX_AGE_DAYS = 7;

const QUEUES: Record<string, () => Queue> = {
  [NOTIFICATION_QUEUE_NAME]: getNotificationQueue,
  [LEGACY_NOTIFICATION_QUEUE_NAME]: getLegacyNotificationQueue,
};

/**
 * Logs how many failed jobs each notification queue retains. Run at
 * startup instead of replaying them: failed jobs stay where they are (and
 * in the dead-letter queue) until an operator replays specific ones.
 */
export async function reportFailedNotificationJobs(): Promise<void> {
  for (const [name, getQueue] of Object.entries(QUEUES)) {
    try {
      const failed = await getQueue().getFailedCount();
      if (failed > 0) {
        logger.warn(
          `${name}: ${failed} failed notification job(s) retained — not replayed automatically; replay chosen jobs with scripts/replayFailedNotifications`,
        );
      }
    } catch (err) {
      logger.warn(`Could not count failed jobs on ${name}`, { err });
    }
  }
}

export interface ReplayRequest {
  queueName: string;
  /** Every selected job must belong to this tenant. */
  tenantId: string;
  jobIds: string[];
  /** false (default) reports what would be replayed without changing anything. */
  execute?: boolean;
  /** Jobs created longer ago than this are refused — their content is stale. */
  maxAgeDays?: number;
  now?: Date;
}

export interface ReplayDecision {
  jobId: string;
  outcome: "replayed" | "would-replay" | "refused";
  reason?: string;
}

// Why a job must not be replayed, or null if it may be.
function refusal(
  data: NotificationJobData | undefined,
  tenantId: string,
): string | null {
  if (!data || data.tenantId !== tenantId) {
    return "job does not belong to the selected tenant";
  }
  if (data.broadcast?.scope === "platform") {
    return "platform broadcasts are never replayed";
  }
  const named =
    (data.recipients?.length ?? 0) > 0 ||
    (data.pushTargets?.length ?? 0) > 0 ||
    (Array.isArray(data.targetUser)
      ? data.targetUser.length > 0
      : !!data.targetUser);
  if (!named && data.broadcast?.scope !== "tenant") {
    return "job names no recipients";
  }
  return null;
}

/**
 * Re-queues explicitly selected failed notification jobs of one tenant.
 *
 * The job keeps its id, so the worker's per-job dedupe still applies: a job
 * that already stored its notification is not delivered again. The worker
 * resolves recipients inside the job's tenant as for any other job, so a
 * replay reaches no one a fresh job could not.
 */
export async function replayFailedNotificationJobs(
  req: ReplayRequest,
): Promise<ReplayDecision[]> {
  const getQueue = QUEUES[req.queueName];
  if (!getQueue) {
    throw new Error(
      `Unknown notification queue "${req.queueName}" (expected one of: ${Object.keys(QUEUES).join(", ")})`,
    );
  }
  if (!OBJECT_ID.test(req.tenantId ?? "")) {
    throw new Error("A valid tenantId is required");
  }
  const jobIds = [...new Set(req.jobIds.map((id) => id.trim()))].filter(
    Boolean,
  );
  if (jobIds.length === 0) {
    throw new Error("Select the jobs to replay by id — there is no replay-all");
  }
  if (jobIds.length > MAX_REPLAY_JOBS) {
    throw new Error(
      `Refusing to replay ${jobIds.length} jobs at once (limit ${MAX_REPLAY_JOBS})`,
    );
  }

  const maxAgeMs = (req.maxAgeDays ?? DEFAULT_REPLAY_MAX_AGE_DAYS) * DAY_MS;
  const now = (req.now ?? new Date()).getTime();
  const queue = getQueue();
  const decisions: ReplayDecision[] = [];

  for (const jobId of jobIds) {
    const job = await queue.getJob(jobId);
    let reason: string | null;
    if (!job) {
      reason = "job not found";
    } else if ((await job.getState()) !== "failed") {
      reason = "job is not in the failed state";
    } else {
      reason = refusal(job.data as NotificationJobData, req.tenantId);
      if (!reason && now - job.timestamp > maxAgeMs) {
        reason = `job is older than ${req.maxAgeDays ?? DEFAULT_REPLAY_MAX_AGE_DAYS} day(s)`;
      }
    }

    if (!job || reason) {
      decisions.push({
        jobId,
        outcome: "refused",
        reason: reason ?? undefined,
      });
      logger.warn(`Notification replay refused for ${req.queueName}#${jobId}`, {
        reason,
      });
      continue;
    }
    if (req.execute) {
      await job.retry("failed", { resetAttemptsMade: true });
      decisions.push({ jobId, outcome: "replayed" });
      logger.info(`Notification job replayed: ${req.queueName}#${jobId}`, {
        tenantId: req.tenantId,
      });
    } else {
      decisions.push({ jobId, outcome: "would-replay" });
    }
  }
  return decisions;
}
