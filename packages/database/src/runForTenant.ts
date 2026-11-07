import { prisma } from "./prismaClient";
import { runWithTenant, type AuditActor } from "./tenantContext";
import { getClientForDb } from "./tenantClientPool";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// Thrown when work that needs a tenant cannot be bound to one: no tenantId,
// a malformed one, an unknown tenant, or a tenant without its own database.
// Retrying can't fix any of these, so queue workers treat it as permanent.
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

/**
 * Runs `fn` bound to `tenantId`'s own database — the single entry point for
 * work that starts outside an HTTP request (queue jobs, scheduler jobs).
 * Background code used to call the master `prisma` client directly, which
 * holds no business data once tenants have their own databases, so those
 * jobs silently matched nothing. This refuses instead of falling back.
 */
export async function runForTenant<T>(
  tenantId: string | null | undefined,
  fn: () => Promise<T>,
  actor?: AuditActor,
): Promise<T> {
  if (!tenantId) {
    throw new TenantContextError("No tenantId supplied for tenant-scoped work");
  }
  if (!OBJECT_ID.test(tenantId)) {
    throw new TenantContextError(`Malformed tenantId "${tenantId}"`);
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbName: true },
  });
  if (!tenant) {
    throw new TenantContextError(`Tenant ${tenantId} does not exist`);
  }
  if (!tenant.dbName) {
    throw new TenantContextError(
      `Tenant ${tenantId} has no resolvable database`,
    );
  }
  return runWithTenant(tenantId, getClientForDb(tenant.dbName), fn, actor);
}
