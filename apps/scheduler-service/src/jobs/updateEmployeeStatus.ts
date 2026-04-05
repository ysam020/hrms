import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

export async function updateEmployeeStatus(): Promise<void> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const resignations = await prisma.resignation.findMany({
      where: { lastDate: yesterdayStr },
    });

    if (resignations.length === 0) {
      logger.info("updateEmployeeStatus: no resignations to process");
      return;
    }

    for (const resignation of resignations) {
      if (!resignation.username) continue;

      await prisma.user.updateMany({
        where: { username: resignation.username },
        data: { employeeStatus: "Resigned" },
      });
    }

    logger.info(
      `updateEmployeeStatus: updated ${resignations.length} employees to Resigned`,
    );
  } catch (error) {
    logger.error("Error updating employee statuses:", { error });
    throw error;
  }
}
