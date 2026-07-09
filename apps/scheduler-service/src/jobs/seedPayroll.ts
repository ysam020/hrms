import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { isLocalDevEnvironment } from "../utils/devSeedGuard";
import { faker } from "../utils/fakeData";

/**
 * Dev-only demo-data generator: keeps each active employee's salary baseline
 * (User.salaryBasicPay/Hra/Conveyance/Pf/Esi/Pt + a matching SalaryStructure
 * row for the current month) topped up as months roll forward, so
 * apps/api-gateway's real payroll-run/salary-slip flows always have
 * something to prorate by attendance.
 *
 * Deliberately does NOT insert a PayrollRun/PayrollLineItem itself — that's
 * the real `initiatePayrollRun` handler's job (apps/api-gateway), and a
 * @@unique([tenantId, month, year]) constraint means a fake seeded run here
 * would permanently block a real one for that month. No-ops entirely outside
 * local dev.
 */
async function seedTenantSalaryBaseline(tenantId: string): Promise<boolean> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const employees = await (prismaWithTenant as any).user.findMany({
    where: { tenantId, employeeStatus: "Active" },
    select: { id: true, salary: true, salaryBasicPay: true },
  });
  if (employees.length === 0) return false;

  let seededAny = false;
  for (const employee of employees) {
    const salary =
      employee.salary ?? faker.number.int({ min: 30000, max: 150000 });
    const basicPay = Math.round(salary * 0.5);
    const hra = Math.round(salary * 0.25);
    const conveyance = salary - basicPay - hra;
    const pf = Math.round(basicPay * 0.12);
    const esi = 0;
    const pt = 200;

    if (employee.salaryBasicPay == null) {
      await (prismaWithTenant as any).user.update({
        where: { id: employee.id },
        data: {
          salaryBasicPay: basicPay,
          salaryHra: hra,
          salaryConveyance: conveyance,
          salaryPf: pf,
          salaryEsi: esi,
          salaryPt: pt,
        },
      });
    }

    const existingStructure = await (
      prismaWithTenant as any
    ).salaryStructure.findFirst({
      where: { tenantId, userId: employee.id, month, year },
      select: { id: true },
    });
    if (existingStructure) continue;

    const grossEarnings = basicPay + hra + conveyance;
    await (prismaWithTenant as any).salaryStructure.create({
      data: {
        tenantId,
        userId: employee.id,
        grossSalary: grossEarnings,
        month,
        year,
        basicPay,
        hra,
        conveyance,
        pf,
        esi,
        pt,
        grossEarnings,
        netPayable: grossEarnings - pf - pt,
      },
    });
    seededAny = true;
  }

  return seededAny;
}

export async function seedPayroll(): Promise<void> {
  if (!isLocalDevEnvironment()) {
    logger.info("seedPayroll: not local dev — skipping");
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, dbName: true },
  });

  let seeded = 0;
  let errors = 0;
  for (const tenant of tenants) {
    if (!tenant.dbName) continue;
    const tenantClient = getClientForDb(tenant.dbName);
    try {
      await runWithTenant(tenant.id, tenantClient, async () => {
        if (await seedTenantSalaryBaseline(tenant.id)) seeded++;
      });
    } catch (err) {
      errors++;
      logger.error(`seedPayroll: error seeding tenant ${tenant.id}`, { err });
    }
  }

  logger.info(
    `seedPayroll: topped up salary baseline for ${seeded}/${tenants.length} tenants (${errors} errors)`,
  );
}
