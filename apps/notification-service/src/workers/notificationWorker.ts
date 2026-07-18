import { randomUUID } from "crypto";
import { Worker } from "bullmq";
import {
  prisma,
  prismaWithTenant,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { getBullMQConnection, getDeadLetterQueue } from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
import { getNotificationPublisher } from "@hrms/websocket";
import { sendPushNotifications } from "@hrms/firebase";
import { getRedisClient } from "@hrms/cache";
import type { NotificationJobData } from "@hrms/queue";
import type { Job } from "bullmq";

// Guards the check-then-create idempotency block below against a real race:
// jobId is a plain @@index in the schema, not @unique (MongoDB doesn't
// support sparse:true on optional @unique fields via Prisma — see the
// schema comment on Notification.jobId), so two concurrent invocations of
// processJob for the same job — which BullMQ can produce by reassigning a
// job to a new worker slot after `stalledInterval` elapses while the
// original invocation is still running — could otherwise both pass the
// findFirst check before either commits its create, and both send the
// employee a duplicate WebSocket event and push notification. A short-lived
// Redis lock, released as soon as the critical section finishes (not held
// for its full TTL), serializes the two attempts without slowing down the
// common case where there's no contention at all.
const NOTIFICATION_LOCK_TTL_SECONDS = 60; // generous vs. a real send (DB write + WS fan-out + FCM to many devices); self-heals if a holder crashes without releasing
const LOCK_WAIT_RETRY_MS = 200;
const LOCK_WAIT_MAX_ATTEMPTS = 50; // ~10s bounded wait for a concurrent attempt to finish, before failing this attempt back to BullMQ's own retry/backoff

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `fn` (the existing findFirst-then-create idempotency block) under a
// per-jobId lock. If another attempt already holds it, waits (rather than
// proceeding unguarded) so that once this attempt does get the lock, fn's
// own findFirst check finds the row the other attempt already committed and
// takes the dedup path — no separate "check after waiting" logic needed.
async function withNotificationJobLock<T>(
  jobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = `lock:notification-job:${jobId}`;
  const token = randomUUID();

  for (let attempt = 0; ; attempt++) {
    const acquired = await getRedisClient().set(
      lockKey,
      token,
      "EX",
      NOTIFICATION_LOCK_TTL_SECONDS,
      "NX",
    );
    if (acquired === "OK") {
      try {
        return await fn();
      } finally {
        await getRedisClient()
          .eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token)
          .catch((err) =>
            logger.warn(`Failed to release notification job lock ${lockKey}`, {
              err,
            }),
          );
      }
    }
    if (attempt >= LOCK_WAIT_MAX_ATTEMPTS) {
      throw new Error(
        `Notification job ${jobId}: timed out waiting for a concurrent attempt to finish — will be retried by BullMQ.`,
      );
    }
    await sleep(LOCK_WAIT_RETRY_MS);
  }
}

export function startNotificationWorker(): Worker {
  const worker = new Worker<NotificationJobData>(
    "notificationQueue",
    (job) =>
      // Continue the correlation ID the producer attached (see
      // getNotificationQueue in @hrms/queue) so this worker's own log lines
      // can be traced back to the HTTP/gRPC request that enqueued the job —
      // closing the last leg of HTTP -> gRPC -> queue propagation.
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () => processJob(job))
        : processJob(job),
    {
      connection: getBullMQConnection(),
      concurrency: 10,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`Notification job ${job?.id} failed:`, { err });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      getDeadLetterQueue()
        .add("failed-notification", {
          originalQueue: "notificationQueue",
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
    logger.warn(`Notification job ${jobId} stalled`);
  });

  worker.on("error", (err) => {
    logger.error("Notification worker error:", { err });
  });

  return worker;
}

