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
