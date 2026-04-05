import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

export async function updateExpiredJobOpenings(): Promise<void> {
  try {
    const result = await prisma.jobOpening.updateMany({
      where: {
        status: "Active",
        applicationDeadline: { lt: new Date() },
      },
      data: {
        status: "Expired",
        lastUpdateBy: "System",
        lastUpdatedOn: new Date(),
      },
    });

    logger.info(
      `updateExpiredJobOpenings: marked ${result.count} job openings as Expired`,
    );
  } catch (error) {
    logger.error("Error in Job Opening expiry job:", { error });
    throw error;
  }
}
