import { prismaWithTenant } from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";
import { cacheManager } from "@hrms/cache";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { forEachActiveTenant } from "../utils/forEachTenant";
import {
  logBacklogRun,
  planBacklogNotifications,
} from "../utils/backlogNotifications";

dayjs.extend(utc);

const OBJECT_ID = /^[a-f0-9]{24}$/i;

async function expireForTenant(tenantId: string): Promise<number> {
  const now = dayjs.utc().toDate();

  // updateMany doesn't return the affected docs, so find them first —
  // we need each one's createdBy/title to notify its owner.
  const due = await prismaWithTenant.hrActivity.findMany({
    where: {
      status: "Active",
      scheduledAt: { lt: now },
    },
    select: { id: true, title: true, createdBy: true, scheduledAt: true },
  });

  // Activities that lapsed long ago (e.g. while this job was broken) expire
  // without notifying; deferred ones are left for the next run.
  const plan = await planBacklogNotifications(
    "updateExpiredHrActivities",
    tenantId,
    due,
    (a) => a.scheduledAt,
    now,
  );
  // Planned even when nothing is due, so the owed list is cleared.
  if (due.length === 0) return 0;
  const expire = (where: Record<string, unknown>) =>
    prismaWithTenant.hrActivity.updateMany({
      // Repeats the read's condition: an activity completed or rescheduled
      // since the read above is not overwritten or notified.
      where: { ...where, status: "Active", scheduledAt: { lt: now } },
      data: {
        status: "Expired",
        lastUpdatedBy: "System",
        lastUpdatedOn: new Date(),
      },
    });

  const silent = plan.silent.length
    ? await expire({ id: { in: plan.silent.map((a) => a.id) } })
    : { count: 0 };
  const expiredNow = await Promise.all(
    plan.notify.map(async (activity) =>
      (await expire({ id: activity.id })).count > 0 ? activity : null,
    ),
  );
  const toNotify = expiredNow.filter(
    (a): a is (typeof plan.notify)[number] => a !== null,
  );
  const expiredCount = silent.count + toNotify.length;

  if (expiredCount > 0) {
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:hrActivities:*`),
      cacheManager.invalidatePattern(`t:${tenantId}:hrm:activities:*`),
    ]);
  }

  const outcomes = await Promise.all(
    toNotify.map(async (activity) => {
      // createdBy is a user id; anything else (older rows) has no owner to notify.
      if (!OBJECT_ID.test(activity.createdBy ?? "")) return false;
      try {
        // Scoped to this tenant by prismaWithTenant.
        const owner = await prismaWithTenant.user.findUnique({
          where: { id: activity.createdBy },
          select: { id: true },
        });
        if (!owner) return false;
        await notify({
          tenantId,
          event: "hrActivityExpired",
          link: "/hr-activities",
          category: "announcements",
          recipients: [owner.id],
          inApp: {
            title: "HR Activity expired",
            message: `Activity "${activity.title}" has expired without being completed.`,
            eventType: "hr_activity_notification",
            priority: "medium",
          },
        });
        return true;
      } catch (err) {
        logger.warn(
          `updateExpiredHrActivities: notify failed for activity ${activity.id}`,
          { err },
        );
        return false;
      }
    }),
  );
  const notified = outcomes.filter(Boolean).length;
  logBacklogRun("updateExpiredHrActivities", tenantId, {
    examined: due.length,
    silentlyUpdated: silent.count,
    alreadyChanged:
      plan.silent.length - silent.count + plan.notify.length - toNotify.length,
    notified,
    deferred: plan.deferred.length,
    notNotified: toNotify.length - notified,
  });
  return expiredCount;
}

export async function updateExpiredHrActivities(): Promise<void> {
  let expired = 0;
  try {
    // HR activities live in each tenant's own database.
    await forEachActiveTenant("updateExpiredHrActivities", async (tenantId) => {
      expired += await expireForTenant(tenantId);
    });
  } catch (error) {
    logger.error("Error in HR Activity expiry job:", { error });
    throw error;
  } finally {
    logger.info(
      `updateExpiredHrActivities: marked ${expired} activities as Expired`,
    );
  }
}
