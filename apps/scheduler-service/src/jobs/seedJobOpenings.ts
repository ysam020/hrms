import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { isLocalDevEnvironment } from "../utils/devSeedGuard";
import {
  DEPARTMENTS,
  DESIGNATIONS_BY_DEPT,
  faker,
  randomItem,
} from "../utils/fakeData";

/**
 * Dev-only demo-data generator: twice a month, inserts a fake JobOpening (and
 * a couple of applications against it) per tenant. No-ops entirely outside
 * local dev.
 */
async function seedTenantJobOpenings(tenantId: string): Promise<number> {
  const openingCount = faker.number.int({ min: 1, max: 2 });
  for (let i = 0; i < openingCount; i++) {
    const department = randomItem(DEPARTMENTS);
    const opening = await (prismaWithTenant as any).jobOpening.create({
      data: {
        tenantId,
        jobTitle: `${randomItem(DESIGNATIONS_BY_DEPT[department])} - ${faker.string.alphanumeric(4)}`,
        numberOfVacancies: faker.number.int({ min: 1, max: 3 }),
        applicationDeadline: faker.date.future({ years: 0.25 }),
        jobDescription: faker.lorem.paragraph(),
        requiredSkills: faker.lorem.words(5),
        experience: faker.number.int({ min: 0, max: 8 }),
        budget: [
          faker.number.int({ min: 30000, max: 60000 }),
          faker.number.int({ min: 60000, max: 120000 }),
        ],
        department,
        hiringManager: "seed-script",
        status: "Open",
        createdBy: "seed-script",
      },
    });

    const applicationCount = faker.number.int({ min: 0, max: 2 });
    for (let j = 0; j < applicationCount; j++) {
      await (prismaWithTenant as any).jobApplication.create({
        data: {
          tenantId,
          jobTitleId: opening.id,
          name: faker.person.fullName(),
          email: faker.internet.email().toLowerCase(),
          mobile: faker.string.numeric(10),
          status: "Applied",
        },
      });
    }
  }
  return openingCount;
}

export async function seedJobOpenings(): Promise<void> {
  if (!isLocalDevEnvironment()) {
    logger.info("seedJobOpenings: not local dev — skipping");
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
        created += await seedTenantJobOpenings(tenant.id);
      });
    } catch (err) {
      errors++;
      logger.error(`seedJobOpenings: error seeding tenant ${tenant.id}`, {
        err,
      });
    }
  }

  logger.info(
    `seedJobOpenings: created ${created} openings across ${tenants.length} tenants (${errors} errors)`,
  );
}