async function processJob(job: Job<NotificationJobData>) {
  const {
    tenantId,
    title,
    message,
    recipients = [],
    pushTargets = [],
    targetUser,
    eventType = "general",
    sendPushNotification = true,
    priority = "medium",
    socketEvent,
    socketPayload,
  } = job.data;

  if (!tenantId) {
    // Every notification in this app belongs to a tenant. Writing it
    // without one used to silently fall back to the shared master DB
    // (prisma.notification.create with no tenant scoping) — refuse
    // instead, so a missing tenantId fails loudly at the producer.
    throw new Error(
      `Notification job ${job.id} is missing tenantId — refusing to process.`,
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbName: true },
  });
  if (!tenant?.dbName) {
    // A null tenantClient here would make prismaWithTenant silently fall
    // back to the master DB (the exact bug this fix closes) — refuse
    // instead of writing into the wrong database.
    throw new Error(
      `Notification job ${job.id}: tenant ${tenantId} has no resolvable database.`,
    );
  }
  const tenantClient = getClientForDb(tenant.dbName);

  const process = async () => {
    // Idempotency guard: a BullMQ retry (transient failure after the DB
    // write but before job completion — e.g. an FCM timeout) would
    // otherwise re-run the create, re-send the WebSocket message, and
    // re-call push delivery, giving the employee duplicates of all
    // three. jobId is set once per job attempt series (BullMQ keeps the
    // same job.id across retries of the same job), so a hit here means
    // this exact job already completed its DB write at least once.
    const existing = job.id
      ? await (prismaWithTenant.notification.findFirst as any)({
          where: { jobId: String(job.id) },
          include: { recipients: true },
        })
      : null;
    if (existing) {
      logger.info(
        `Notification job ${job.id} already processed — skipping duplicate create/broadcast/push`,
        { notificationId: existing.id },
      );
      return {
        success: true,
        notificationId: existing.id,
        dbRecipients: existing.recipients.length,
        pushNotificationResult: {
          sentCount: 0,
          failedCount: 0,
          success: true,
        },
        deduped: true,
      };
    }

    // Resolve DB recipients: prefer explicit user IDs, else resolve from usernames
    let resolvedRecipients = [...recipients];
    if (resolvedRecipients.length === 0) {
      const targetUsernames =
        pushTargets.length > 0
          ? pushTargets
          : targetUser
            ? Array.isArray(targetUser)
              ? targetUser
              : [targetUser]
            : [];
      if (targetUsernames.length > 0) {
        const users = await prismaWithTenant.user.findMany({
          where: { username: { in: targetUsernames } },
          select: { id: true },
        });
        resolvedRecipients = users.map((u) => u.id);
      }
    }

    // Persist notification to the tenant's own database
    const notification = await (prismaWithTenant.notification.create as any)({
      data: {
        tenantId,
        title,
        message,
        eventType,
        priority,
        timeStamp: new Date(),
        ...(job.id ? { jobId: String(job.id) } : {}),
        ...(resolvedRecipients.length > 0
          ? {
              recipients: {
                create: resolvedRecipients.map((userId) => ({
                  tenantId,
                  userId,
                })),
              },
            }
          : {}),
      },
      include: { recipients: true },
    });

    // Deliver via WebSocket to connected clients through the API gateway.
    // sendToUser()/the socket registry are keyed by userId, not username —
    // resolvedRecipients above already is that userId list (either passed
    // directly as `recipients`, or resolved from pushTargets/targetUser),
    // so reuse it here instead of re-deriving anything from usernames.
    const wsPublisher = getNotificationPublisher();

    if (resolvedRecipients.length > 0) {
      await Promise.all(
        resolvedRecipients.map((userId) =>
          wsPublisher.sendToUser(userId, "notification", notification),
        ),
      );
      if (socketEvent) {
        await Promise.all(
          resolvedRecipients.map((userId) =>
            wsPublisher.sendToUser(
              userId,
              socketEvent,
              socketPayload ?? notification,
            ),
          ),
        );
      }
    } else {
      await wsPublisher.sendNotification(notification);
    }

    // FCM push notifications
    let fcmResult = { sentCount: 0, failedCount: 0, success: false };
    if (sendPushNotification) {
      let targets: string[] = pushTargets;
      if (!targets.length && targetUser) {
        targets = Array.isArray(targetUser) ? targetUser : [targetUser];
      }

      const result =
        targets.length > 0
          ? await sendPushNotifications(targets, title, message)
          : await sendPushNotifications("ALL_USERS", title, message);

      fcmResult = {
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        success: result.success,
      };
    }

    logger.info(`Notification job ${job.id} processed`, {
      notificationId: notification.id,
      dbRecipients: recipients.length,
      fcmSent: fcmResult.sentCount,
    });

    return {
      success: true,
      notificationId: notification.id,
      dbRecipients: recipients.length,
      pushNotificationResult: fcmResult,
    };
  };

  return runWithTenant(tenantId, tenantClient, () =>
    // No jobId to lock on (and nothing for the findFirst guard inside
    // `process` to dedupe against either) — proceed directly, matching the
    // prior behavior for that edge case exactly.
    job.id ? withNotificationJobLock(String(job.id), process) : process(),
  );
}
