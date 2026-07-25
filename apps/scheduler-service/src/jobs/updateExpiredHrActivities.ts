import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export async function updateExpiredHrActivities(): Promise<void> {
  try {
    const now = dayjs.utc().toDate();

    // updateMany doesn't return the affected docs, so find them first —
    // we need each one's tenantId/createdBy/title to notify its owner.
    const expiring = await prisma.hrActivity.findMany({
      where: {
        status: "Active",
        scheduledAt: { lt: now },
      },
      select: { id: true, tenantId: true, title: true, createdBy: true },
    });
    if (expiring.length === 0) return;

    const result = await prisma.hrActivity.updateMany({
      where: { id: { in: expiring.map((a) => a.id) } },
      data: {
        status: "Expired",
        lastUpdatedBy: "System",
        lastUpdatedOn: new Date(),
      },
    });

    logger.info(
      `updateExpiredHrActivities: marked ${result.count} activities as Expired`,
    );

    await Promise.all(
      expiring.map(async (activity) => {
        if (!activity.tenantId || !activity.createdBy) return;
        try {
          const owner = await prisma.user.findUnique({
            where: { id: activity.createdBy },
            select: { id: true, username: true },
          });
          if (!owner) return;
          await notify({
            tenantId: activity.tenantId,
            event: "hrActivityExpired",
            recipients: [owner.id],
            pushTargets: [owner.username],
            inApp: {
              title: "HR Activity expired",
              message: `Activity "${activity.title}" has expired without being completed.`,
              eventType: "hr_activity_notification",
              priority: "medium",
            },
          });
        } catch (err) {
          logger.warn(
            `updateExpiredHrActivities: notify failed for activity ${activity.id}`,
            { err },
          );
        }
      }),
    );
  } catch (error) {
    logger.error("Error in HR Activity expiry job:", { error });
    throw error;
  }
}
