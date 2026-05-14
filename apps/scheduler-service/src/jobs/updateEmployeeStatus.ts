import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export async function updateEmployeeStatus(): Promise<void> {
  try {
    const yesterdayStart = dayjs
      .utc()
      .subtract(1, "day")
      .startOf("day")
      .toDate();
    const todayStart = dayjs.utc().startOf("day").toDate();

    const resignations = await prisma.resignation.findMany({
      where: {
        lastWorkingDay: { gte: yesterdayStart, lt: todayStart },
      },
    });

    if (resignations.length === 0) {
      logger.info("updateEmployeeStatus: no resignations to process");
      return;
    }

    for (const resignation of resignations) {
      if (!resignation.userId) continue;

      await prisma.user.update({
        where: { id: resignation.userId },
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
