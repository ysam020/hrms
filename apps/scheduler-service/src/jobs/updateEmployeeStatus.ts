import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

async function processTenantResignations(
  yesterdayStart: Date,
  todayStart: Date,
): Promise<number> {
  const resignations = await (prismaWithTenant as any).resignation.findMany({
    where: {
      lastWorkingDay: { gte: yesterdayStart, lt: todayStart },
    },
  });

  for (const resignation of resignations) {
    if (!resignation.userId) continue;

    await (prismaWithTenant as any).user.update({
      where: { id: resignation.userId },
      data: { employeeStatus: "Resigned" },
    });
  }

  return resignations.length;
}

export async function updateEmployeeStatus(): Promise<void> {
  try {
    const yesterdayStart = dayjs
      .utc()
      .subtract(1, "day")
      .startOf("day")
      .toDate();
    const todayStart = dayjs.utc().startOf("day").toDate();

    // Resignation is a business model: it lives in each tenant's own
    // physical DB once provisioned (Tenant.dbName), and falls back to the
    // shared master DB otherwise. Querying the master `prisma` singleton
    // directly (the previous implementation) silently finds nothing for any
    // tenant that has been migrated to a dedicated DB — iterate tenants
    // explicitly instead, same pattern as updateLeaveBalance.ts.
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, dbName: true },
    });

    let updated = 0;
    let errors = 0;
    for (const tenant of tenants) {
      const tenantClient = tenant.dbName ? getClientForDb(tenant.dbName) : null;
      try {
        await runWithTenant(tenant.id, tenantClient, async () => {
          updated += await processTenantResignations(
            yesterdayStart,
            todayStart,
          );
        });
      } catch (err) {
        errors++;
        logger.error(
          `updateEmployeeStatus: error processing tenant ${tenant.id}`,
          { err },
        );
      }
    }

    logger.info(
      `updateEmployeeStatus: updated ${updated} employees to Resigned across ${tenants.length} tenants (${errors} errors)`,
    );
  } catch (error) {
    logger.error("Error updating employee statuses:", { error });
    throw error;
  }
}
