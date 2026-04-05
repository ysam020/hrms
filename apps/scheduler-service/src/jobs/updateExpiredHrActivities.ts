import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

export async function updateExpiredHrActivities(): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];

    const result = await prisma.hrActivity.updateMany({
      where: {
        status: "Active",
        date: { lt: today },
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
