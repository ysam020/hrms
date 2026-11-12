import { randomUUID } from "crypto";
import { Worker } from "bullmq";
import { openTransient } from "@hrms/crypto";
import {
  prisma,
  prismaWithTenant,
  runWithTenant,
  getClientForDb,
  BLOCKED_STATUSES,
} from "@hrms/db";
import {
  getBullMQConnection,
  getDeadLetterQueue,
  NOTIFICATION_QUEUE_NAME,
  LEGACY_NOTIFICATION_QUEUE_NAME,
} from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
import { getNotificationPublisher } from "@hrms/websocket";
import {
  sendPushNotifications,
  assertPlatformBroadcastAuthorized,
  type PushAudience,
} from "@hrms/firebase";
import { getRedisClient } from "@hrms/cache";
import { safeAppLink } from "@hrms/common";
import type { NotificationBroadcast, NotificationJobData } from "@hrms/queue";
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
// Silent jobs (see NotificationJobData.silent) persist nothing, so they have
// no DB row to dedupe a BullMQ retry against like the normal path does via
// jobId — this Redis marker stands in for that, long enough to outlast the
// queue's retry/backoff window.
const SILENT_JOB_DEDUPE_TTL_SECONDS = 60 * 60;

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

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// BullMQ fails a job without retrying when the thrown error is named
// "UnrecoverableError" — used for jobs no retry could ever deliver.
function permanentFailure(message: string): Error {
  const err = new Error(message);
  err.name = "UnrecoverableError";
  return err;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

interface ResolvedTargets {
  /** User IDs inside the job's tenant that will receive the notification. */
  userIds: string[];
  /** Targets that matched nobody in the tenant — reported, never dropped silently. */
  unresolved: string[];
}

// Turns a job's targets into user IDs belonging to the job's tenant. Runs
// inside runWithTenant, so every lookup carries the tenant filter
// (prismaWithTenant.user): an id or username from another organisation
// resolves to nobody rather than to that person.
async function resolveTargets(
  data: Pick<
    NotificationJobData,
    "recipients" | "pushTargets" | "targetUser" | "broadcast"
  >,
): Promise<ResolvedTargets> {
  if (data.broadcast?.scope === "tenant") {
    const users = await prismaWithTenant.user.findMany({
      select: { id: true },
    });
    return { userIds: users.map((u) => u.id), unresolved: [] };
  }

  const recipients = unique(data.recipients ?? []);
  if (recipients.length > 0) {
    const valid = recipients.filter((id) => OBJECT_ID.test(id));
    const users = valid.length
      ? await prismaWithTenant.user.findMany({
          where: { id: { in: valid } },
          select: { id: true },
        })
      : [];
    const found = new Set(users.map((u) => u.id));
    return {
      userIds: recipients.filter((id) => found.has(id)),
      unresolved: recipients.filter((id) => !found.has(id)),
    };
  }

  const pushTargets = data.pushTargets ?? [];
  const targetUser = data.targetUser;
  const names = unique(
    pushTargets.length > 0
      ? pushTargets
      : targetUser
        ? Array.isArray(targetUser)
          ? targetUser
          : [targetUser]
        : [],
  );
  if (names.length === 0) return { userIds: [], unresolved: [] };
  // Producers used to pass user IDs as targetUser; jobs enqueued before they
  // switched to `recipients` still carry them, so an ObjectId-shaped target
  // also matches by id (within the tenant, like any other lookup).
  const legacyIds = names.filter((n) => OBJECT_ID.test(n));
  const users = await prismaWithTenant.user.findMany({
    where: legacyIds.length
      ? { OR: [{ username: { in: names } }, { id: { in: legacyIds } }] }
      : { username: { in: names } },
    select: { id: true, username: true },
  });
  const matched = new Set(users.flatMap((u) => [u.id, u.username]));
  return {
    userIds: unique(users.map((u) => u.id)),
    unresolved: names.filter((n) => !matched.has(n)),
  };
}

// Who may receive REALTIME delivery (sockets) right now. Resolution
// above decides who a notification is FOR (and gets the in-app record, kept
// as history); delivery to devices goes only to people whose employment
// hasn't ended. Evaluated on every attempt — a retry, or a job that sat in
// the queue while the person was terminated, re-checks. Push has the same
// rule inside sendPushNotifications (send time). Runs in the job's tenant.
async function realtimeEligible(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await prismaWithTenant.user.findMany({
    where: {
      id: { in: userIds },
      employeeStatus: { notIn: [...BLOCKED_STATUSES] },
    },
    select: { id: true },
  });
  const ok = new Set(rows.map((r) => r.id));
  const kept = userIds.filter((id) => ok.has(id));
  if (kept.length < userIds.length) {
    logger.info(
      "notification: realtime delivery skipped for ineligible recipients",
      {
        skipped: userIds.length - kept.length,
      },
    );
  }
  return kept;
}

// A targeted job must reach at least one person in its tenant. Before, a job
// whose targets resolved to nobody fell back to every socket and every push
// token on the platform; now it fails (to the dead-letter queue) instead.
function assertDeliverable(
  job: Job<NotificationJobData>,
  targets: ResolvedTargets,
  broadcast: NotificationBroadcast | undefined,
): void {
  if (broadcast?.scope === "platform") return;
  if (targets.userIds.length === 0) {
    throw permanentFailure(
      `Notification job ${job.id}: no recipient in tenant ${job.data.tenantId}` +
        (targets.unresolved.length
          ? ` (unresolved: ${targets.unresolved.join(", ")})`
          : " (job named no recipients and requested no broadcast)"),
    );
  }
  if (targets.unresolved.length > 0) {
    logger.warn(
      `Notification job ${job.id}: ${targets.unresolved.length} target(s) not found in tenant ${job.data.tenantId}`,
      { unresolved: targets.unresolved },
    );
  }
}

function pushAudienceFor(
  tenantId: string,
  targets: ResolvedTargets,
  broadcast: NotificationBroadcast | undefined,
): PushAudience {
  return broadcast?.scope === "platform"
    ? {
        platformBroadcast: {
          tenantId,
          authorizedBy: broadcast.authorizedBy,
          reason: broadcast.reason,
        },
      }
    : { tenantId, userIds: targets.userIds };
}

/**
 * Consumes both notification queues: the current one, and the pre-fix
 * queue that producers on images built before the tenant-isolation fix
 * still write to (see NOTIFICATION_QUEUE_NAME in @hrms/queue for why they
 * are separate). Both run the same tenant-scoped processing. Returns both
 * workers (legacy first), so the caller can close them on shutdown.
 */
export function startNotificationWorker(): Worker[] {
  return [
    startQueueWorker(LEGACY_NOTIFICATION_QUEUE_NAME),
    startQueueWorker(NOTIFICATION_QUEUE_NAME),
  ];
}

/**
 * notify() seals a job's text and targets (BullMQ stores job data in Redis).
 * The worker reads an opened view; the job itself, which failed-job handling
 * copies to the dead-letter queue, stays sealed.
 */
function openedJob(job: Job<NotificationJobData>): Job<NotificationJobData> {
  const sealed = (job.data as { sealed?: string }).sealed;
  if (!sealed) return job;
  const data = {
    ...openTransient<NotificationJobData>(sealed),
    tenantId: job.data.tenantId,
    requestId: job.data.requestId,
  };
  return Object.create(job, { data: { value: data, enumerable: true } });
}

function startQueueWorker(queueName: string): Worker {
  const worker = new Worker<NotificationJobData>(
    queueName,
    (job) =>
      // Continue the correlation ID the producer attached (see
      // getNotificationQueue in @hrms/queue) so this worker's own log lines
      // can be traced back to the HTTP/gRPC request that enqueued the job —
      // closing the last leg of HTTP -> gRPC -> queue propagation.
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () =>
            processJob(openedJob(job)),
          )
        : processJob(openedJob(job)),
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
    // A permanent failure skips the remaining attempts, so it is final now.
    const final =
      err?.name === "UnrecoverableError" ||
      (job && job.attemptsMade >= (job.opts.attempts ?? 1));
    if (job && final) {
      getDeadLetterQueue()
        .add("failed-notification", {
          originalQueue: queueName,
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
    broadcast,
    eventType = "general",
    sendPushNotification = true,
    priority = "medium",
    socketEvent,
    socketPayload,
    silent = false,
    category,
  } = job.data;
  // Producers are trusted code, but a link becomes a navigation target in
  // the browser and a URL in a push payload — anything not a same-app path
  // is dropped rather than stored or sent.
  const link = safeAppLink(job.data.link);

  if (!tenantId) {
    // Every notification in this app belongs to a tenant. Writing it
    // without one used to silently fall back to the shared master DB
    // (prisma.notification.create with no tenant scoping) — refuse
    // instead, so a missing tenantId fails loudly at the producer.
    throw new Error(
      `Notification job ${job.id} is missing tenantId — refusing to process.`,
    );
  }

  if (broadcast?.scope === "platform") {
    try {
      assertPlatformBroadcastAuthorized({
        tenantId,
        authorizedBy: broadcast.authorizedBy,
        reason: broadcast.reason,
      });
    } catch (err) {
      throw permanentFailure(
        `Notification job ${job.id}: ${(err as Error).message}`,
      );
    }
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
    if (silent) {
      return processSilentJob(job, {
        recipients,
        pushTargets,
        targetUser,
        broadcast,
        title,
        message,
        eventType,
        sendPushNotification,
        socketEvent,
        socketPayload,
        link,
      });
    }

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

    // Resolve every target to a user of this tenant before writing
    // anything, so an undeliverable job fails without a stray row.
    const targets = await resolveTargets({
      recipients,
      pushTargets,
      targetUser,
      broadcast,
    });
    assertDeliverable(job, targets, broadcast);
    const resolvedRecipients = targets.userIds;

    // Persist notification to the tenant's own database
    const notification = await (prismaWithTenant.notification.create as any)({
      data: {
        tenantId,
        title,
        message,
        eventType,
        priority,
        timeStamp: new Date(),
        ...(link ? { link } : {}),
        ...(category ? { category } : {}),
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
    // sendToUser()/the socket registry are keyed by (tenantId, userId), not username —
    // resolvedRecipients above already is that userId list (either passed
    // directly as `recipients`, or resolved from pushTargets/targetUser),
    // so reuse it here instead of re-deriving anything from usernames.
    const wsPublisher = getNotificationPublisher();

    if (broadcast?.scope !== "platform") {
      const live = await realtimeEligible(resolvedRecipients);
      await Promise.all(
        live.map((userId) =>
          wsPublisher.sendToUser(userId, "notification", notification, {
            tenantId,
          }),
        ),
      );
      if (socketEvent) {
        await Promise.all(
          live.map((userId) =>
            wsPublisher.sendToUser(
              userId,
              socketEvent,
              socketPayload ?? notification,
              { tenantId },
            ),
          ),
        );
      }
    } else {
      // Authorized platform-wide broadcast (checked at the top of processJob).
      await wsPublisher.sendNotification(notification);
    }

    // FCM push notifications
    let fcmResult = { sentCount: 0, failedCount: 0, success: false };
    if (sendPushNotification) {
      // The same resolved, tenant-scoped people as the in-app delivery —
      // never "everyone" unless the job is an authorized platform broadcast.
      const result = await sendPushNotifications(
        pushAudienceFor(tenantId, targets, broadcast),
        title,
        message,
        { link },
      );

      fcmResult = {
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        success: result.success,
      };
    }

    logger.info(`Notification job ${job.id} processed`, {
      notificationId: notification.id,
      dbRecipients: resolvedRecipients.length,
      unresolvedTargets: targets.unresolved.length,
      fcmSent: fcmResult.sentCount,
    });

    return {
      success: true,
      notificationId: notification.id,
      dbRecipients: resolvedRecipients.length,
      unresolvedTargets: targets.unresolved,
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

async function processSilentJob(
  job: Job<NotificationJobData>,
  data: Required<
    Pick<
      NotificationJobData,
      | "recipients"
      | "pushTargets"
      | "title"
      | "message"
      | "eventType"
      | "sendPushNotification"
    >
  > &
    Pick<
      NotificationJobData,
      "targetUser" | "broadcast" | "socketEvent" | "socketPayload" | "link"
    >,
) {
  const {
    recipients,
    pushTargets,
    targetUser,
    broadcast,
    title,
    message,
    eventType,
    sendPushNotification,
    socketEvent,
    socketPayload,
    link,
  } = data;

  const dedupeKey = job.id ? `notification-job-done:${job.id}` : null;
  if (dedupeKey && (await getRedisClient().get(dedupeKey))) {
    logger.info(
      `Silent notification job ${job.id} already processed — skipping duplicate broadcast/push`,
      { deduped: true },
    );
    return {
      success: true,
      deduped: true,
      dbRecipients: 0,
      pushNotificationResult: { sentCount: 0, failedCount: 0, success: true },
    };
  }

  const targets = await resolveTargets({
    recipients,
    pushTargets,
    targetUser,
    broadcast,
  });
  assertDeliverable(job, targets, broadcast);
  const resolvedRecipients = targets.userIds;

  const wsPublisher = getNotificationPublisher();
  if (broadcast?.scope === "platform") {
    await wsPublisher.sendNotification({
      silent: true,
      eventType,
      title,
      message,
      timeStamp: new Date(),
    });
  } else {
    // Unpersisted payload on the same "notification" channel the bell
    // (useNotifications.tsx) and the Pending Approvals badge
    // (ApprovalsBadgeContext.tsx) both listen on. The badge refetches on
    // any message here; the bell recognizes `silent` and ignores it — this
    // event already has its own home in Pending Approvals and must not
    // also appear as a bell entry.
    const pingPayload = {
      silent: true,
      eventType,
      title,
      message,
      link,
      timeStamp: new Date(),
    };
    const live = await realtimeEligible(resolvedRecipients);
    await Promise.all(
      live.map((userId) =>
        wsPublisher.sendToUser(userId, "notification", pingPayload, {
          tenantId: job.data.tenantId ?? null,
        }),
      ),
    );
    if (socketEvent) {
      await Promise.all(
        live.map((userId) =>
          wsPublisher.sendToUser(
            userId,
            socketEvent,
            socketPayload ?? pingPayload,
            { tenantId: job.data.tenantId ?? null },
          ),
        ),
      );
    }
  }

  let fcmResult = { sentCount: 0, failedCount: 0, success: false };
  if (sendPushNotification) {
    const result = await sendPushNotifications(
      pushAudienceFor(job.data.tenantId, targets, broadcast),
      title,
      message,
      { link },
    );
    fcmResult = {
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      success: result.success,
    };
  }

  if (dedupeKey) {
    await getRedisClient().set(
      dedupeKey,
      "1",
      "EX",
      SILENT_JOB_DEDUPE_TTL_SECONDS,
    );
  }

  logger.info(`Silent notification job ${job.id} processed`, {
    dbRecipients: 0,
    unresolvedTargets: targets.unresolved.length,
    fcmSent: fcmResult.sentCount,
  });

  return {
    success: true,
    dbRecipients: 0,
    unresolvedTargets: targets.unresolved,
    pushNotificationResult: fcmResult,
  };
}
