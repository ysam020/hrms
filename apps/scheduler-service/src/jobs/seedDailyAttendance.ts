import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { isLocalDevEnvironment } from "../utils/devSeedGuard";
import { LEAVE_TYPES, randomItem } from "../utils/fakeData";

/**
 * Dev-only demo-data generator: for every active employee with no
 * AttendanceRecord for today yet, randomly marks them present/late or puts
 * them on an approved leave for the day — so seeded dev tenants keep
 * accumulating realistic attendance history without manual upkeep. No-ops
 * entirely outside local dev (see isLocalDevEnvironment).
 */
async function seedTenantAttendance(tenantId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = await (prismaWithTenant as any).user.findMany({
    where: { tenantId, employeeStatus: "Active" },
    select: { id: true },
  });

  let created = 0;
  for (const employee of employees) {
    const existingAttendance = await (
      prismaWithTenant as any
    ).attendanceRecord.findFirst({
      where: { tenantId, userId: employee.id, date: today },
      select: { id: true },
    });
    if (existingAttendance) continue;

    const existingLeave = await (
      prismaWithTenant as any
    ).leaveApplication.findFirst({
      where: {
        tenantId,
        userId: employee.id,
        status: { in: ["Pending", "Approved"] },
        from: { lte: today },
        to: { gte: today },
      },
      select: { id: true },
    });
    if (existingLeave) continue;

    const roll = Math.random();
    if (roll < 0.08) {
      await (prismaWithTenant as any).leaveApplication.create({
        data: {
          tenantId,
          userId: employee.id,
          from: today,
          to: today,
          leaveType: randomItem(LEAVE_TYPES),
          days: 1,
          status: "Approved",
          unit: "full_day",
          appliedOn: today,
          approvedOn: today,
        },
      });
    } else {
      const late = roll > 0.85;
      const timeIn = new Date(today);
      timeIn.setHours(late ? 10 : 9, Math.floor(Math.random() * 45), 0, 0);

      await (prismaWithTenant as any).attendanceRecord.create({
        data: {
          tenantId,
          userId: employee.id,
          date: today,
          timeIn,
          status: late ? "Late" : "Present",
        },
      });
    }
    created++;
  }

  return created;
}

export async function seedDailyAttendance(): Promise<void> {
  if (!isLocalDevEnvironment()) {
    logger.info("seedDailyAttendance: not local dev — skipping");
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, dbName: true },
  });

  let created = 0;
  let errors = 0;
  for (const tenant of tenants) {
    if (!tenant.dbName) continue;
    const tenantClient = getClientForDb(tenant.dbName);
    try {
      await runWithTenant(tenant.id, tenantClient, async () => {
        created += await seedTenantAttendance(tenant.id);
      });
    } catch (err) {
      errors++;
      logger.error(`seedDailyAttendance: error seeding tenant ${tenant.id}`, {
        err,
      });
    }
  }

  logger.info(
    `seedDailyAttendance: created ${created} records across ${tenants.length} tenants (${errors} errors)`,
  );
}
