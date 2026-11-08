import { getRedisClient } from "@hrms/cache";
import { logger } from "@hrms/logger";

// Scheduler jobs that notify people about records they change. Their first
// run after the tenant-database fix finds every record that went overdue
// while they were broken; without a limit each one would become a
// notification and a push.
export type BacklogJobName = "checkTicketSla" | "updateExpiredHrActivities";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_CAP_PER_TENANT = 100;
// Deferred records are re-recorded on every run, so this only has to
// outlast the gap between runs; it bounds what a stopped scheduler leaves.
const OWED_TTL_SECONDS = 14 * 24 * 60 * 60;

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (Number.isInteger(value) && value > 0) return value;
  logger.warn(`${name}="${raw}" is not a positive integer — using ${fallback}`);
  return fallback;
}

/**
 * Only records that became due within SCHEDULER_NOTIFY_WINDOW_HOURS (default
 * 48) notify anyone, and at most SCHEDULER_NOTIFY_CAP_PER_TENANT (default
 * 100) per tenant per run.
 */
export function backlogNotificationSettings(): {
  windowMs: number;
  capPerTenant: number;
} {
  return {
    windowMs:
      positiveInteger("SCHEDULER_NOTIFY_WINDOW_HOURS", DEFAULT_WINDOW_HOURS) *
      HOUR_MS,
    capPerTenant: positiveInteger(
      "SCHEDULER_NOTIFY_CAP_PER_TENANT",
      DEFAULT_CAP_PER_TENANT,
    ),
  };
}

// Per job and tenant, so one tenant's deferrals never affect another's.
const owedKey = (job: BacklogJobName, tenantId: string) =>
  `scheduler:notify-owed:${job}:${tenantId}`;

export interface BacklogPlan<T> {
  /** Change and notify. */
  notify: T[];
  /** Change without notifying: became due before the window. */
  silent: T[];
  /** Leave unchanged this run: within the window but over the cap. */
  deferred: T[];
}

/**
 * Splits one tenant's due records into those to notify about, those to
 * change silently, and those to defer.
 *
 * A deferred record must not be changed by the caller, so the next run
 * finds it again. It is recorded as still owed a notification, so it
 * stays eligible on that run even if it has aged out of the window by
 * then. Owed records go first, then the oldest.
 */
export async function planBacklogNotifications<T extends { id: string }>(
  job: BacklogJobName,
  tenantId: string,
  records: T[],
  dueAt: (record: T) => Date | null | undefined,
  now: Date = new Date(),
): Promise<BacklogPlan<T>> {
  const { windowMs, capPerTenant } = backlogNotificationSettings();
  const redis = getRedisClient();
  const key = owedKey(job, tenantId);
  const owed = new Set(await redis.smembers(key));
  const since = now.getTime() - windowMs;

  const time = (r: T) => dueAt(r)?.getTime() ?? 0;
  const eligible: T[] = [];
  const silent: T[] = [];
  for (const record of records) {
    if (owed.has(record.id) || time(record) >= since) eligible.push(record);
    else silent.push(record);
  }
  eligible.sort(
    (a, b) =>
      Number(owed.has(b.id)) - Number(owed.has(a.id)) || time(a) - time(b),
  );
  const notify = eligible.slice(0, capPerTenant);
  const deferred = eligible.slice(capPerTenant);

  // Written before the caller changes anything, and replaces the previous
  // set: records no longer due (resolved, completed) drop out of it.
  const write = redis.multi().del(key);
  if (deferred.length > 0) {
    write.sadd(key, ...deferred.map((r) => r.id)).expire(key, OWED_TTL_SECONDS);
  }
  await write.exec();

  return { notify, silent, deferred };
}

/**
 * For a single record handled outside a sweep (a per-ticket SLA job): due
 * within the window, or owed from a sweep that deferred it.
 */
export async function isNotificationDue(
  job: BacklogJobName,
  tenantId: string,
  id: string,
  dueAt: Date | null | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  const { windowMs } = backlogNotificationSettings();
  if ((dueAt?.getTime() ?? 0) >= now.getTime() - windowMs) return true;
  return (await getRedisClient().sismember(owedKey(job, tenantId), id)) === 1;
}

export interface BacklogRunCounts {
  examined: number;
  /** Changed without a notification (became due before the window). */
  silentlyUpdated: number;
  /** Selected, but changed by someone else (or another run) before the write. */
  alreadyChanged: number;
  notified: number;
  deferred: number;
  /** Selected to notify but not notified: nobody in the tenant to notify, or the enqueue failed (logged). */
  notNotified: number;
}

export function logBacklogRun(
  job: BacklogJobName,
  tenantId: string,
  counts: BacklogRunCounts,
): void {
  const line = `${job}: tenant ${tenantId} — examined ${counts.examined}, silently updated ${counts.silentlyUpdated}, already changed ${counts.alreadyChanged}, notified ${counts.notified}, deferred ${counts.deferred}, not notified ${counts.notNotified}`;
  if (counts.deferred > 0) logger.warn(line, { tenantId, ...counts });
  else logger.info(line, { tenantId, ...counts });
}
