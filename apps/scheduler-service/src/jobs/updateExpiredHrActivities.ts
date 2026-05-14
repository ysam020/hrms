import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export async function updateExpiredHrActivities(): Promise<void> {
  try {
    const now = dayjs.utc().toDate();

    const result = await prisma.hrActivity.updateMany({
      where: {
        status: "Active",
        scheduledAt: { lt: now },
      },
      data: {
        status: "Expired",
        lastUpdatedBy: "System",
        lastUpdatedOn: new Date(),
      },
    });

    logger.info(
      `updateExpiredHrActivities: marked ${result.count} activities as Expired`,
    );
  } catch (error) {
    logger.error("Error in HR Activity expiry job:", { error });
    throw error;
  }
}
