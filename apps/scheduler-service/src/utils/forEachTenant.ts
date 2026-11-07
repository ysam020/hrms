import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
import { logger } from "@hrms/logger";

export interface TenantFailure {
  tenantId: string;
  error: string;
}

// Raised after every tenant has been attempted, so one tenant's failure
// neither hides the others' nor goes unreported: the scheduler worker logs
// it and the job lease is recorded as failed.
export class TenantJobError extends Error {
  constructor(
    jobName: string,
    readonly failures: TenantFailure[],
    readonly tenantCount: number,
  ) {
    super(
      `${jobName}: ${failures.length} of ${tenantCount} tenant(s) failed — ` +
        failures.map((f) => `${f.tenantId}: ${f.error}`).join("; "),
    );
    this.name = "TenantJobError";
  }
}

/**
 * Runs `fn` once per active tenant, bound to that tenant's own database.
 * Business models (tickets, HR activities, job openings, …) live only in
 * tenant databases, so a job that queries the master client instead finds
 * nothing. A tenant without a database is reported as a failure, never
 * skipped silently or served from the master database.
 */
export async function forEachActiveTenant(
  jobName: string,
  fn: (tenantId: string) => Promise<void>,
): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, dbName: true },
  });

  const failures: TenantFailure[] = [];
  for (const tenant of tenants) {
    if (!tenant.dbName) {
      failures.push({ tenantId: tenant.id, error: "no tenant database" });
      logger.error(`${jobName}: tenant ${tenant.id} has no database`);
      continue;
    }
    try {
      await runWithTenant(tenant.id, getClientForDb(tenant.dbName), () =>
        fn(tenant.id),
      );
    } catch (err) {
      failures.push({
        tenantId: tenant.id,
        error: String((err as Error)?.message ?? err),
      });
      logger.error(`${jobName}: error processing tenant ${tenant.id}`, { err });
    }
  }

  if (failures.length > 0) {
    throw new TenantJobError(jobName, failures, tenants.length);
  }
}
