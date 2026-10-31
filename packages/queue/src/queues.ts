import { Queue } from "bullmq";
import { getBullMQConnection } from "./connection";
import { getRequestId } from "@hrms/logger";

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

// Auto-injects the ambient correlation ID (@hrms/logger's requestIdStorage,
// set by apiRequestLogger/grpcApiRequestLogger) into every job's data, so a
// worker's logs can be traced back to the HTTP/gRPC request that enqueued
// them — without every call site across every service needing to pass it
// explicitly. Mutates the queue's own `.add` in place.
function wrapAddWithRequestId(queue: Queue): void {
  const originalAdd = queue.add.bind(queue);
  queue.add = ((name: string, data: any, opts?: any) => {
    const requestId = data?.requestId ?? getRequestId();
    return originalAdd(name, requestId ? { ...data, requestId } : data, opts);
  }) as typeof queue.add;
}

let _emailQueue: Queue | null = null;
let _notificationQueue: Queue | null = null;
let _schedulerQueue: Queue | null = null;
let _resumeParsingQueue: Queue | null = null;
let _deadLetterQueue: Queue | null = null;
let _payrollDisbursementQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!_emailQueue) {
    _emailQueue = new Queue("emailQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions,
    });
    wrapAddWithRequestId(_emailQueue);
  }
  return _emailQueue;
}

export function getNotificationQueue(): Queue {
  if (!_notificationQueue) {
    _notificationQueue = new Queue("notificationQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions,
    });
    wrapAddWithRequestId(_notificationQueue);
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
    wrapAddWithRequestId(_resumeParsingQueue);
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
    wrapAddWithRequestId(_schedulerQueue);
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
 * Payroll disbursement queue — moves the RazorpayX payout loop
 * (1,000+ sequential external calls for a real employee count) out of the
 * status-update HTTP request. The worker (payrollDisbursementWorker.ts,
 * api-gateway) re-processes only line items not yet in a terminal state, so
 * both a BullMQ-driven retry and the dedicated retry-payouts endpoint are
 * safe to call repeatedly without double-paying anyone.
 *
 * Config: only 2 attempts (unlike the 3-attempt default) — a real external
 * payment-API failure is unlikely to be fixed by an automatic immediate
 * retry, and every further attempt should go through the explicit
 * retry-payouts endpoint instead, not silently via backoff.
 */
export function getPayrollDisbursementQueue(): Queue {
  if (!_payrollDisbursementQueue) {
    _payrollDisbursementQueue = new Queue("payrollDisbursementQueue", {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: false,
        attempts: 2,
        backoff: {
          type: "exponential" as const,
          delay: 10000,
        },
      },
    });
    wrapAddWithRequestId(_payrollDisbursementQueue);
  }
  return _payrollDisbursementQueue;
}
