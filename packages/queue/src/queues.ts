import { Queue } from "bullmq";
import { getBullMQConnection } from "./connection";

const defaultJobOptions = {
  removeOnComplete: 100,
  // Keep all failed jobs so nothing is silently discarded. The DLQ listener
  // in each worker forwards them after all retries are exhausted.
  removeOnFail: false,
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
};

let _emailQueue: Queue | null = null;
let _notificationQueue: Queue | null = null;
let _schedulerQueue: Queue | null = null;
let _resumeParsingQueue: Queue | null = null;
let _deadLetterQueue: Queue | null = null;
let _webhookQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!_emailQueue) {
    _emailQueue = new Queue("emailQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions,
    });
  }
  return _emailQueue;
}

export function getNotificationQueue(): Queue {
  if (!_notificationQueue) {
    _notificationQueue = new Queue("notificationQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions,
    });
  }
  return _notificationQueue;
}

export function getResumeParsingQueue(): Queue {
  if (!_resumeParsingQueue) {
    _resumeParsingQueue = new Queue("resumeParsingQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 2,
      },
    });
  }
  return _resumeParsingQueue;
}

export function getSchedulerQueue(): Queue {
  if (!_schedulerQueue) {
    _schedulerQueue = new Queue("schedulerQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 1, // cron jobs should not auto-retry; next run handles it
      },
    });
  }
  return _schedulerQueue;
}

// Dead-letter queue — receives jobs that have exhausted all retry attempts.
// Inspect with: bullmq UI, or `queue.getFailed()` + `queue.retryJobs()`.
export function getDeadLetterQueue(): Queue {
  if (!_deadLetterQueue) {
    _deadLetterQueue = new Queue("deadLetterQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: false,
      },
    });
  }
  return _deadLetterQueue;
}

/**
 * Webhook delivery queue — used by webhookEmitter.ts (api-gateway)
 * and processed by deliverWebhook.ts (scheduler-service).
 *
 * Separate from schedulerQueue so webhook deliveries don't share
 * concurrency with cron jobs and don't affect cron job scheduling.
 *
 * Config:
 *   – 3 attempts, exponential backoff starting at 5 s.
 *   – removeOnFail: false → dead deliveries remain visible for manual retry.
 */
export function getWebhookQueue(): Queue {
  if (!_webhookQueue) {
    _webhookQueue = new Queue("webhookQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: "exponential" as const,
          delay: 5000,
        },
      },
    });
  }
  return _webhookQueue;
}
