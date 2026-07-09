import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { isLocalDevEnvironment } from "../utils/devSeedGuard";
import { HR_ACTIVITY_TITLES, faker, randomItem } from "../utils/fakeData";

/**
 * Dev-only demo-data generator: twice a month, inserts a couple of fake
 * HrActivity rows per tenant. No-ops entirely outside local dev.
 */
async function seedTenantHrActivities(tenantId: string): Promise<number> {
  const count = faker.number.int({ min: 1, max: 3 });
  for (let i = 0; i < count; i++) {
    await (prismaWithTenant as any).hrActivity.create({
      data: {
        tenantId,
        title: randomItem(HR_ACTIVITY_TITLES),
        description: faker.lorem.sentence(),
        scheduledAt: faker.date.soon({ days: 14 }),
        status: "Scheduled",
        createdBy: "seed-script",
      },
    });
  }
  return count;
}

export async function seedHrActivities(): Promise<void> {
  if (!isLocalDevEnvironment()) {
    logger.info("seedHrActivities: not local dev — skipping");
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
        created += await seedTenantHrActivities(tenant.id);
      });
    } catch (err) {
      errors++;
      logger.error(`seedHrActivities: error seeding tenant ${tenant.id}`, {
        err,
      });
    }
  }

  logger.info(
    `seedHrActivities: created ${created} activities across ${tenants.length} tenants (${errors} errors)`,
  );
}
