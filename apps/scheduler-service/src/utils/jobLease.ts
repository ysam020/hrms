import os from "os";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import type { SchedulerJobName } from "@hrms/queue";

// At-most-once-per-period execution for cron jobs, coordinated through the
// shared master database rather than Redis.
//
// Every scheduler that can reach the database fires the same crons: the
// production scheduler and, because local dev points at the same Atlas
// cluster, any local docker stack too (each with its own Redis, so BullMQ's
// own locking can't see the other). Two concurrent runs of a non-idempotent
// job duplicate its writes — the 2026-07-09 attendance incident was two
// concurrent backfills (docs/performance/attendance-backfill-root-cause.md),
// and the 2026-10-31 month-end accrual was executed by a local scheduler.
//
// The lease is a document in `scheduler_job_leases` whose _id encodes the
// job and its period; MongoDB's built-in unique _id makes the insert the
// atomic "claim", so no extra index is needed.

const COLLECTION = "scheduler_job_leases";

export type LeasePeriod = "month" | "day" | "fireMinute";

// Jobs whose effect must not repeat within a calendar period, whatever
// triggered the second run (another scheduler, a retry, a manual re-run).
// Everything else is leased per cron fire time.
const PERIOD_BY_JOB: Partial<Record<SchedulerJobName, LeasePeriod>> = {
  updateLeaveBalance: "month", // monthly accrual — a second run double-credits
  reconcileAttendance: "day",
};

// A "running" lease older than this is treated as abandoned (crashed holder)
// and may be taken over. Comfortably above the slowest job's runtime.
export const STALE_LEASE_MS = 2 * 60 * 60 * 1000;

const TZ = process.env.TZ || "Asia/Kolkata";

function periodKey(period: LeasePeriod, fireAt: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fireAt)
      .map((p) => [p.type, p.value]),
  );
  const month = `${parts.year}-${parts.month}`;
  if (period === "month") return month;
  const day = `${month}-${parts.day}`;
  if (period === "day") return day;
  return `${day}T${parts.hour}:${parts.minute}`;
}

export function leaseIdFor(jobName: SchedulerJobName, fireAt: Date): string {
  return `${jobName}:${periodKey(PERIOD_BY_JOB[jobName] ?? "fireMinute", fireAt)}`;
}

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; meta?: any };
  return (
    e?.code === 11000 ||
    e?.meta?.code === "11000" ||
    /E11000|duplicate key/i.test(String(e?.message ?? ""))
  );
}

const holder = () => `${os.hostname()}:${process.pid}`;

/**
 * Claims the lease. true → this process should run the job; false → another
 * scheduler already ran it (or is running it) for this period.
 */
export async function acquireJobLease(
  leaseId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    // A duplicate _id comes back as ok:1 with writeErrors (the insert
    // *command* succeeded), not as a thrown error — handle both shapes.
    const res: any = await prisma.$runCommandRaw({
      insert: COLLECTION,
      documents: [
        {
          _id: leaseId,
          status: "running",
          holder: holder(),
          startedAt: { $date: now.toISOString() },
          attempts: 1,
        },
      ],
    });
    const writeErr = res?.writeErrors?.[0];
    if (!writeErr) return true;
    if (!isDuplicateKey(writeErr)) {
      throw new Error(
        `jobLease: insert failed: ${writeErr.errmsg ?? writeErr.code}`,
      );
    }
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }

  // Exists: take over only a failed run (retry) or an abandoned one.
  const staleBefore = new Date(now.getTime() - STALE_LEASE_MS);
  const res: any = await prisma.$runCommandRaw({
    findAndModify: COLLECTION,
    query: {
      _id: leaseId,
      $or: [
        { status: "failed" },
        {
          status: "running",
          startedAt: { $lt: { $date: staleBefore.toISOString() } },
        },
      ],
    },
    update: {
      $set: {
        status: "running",
        holder: holder(),
        startedAt: { $date: now.toISOString() },
      },
      $inc: { attempts: 1 },
    },
    new: true,
  });
  return Boolean(res?.value);
}

export async function releaseJobLease(
  leaseId: string,
  outcome: "done" | "failed",
  detail?: string,
): Promise<void> {
  try {
    await prisma.$runCommandRaw({
      update: COLLECTION,
      updates: [
        {
          q: { _id: leaseId, holder: holder() },
          u: {
            $set: {
              status: outcome,
              finishedAt: { $date: new Date().toISOString() },
              ...(detail ? { detail: detail.slice(0, 500) } : {}),
            },
          },
        },
      ],
    });
  } catch (err) {
    // A failed release leaves the lease "running" until it goes stale —
    // safe (no double run), just delays a retry.
    logger.warn(`jobLease: could not release ${leaseId}`, { err });
  }
}
