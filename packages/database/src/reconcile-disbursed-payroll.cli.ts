/**
 * Runs the read-only payroll reconciliation over every tenant database.
 *
 *   node reconcile-disbursed-payroll.cli.js --details=/private/path.json
 *
 * Prints aggregates only. Per-employee rows, which are derived from pay, go
 * to the --details file (mode 0600) and are anonymised. Tenants are labelled
 * Tenant-1, Tenant-2, ... Requires explicit authorization to run against
 * production.
 */
import { writeFileSync } from "node:fs";
import { loadSecrets } from "@hrms/common";

async function main() {
  if (!process.env.DEV_MONGODB_URI) await loadSecrets("hrms/config");
  const { prisma } = await import("./prismaClient");
  const { getClientForDb } = await import("./tenantClientPool");
  const { reconcileTenant, createAnonymiser } =
    await import("./reconcile-disbursed-payroll");

  const details = process.argv
    .find((a) => a.startsWith("--details="))
    ?.split("=")[1];
  const anonymise = createAnonymiser();
  const tenants = await prisma.tenant.findMany({
    where: { dbName: { not: null } },
    select: { id: true, dbName: true },
  });

  const summaries = [];
  const rows = [];
  let n = 0;
  for (const tenant of tenants) {
    const label = `Tenant-${++n}`;
    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, joining_date: true },
    });
    const result = await reconcileTenant(
      getClientForDb(tenant.dbName!),
      label,
      new Map(users.map((u) => [u.id, u.joining_date])),
      anonymise,
    );
    if (result.summary.runs.length === 0) continue;
    summaries.push(result.summary);
    rows.push(...result.rows);
  }

  console.log(JSON.stringify(summaries, null, 2));
  if (details) {
    writeFileSync(details, JSON.stringify(rows, null, 2), { mode: 0o600 });
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("reconcile-disbursed-payroll failed:", (err as Error).name);
  process.exit(1);
});
